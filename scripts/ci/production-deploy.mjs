import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const cancellation = new AbortController();
const pause = (ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(done, ms);
  function done() { cancellation.signal.removeEventListener('abort', abort); resolve(); }
  function abort() { clearTimeout(timer); reject(new Error('Operación cancelada.')); }
  if (cancellation.signal.aborted) abort();
  else cancellation.signal.addEventListener('abort', abort, { once: true });
});

export class DeploymentError extends Error {
  constructor(code) { super(code); this.name = 'DeploymentError'; this.code = code; }
}

const commandLabels = new Set(['vercel_pull', 'vercel_build', 'vercel_deploy', 'vercel_inspect', 'vercel_promote', 'git_main']);
const commandCauses = new Set(['exit_nonzero', 'timeout', 'cancelled', 'spawn_failed', 'output_limit']);
const commandCategories = new Set(['authentication', 'permission', 'project', 'scope', 'not_found', 'invalid_argument', 'network', 'prebuilt_not_found', 'missing_archive', 'deploy_failed', 'upload_failed', 'unknown']);
const contextReasons = new Set(['project_mismatch', 'organization_mismatch', 'root_directory_mismatch', 'node_version_mismatch', 'project_settings_unreadable']);
const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV']);

export function commandCategory(stderr, stdout) {
  // Non-interactive CLI errors can be JSON on stdout. Inspect only controlled
  // reason/code values; never return messages, arguments, hints or next commands.
  const categories = {
    scope_not_accessible: 'scope', scope_not_found: 'scope', missing_scope: 'scope', team_not_found: 'scope',
    project_not_found: 'project', project_unauthorized: 'project', not_linked: 'project', link_required: 'project',
    invalid_token: 'authentication', missing_token: 'authentication', not_authenticated: 'authentication', authentication_required: 'authentication', token_expired: 'authentication', invalid_credentials: 'authentication', unauthorized: 'authentication',
    forbidden: 'permission', permission_denied: 'permission', not_authorized: 'permission', not_domain_owner: 'permission',
    invalid_argument: 'invalid_argument', invalid_arguments: 'invalid_argument', invalid_option: 'invalid_argument',
    prebuilt_not_found: 'prebuilt_not_found', missing_archive: 'missing_archive',
    deploy_failed: 'deploy_failed', upload_failed: 'upload_failed',
    deployment_not_found: 'not_found',
    econnreset: 'network', enotfound: 'network', etimedout: 'network', network_error: 'network', fetch_failed: 'network',
  };
  // Some CLI modes write JSON to stderr or emit one JSON object per line.
  // Inspect bounded buffers only and return literal allowlisted categories.
  for (const channel of [stdout, stderr]) {
    const bounded = channel.slice(0, 8192);
    for (const candidate of [bounded, ...bounded.split('\n')]) {
      let payload;
      try { payload = JSON.parse(candidate); } catch { continue; }
      for (const reason of [payload?.reason, payload?.code, payload?.error?.reason, payload?.error?.code]) {
        if (typeof reason === 'string' && Object.hasOwn(categories, reason.toLowerCase())) return categories[reason.toLowerCase()];
      }
    }
  }
  stderr = stderr.slice(0, 8192);
  if (/no prebuilt output found/i.test(stderr)) return 'prebuilt_not_found';
  if (/scope[-_ ]not[-_ ](?:accessible|existent)|specified scope does not exist|do not have access to the specified account|cannot set your Personal Account as the scope|not able to load teams/i.test(stderr)) return 'scope';
  if (/project[_ ]unauthorized|project not found|could not (?:retrieve|load) project settings|isn[’']t linked to a project|project was either deleted/i.test(stderr)) return 'project';
  if (/unauthorized|invalid token|authentication required|not authenticated/i.test(stderr)) return 'authentication';
  if (/forbidden|permission denied|not authorized|access denied/i.test(stderr)) return 'permission';
  if (/deployment not found|could not find.*deployment/i.test(stderr)) return 'not_found';
  if (/unknown (option|argument)|invalid (option|argument|timeout)|can't use --project with VERCEL_PROJECT_ID/i.test(stderr)) return 'invalid_argument';
  if (/ECONNRESET|ENOTFOUND|ETIMEDOUT|fetch failed|network error/i.test(stderr)) return 'network';
  return 'unknown';
}

// Salidas privadas de comandos/proveedores nunca se propagan al log.
export function safeFailure(mode, error) {
  const code = error instanceof DeploymentError &&
    ['STALE_MAIN', 'MAIN_UNAVAILABLE', 'RENDER_QUERY_FAILED', 'RENDER_FAILED',
      'RENDER_TIMEOUT', 'RENDER_AMBIGUOUS', 'VERCEL_COMMAND_FAILED',
      'POSTCHECK_FAILED', 'RENDER_SHA_MISMATCH', 'RECOVERY_NOT_AUTHORIZED',
      'RECOVERY_INVALID', 'VERCEL_API_FAILED', 'VERCEL_RELEASE_INVALID',
      'VERCEL_RELEASE_TIMEOUT', 'VERCEL_DUPLICATES', 'VERCEL_DEPLOY_AMBIGUOUS',
      'VERCEL_PROMOTION_AMBIGUOUS', 'BACKEND_RELEASE_MISMATCH', 'VERCEL_CONTEXT_INVALID', 'VERCEL_PREBUILT_INVALID'].includes(error.code) ? error.code : 'DEPLOYMENT_FAILED';
  const details = code === 'VERCEL_COMMAND_FAILED' && commandLabels.has(error.command) && commandCauses.has(error.reason)
    ? ` comando=${error.command} causa=${error.reason} exit=${Number.isInteger(error.exitCode) && error.exitCode >= 0 && error.exitCode <= 255 ? error.exitCode : 'unknown'} señal=${signals.has(error.signal) ? error.signal : 'none'} clase=${commandCategories.has(error.category) ? error.category : 'unknown'}`
    : code === 'VERCEL_CONTEXT_INVALID' && contextReasons.has(error.reason) ? ` causa=${error.reason}` : '';
  return `Etapa=${mode === 'vercel-deploy' ? 'vercel-deploy (Render puede estar actualizado)' : mode === 'vercel-recover' ? 'vercel-recover' : mode === 'vercel-build' ? 'vercel-build' : 'despliegue'} resultado=${code}${details}. Revisar paneles antes de reintentar.`;
}

// Exported to test the real process runner with synthetic Node subprocesses.
export function command(binary, args, env, timeout, label = 'vercel_deploy', {
  signal = cancellation.signal, maxOutputBytes = 16 * 1024 * 1024,
} = {}) {
  if (!commandLabels.has(label)) throw new DeploymentError('VERCEL_COMMAND_FAILED');
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== 'win32';
    let child;
    try { child = spawn(binary, args, { env, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch {
      reject(Object.assign(new DeploymentError('VERCEL_COMMAND_FAILED'), {
        command: label, reason: 'spawn_failed', exitCode: null, signal: null, category: 'unknown',
      }));
      return;
    }
    let stdout = '', stdoutDiagnostic = '', stdoutDiagnosticBytes = 0, stderr = '', stderrBytes = 0, bytes = 0, reason, force;
    function stop(cause) {
      reason ??= cause;
      function kill(signal) {
        try { if (grouped && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Proceso ya terminado. */ }
      }
      kill('SIGTERM');
      force ??= setTimeout(() => kill('SIGKILL'), 2000);
    }
    const timer = setTimeout(() => stop('timeout'), timeout);
    const abort = () => stop('cancelled');
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on('data', (chunk) => {
      const retained = chunk.subarray(0, Math.max(0, 8192 - stdoutDiagnosticBytes));
      stdoutDiagnosticBytes += retained.length;
      stdoutDiagnostic += retained.toString('utf8');
      bytes += chunk.length;
      if (bytes > maxOutputBytes) stop('output_limit');
      else stdout += chunk;
    });
    // Keep at most 8 KiB for classification. Never return or print raw stderr.
    child.stderr.on('data', (chunk) => {
      const retained = chunk.subarray(0, Math.max(0, 8192 - stderrBytes));
      stderrBytes += retained.length;
      stderr += retained.toString('utf8');
    });
    function failure(cause, code, childSignal) {
      return Object.assign(new DeploymentError('VERCEL_COMMAND_FAILED'), {
        command: label, reason: cause,
        exitCode: Number.isInteger(code) && code >= 0 && code <= 255 ? code : null,
        signal: signals.has(childSignal) ? childSignal : null,
        category: commandCategory(stderr, stdoutDiagnostic),
      });
    }
    function cleanup() {
      clearTimeout(timer); if (!reason) clearTimeout(force);
      signal.removeEventListener('abort', abort);
    }
    child.on('error', () => { cleanup(); reject(failure('spawn_failed')); });
    child.on('close', (code, childSignal) => {
      cleanup();
      if (code !== 0 || reason) reject(failure(reason ?? 'exit_nonzero', code, childSignal));
      else resolve(stdout.trim());
    });
  });
}

export async function assertCurrentMain(env, readMain = async () => {
  try { return await command('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], env, 10000, 'git_main'); }
  catch { throw new DeploymentError('MAIN_UNAVAILABLE'); }
}) {
  const sha = (await readMain()).trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new DeploymentError('MAIN_UNAVAILABLE');
  if (sha !== env.DEPLOY_SHA) throw new DeploymentError('STALE_MAIN');
}
const required = [
  'DEPLOY_SHA', 'RENDER_DEPLOY_HOOK_URL', 'RENDER_API_KEY', 'RENDER_SERVICE_ID',
  'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID',
  'BACKEND_HEALTH_URL', 'FRONTEND_HEALTH_URL',
];

function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('URL HTTPS de despliegue no válida.');
  return url;
}

export function preflight(env) {
  if (required.some((key) => !env[key]?.trim()))
    throw new Error('Falta configuración de despliegue; revise Secrets y Variables.');
  if (!/^[a-f0-9]{40}$/.test(env.DEPLOY_SHA)) throw new Error('SHA no válido.');
  const hook = httpsUrl(env.RENDER_DEPLOY_HOOK_URL);
  if (hook.hostname !== 'api.render.com' ||
      hook.pathname !== `/deploy/${env.RENDER_SERVICE_ID}` || !hook.searchParams.get('key'))
    throw new Error('El hook no corresponde al servicio Render configurado.');
  for (const name of ['BACKEND_HEALTH_URL', 'FRONTEND_HEALTH_URL']) {
    const url = httpsUrl(env[name]);
    if (url.search) throw new Error('Health no debe incluir parámetros privados.');
  }
}

async function request(url, options, fetchImpl) {
  // Nunca imprimir URL, body ni errores del proveedor (pueden contener secretos).
  return fetchImpl(url, { ...options, redirect: 'error', signal:
    AbortSignal.any([cancellation.signal, options?.signal ?? AbortSignal.timeout(15000), AbortSignal.timeout(15000)]) });
}

export async function health(url, backend, { fetchImpl = fetch, wait = pause, attempts = 6 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await request(url, {}, fetchImpl);
      if (response.status === 200) {
        if (backend && (await response.json()).status === 'connected') return;
        if (!backend && response.headers.get('content-type')?.includes('text/html')) {
          const html = await response.text();
          if (html.includes('Chorotega') && /id=["']login-title["']/.test(html) &&
              /id=["']correo["']/.test(html) && /id=["']clave["']/.test(html)) return;
        }
      }
    } catch { if (cancellation.signal.aborted) throw new DeploymentError('POSTCHECK_FAILED'); }
    if (i + 1 < attempts) await wait(5000);
  }
  throw new DeploymentError('POSTCHECK_FAILED');
}

async function renderQuery(endpoint, env, fetchImpl, wait, signal) {
  for (let retry = 0; retry < 3; retry++) {
    try {
      const response = await request(endpoint, {
        headers: { Authorization: `Bearer ${env.RENDER_API_KEY}` }, signal,
      }, fetchImpl);
      if (response.ok) return await response.json();
      if (![408, 429, 500, 502, 503, 504].includes(response.status))
        throw new DeploymentError('RENDER_QUERY_FAILED');
    } catch (error) {
      if (error instanceof DeploymentError) throw error;
    }
    if (signal.aborted || cancellation.signal.aborted) throw new DeploymentError('RENDER_TIMEOUT');
    if (retry < 2) await wait(1000 * 2 ** retry);
  }
  throw new DeploymentError('RENDER_QUERY_FAILED');
}

export async function deployRender(env, { fetchImpl = fetch, wait = pause, attempts = 60,
  readMain, signal = AbortSignal.timeout(10 * 60 * 1000) } = {}) {
  const hook = new URL(env.RENDER_DEPLOY_HOOK_URL);
  hook.searchParams.set('ref', env.DEPLOY_SHA);
  await assertCurrentMain(env, readMain);
  if (signal.aborted || cancellation.signal.aborted) throw new DeploymentError('RENDER_TIMEOUT');
  // Una sola solicitud: reintentar el hook podría crear despliegues duplicados.
  let accepted;
  try { accepted = await request(hook, { method: 'POST', signal }, fetchImpl); }
  catch { throw new DeploymentError('RENDER_AMBIGUOUS'); }
  if (accepted.status !== 200)
    throw new DeploymentError('RENDER_AMBIGUOUS');
  let deploy;
  try { ({ deploy } = await accepted.json()); }
  catch { throw new DeploymentError('RENDER_AMBIGUOUS'); }
  if (!deploy || !/^dep-[a-zA-Z0-9]+$/.test(deploy.id))
    throw new DeploymentError('RENDER_AMBIGUOUS');
  const endpoint = `https://api.render.com/v1/services/${encodeURIComponent(env.RENDER_SERVICE_ID)}/deploys/${deploy.id}`;
  for (let i = 0; i < attempts; i++) {
    if (signal.aborted || cancellation.signal.aborted) throw new DeploymentError('RENDER_TIMEOUT');
    const result = await renderQuery(endpoint, env, fetchImpl, wait, signal);
    if (['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'].includes(result.status))
      throw new DeploymentError('RENDER_FAILED');
    if (result.status === 'live') {
      if (result.commit?.id !== env.DEPLOY_SHA)
        throw new DeploymentError('RENDER_SHA_MISMATCH');
      await health(env.BACKEND_HEALTH_URL, true, { fetchImpl, wait });
      console.log('Render: SHA aprobado live; health satisfactorio.');
      return;
    }
    if (i + 1 < attempts) await wait(10000);
  }
  throw new DeploymentError('RENDER_TIMEOUT');
}

export async function cli(args, env, execute = command) {
  const childEnv = { ...env };
  for (const key of ['RENDER_DEPLOY_HOOK_URL', 'RENDER_API_KEY', 'RENDER_SERVICE_ID']) delete childEnv[key];
  // 6 min build; 3 min deploy; 2 min otros comandos. Sin reintento de mutaciones.
  const minutes = args[0] === 'build' ? 6 : args[0] === 'deploy' ? 3 : 2;
  // CLI 65.4.0 supports VERCEL_TOKEN directly; keep it out of process arguments.
  // pull/deploy support explicit project IDs in 65.4.0. Avoid the global
  // --scope discovery path for those commands; pin team via ORG_ID env.
  const contextArgs = ['pull', 'deploy'].includes(args[0]) ? ['--project', env.VERCEL_PROJECT_ID] : ['--scope', env.VERCEL_ORG_ID];
  return execute('vercel', [...args, ...contextArgs], childEnv, minutes * 60000, `vercel_${args[0]}`);
}

export function assertPrebuiltOutput({ readPrebuilt = () => {
  // This workflow uses pull's per-project link at the Git root, not a repo link.
  // CLI 65.4.0 resolves output at cwd/.vercel/output in this mode, even when
  // project.settings.rootDirectory is apps/frontend. Never guess another path.
  if (existsSync('.vercel/repo.json')) throw new Error();
  return {
    config: JSON.parse(readFileSync('.vercel/output/config.json', 'utf8')),
    builds: JSON.parse(readFileSync('.vercel/output/builds.json', 'utf8')),
  };
} } = {}) {
  try {
    const { config, builds } = readPrebuilt();
    if (config?.version !== 3 || builds?.target !== 'production' || builds.error ||
        (builds.builds !== undefined && (!Array.isArray(builds.builds) ||
          builds.builds.some((build) => !build || typeof build !== 'object' || 'error' in build)))) throw new Error();
  } catch {
    // Do not attach the original parse/IO error: build files can contain secrets.
    throw new DeploymentError('VERCEL_PREBUILT_INVALID');
  }
}

function vercelEndpoint(path, env) {
  const url = new URL(path, 'https://api.vercel.com');
  if (env.VERCEL_ORG_ID.startsWith('team_')) url.searchParams.set('teamId', env.VERCEL_ORG_ID);
  return url;
}

// Only GETs retry. A malformed reply, auth/permission error or other 4xx fails closed.
async function vercelRead(url, env, { fetchImpl, wait, signal }) {
  for (let retry = 0; retry < 3; retry++) {
    if (signal.aborted || cancellation.signal.aborted) throw new DeploymentError('VERCEL_RELEASE_TIMEOUT');
    try {
      const result = await request(url, {
        headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` }, signal,
      }, fetchImpl);
      if (result.ok) {
        try { return await result.json(); }
        catch { throw new DeploymentError('VERCEL_API_FAILED'); }
      }
      if (![408, 429, 500, 502, 503, 504].includes(result.status)) throw new DeploymentError('VERCEL_API_FAILED');
    } catch (error) {
      if (error instanceof DeploymentError) throw error;
    }
    if (retry < 2) await wait(1000 * 2 ** retry);
  }
  throw new DeploymentError(signal.aborted ? 'VERCEL_RELEASE_TIMEOUT' : 'VERCEL_API_FAILED');
}

function releaseIdentity(result, env, expectedId) {
  const owner = result?.ownerId ?? result?.teamId ?? result?.team?.id;
  if (!result || !/^dpl_[a-zA-Z0-9]+$/.test(result.id) ||
      (expectedId && result.id !== expectedId) ||
      (owner != null && owner !== env.VERCEL_ORG_ID) ||
      result.projectId !== env.VERCEL_PROJECT_ID || result.target !== 'production' ||
      result.meta?.githubCommitSha !== env.DEPLOY_SHA || result.meta?.githubCommitRef !== 'main' ||
      result.error || result.errorCode || result.errorMessage || result.aliasError ||
      result.checksConclusion === 'failed' || result.checks?.['deployment-alias']?.state === 'failed')
    throw new DeploymentError('VERCEL_RELEASE_INVALID');
  // Incomplete uploads may have no URL yet; READY must have an immutable host.
  if (result.url != null && (!/^[a-zA-Z0-9-]+\.vercel\.app$/.test(result.url) ||
      result.url === new URL(env.FRONTEND_HEALTH_URL).hostname))
    throw new DeploymentError('VERCEL_RELEASE_INVALID');
  if (!['INITIALIZING', 'QUEUED', 'BUILDING', 'READY'].includes(result.readyState))
    throw new DeploymentError('VERCEL_RELEASE_INVALID');
  if (result.readyState === 'READY' && !result.url) throw new DeploymentError('VERCEL_RELEASE_INVALID');
  return result;
}

async function projectScope(env, options) {
  // The deployment's public/reduced schema may omit ownerId. Establish ownership
  // from the authenticated project record, never infer it from a successful GET.
  const project = await vercelRead(vercelEndpoint(`/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}`, env), env, options);
  if (project?.id !== env.VERCEL_PROJECT_ID || project.accountId !== env.VERCEL_ORG_ID)
    throw new DeploymentError('VERCEL_RELEASE_INVALID');
}

async function releaseById(id, env, options) {
  const data = await vercelRead(vercelEndpoint(`/v13/deployments/${encodeURIComponent(id)}`, env), env, options);
  return releaseIdentity(data, env, id);
}

async function existingRelease(env, options) {
  // The documented SHA filter narrows results. Validate metadata again locally.
  // Never create if the bounded search is incomplete or multiple releases match.
  const url = vercelEndpoint('/v7/deployments', env);
  url.searchParams.set('projectId', env.VERCEL_PROJECT_ID);
  url.searchParams.set('target', 'production');
  url.searchParams.set('sha', env.DEPLOY_SHA);
  url.searchParams.set('limit', '100');
  const ids = new Set();
  const cursors = new Set();
  for (let page = 0; page < 5; page++) {
    const data = await vercelRead(url, env, options);
    if (!Array.isArray(data?.deployments) || !data.pagination || !Object.hasOwn(data.pagination, 'next'))
      throw new DeploymentError('VERCEL_API_FAILED');
    for (const item of data.deployments) {
      if (!item || !item.meta || typeof item.meta !== 'object') throw new DeploymentError('VERCEL_API_FAILED');
      if (item.meta.githubCommitSha !== env.DEPLOY_SHA || item.meta.githubCommitRef !== 'main') continue;
      const id = item.uid ?? item.id;
      if (!/^dpl_[a-zA-Z0-9]+$/.test(id)) throw new DeploymentError('VERCEL_API_FAILED');
      ids.add(id);
    }
    if (ids.size > 1) throw new DeploymentError('VERCEL_DUPLICATES');
    const next = data.pagination.next;
    if (next == null) return ids.size ? [...ids][0] : null;
    const cursor = typeof next === 'string' && /^\d+$/.test(next) ? Number(next) : next;
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursors.has(cursor)) throw new DeploymentError('VERCEL_API_FAILED');
    cursors.add(cursor); url.searchParams.set('until', String(cursor));
  }
  throw new DeploymentError('VERCEL_API_FAILED');
}

async function readyRelease(id, env, options) {
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    const result = await releaseById(id, env, options);
    if (result.readyState === 'READY') return result;
    if (attempt + 1 < options.attempts) await options.wait(5000);
  }
  throw new DeploymentError('VERCEL_RELEASE_TIMEOUT');
}

async function backendRelease(env, options) {
  const url = new URL(`https://api.render.com/v1/services/${encodeURIComponent(env.RENDER_SERVICE_ID)}/deploys`);
  url.searchParams.set('limit', '1');
  const releases = await renderQuery(url, env, options.fetchImpl, options.wait, options.signal);
  const current = Array.isArray(releases) && releases[0]?.deploy;
  if (current?.status !== 'live' || current.commit?.id !== env.DEPLOY_SHA)
    throw new DeploymentError('BACKEND_RELEASE_MISMATCH');
  await health(env.BACKEND_HEALTH_URL, true, options.health);
}

async function aliasPointsTo(id, env, options) {
  const host = new URL(env.FRONTEND_HEALTH_URL).hostname;
  const alias = await vercelRead(vercelEndpoint(`/v4/aliases/${encodeURIComponent(host)}`, env), env, options);
  return alias?.alias === host && alias.projectId === env.VERCEL_PROJECT_ID &&
    alias.deploymentId === id && !alias.redirect;
}

function ambiguousCommand(error) {
  return error instanceof DeploymentError && error.code === 'VERCEL_COMMAND_FAILED' &&
    !['authentication', 'permission', 'project', 'scope', 'invalid_argument', 'not_found', 'prebuilt_not_found'].includes(error.category) &&
    !['cancelled', 'spawn_failed', 'output_limit'].includes(error.reason) && !cancellation.signal.aborted;
}

export function deploymentReference(output) {
  let parsed;
  try { parsed = JSON.parse(output); } catch { /* Legacy CLI stdout can be a URL. */ }
  if (parsed?.status === 'error') return null;
  const id = parsed?.deployment?.id ?? parsed?.id;
  if (typeof id === 'string' && /^dpl_[a-zA-Z0-9]+$/.test(id)) return { id };
  const candidate = parsed?.deployment?.url ?? parsed?.url ?? (typeof parsed === 'string' ? parsed : output);
  if (typeof candidate !== 'string') return null;
  try {
    const url = httpsUrl(candidate.startsWith('https://') ? candidate : `https://${candidate}`);
    if (/^[a-zA-Z0-9-]+\.vercel\.app$/.test(url.hostname) && !url.port && url.pathname === '/' && !url.search)
      return { host: url.hostname };
  } catch { /* Untrusted stdout is never a fetch target or a diagnostic. */ }
  return null;
}

export async function automaticVercel(env, dependencies = {}) {
  const options = {
    fetchImpl: dependencies.fetchImpl ?? fetch, wait: dependencies.wait ?? pause,
    signal: dependencies.vercelSignal ?? AbortSignal.timeout(8 * 60 * 1000),
    attempts: dependencies.vercelAttempts ?? 60,
  };
  options.health = { fetchImpl: options.fetchImpl, wait: options.wait, attempts: dependencies.healthAttempts ?? 6 };
  const runCli = dependencies.runCli ?? cli;
  const checkMain = () => assertCurrentMain(env, dependencies.readMain);
  const budget = () => {
    if (options.signal.aborted || cancellation.signal.aborted) throw new DeploymentError('VERCEL_RELEASE_TIMEOUT');
  };
  await checkMain();
  await projectScope(env, options);
  // This GET search is mandatory even on a fresh run; no duplicate mutation on rerun.
  let id = await existingRelease(env, options);
  if (!id) {
    await backendRelease(env, options);
    await projectScope(env, options);
    await checkMain();
    budget();
    try {
      const output = await runCli(['deploy', '--prebuilt', '--prod', '--skip-domain', '--yes', '--no-wait', '--json',
        '--meta', `githubCommitSha=${env.DEPLOY_SHA}`, '--meta', 'githubCommitRef=main'], env);
      const reference = deploymentReference(output);
      if (reference?.id) id = reference.id;
      else if (reference?.host) {
        // The URL is only an API lookup key, never authority to promote/fetch it.
        const result = releaseIdentity(await vercelRead(vercelEndpoint(`/v13/deployments/${encodeURIComponent(reference.host)}`, env), env, options), env);
        if (result.url !== reference.host) throw new DeploymentError('VERCEL_RELEASE_INVALID');
        id = result.id;
      }
    } catch (error) {
      if (!ambiguousCommand(error)) throw error;
      console.error(safeFailure('vercel-deploy', error));
    }
    if (!id) {
      // A mutation can succeed remotely before the CLI fails. Limited read-only reconciliation.
      for (let read = 0; read < 3 && !id; read++) {
        if (read) await options.wait(1000 * read);
        id = await existingRelease(env, options);
      }
      if (!id) throw new DeploymentError('VERCEL_DEPLOY_AMBIGUOUS');
    }
    // Even a valid CLI ID must not hide a concurrent candidate for this SHA.
    const listed = await existingRelease(env, options);
    if (listed && listed !== id) throw new DeploymentError('VERCEL_DUPLICATES');
  }
  let release = await readyRelease(id, env, options);
  const immutable = new URL(`https://${release.url}`);
  const host = new URL(env.FRONTEND_HEALTH_URL).hostname;
  await backendRelease(env, options);
  await health(new URL('/login', immutable), false, options.health);
  await checkMain();
  if (await aliasPointsTo(id, env, options)) {
    // Idempotent rerun of a completed release: no second promotion, but all checks still run.
    for (let attempt = 0; attempt < options.attempts &&
        !(release.aliasAssigned === true && release.alias?.includes(host)); attempt++) {
      if (attempt) await options.wait(5000);
      release = await releaseById(id, env, options);
    }
    verifyVercelDeployment(release, immutable, env, true);
  } else {
    verifyVercelDeployment(release, immutable, env, false);
    release = await releaseById(id, env, options);
    if (release.readyState !== 'READY' || release.url !== immutable.hostname || release.alias?.includes(host))
      throw new DeploymentError('VERCEL_RELEASE_INVALID');
    await backendRelease(env, options);
    await projectScope(env, options);
    await checkMain();
    budget();
    let promotionAmbiguous = false;
    try { await runCli(['promote', id, '--yes', '--timeout', '90s'], env); }
    catch (error) {
      if (!ambiguousCommand(error)) throw error;
      promotionAmbiguous = true;
      console.error(safeFailure('vercel-deploy', error));
    }
    let complete = false;
    for (let attempt = 0; attempt < options.attempts; attempt++) {
      release = await releaseById(id, env, options);
      if (release.readyState !== 'READY' || release.url !== immutable.hostname) throw new DeploymentError('VERCEL_RELEASE_INVALID');
      if (release.aliasAssigned === true && release.alias?.includes(host) && await aliasPointsTo(id, env, options)) {
        complete = true; break;
      }
      if (attempt + 1 < options.attempts) await options.wait(5000);
    }
    if (!complete) throw new DeploymentError(promotionAmbiguous ? 'VERCEL_PROMOTION_AMBIGUOUS' : 'POSTCHECK_FAILED');
  }
  await checkMain();
  await projectScope(env, options);
  await backendRelease(env, options);
  await health(env.FRONTEND_HEALTH_URL, false, options.health);
  const finalRelease = await releaseById(id, env, options);
  verifyVercelDeployment(finalRelease, immutable, env, true);
  if (!await aliasPointsTo(id, env, options)) throw new DeploymentError('POSTCHECK_FAILED');
  await checkMain();
  console.log('Vercel: API confirma SHA/READY, alias y frontend; backend verificado.');
}

function recoveryReference(value) {
  if (typeof value !== 'string') throw new DeploymentError('RECOVERY_INVALID');
  if (/^dpl_[a-zA-Z0-9]+$/.test(value)) return value;
  const url = httpsUrl(value);
  if (!/^[a-zA-Z0-9-]+\.vercel\.app$/.test(url.hostname) || url.port ||
      url.pathname !== '/' || url.search) throw new DeploymentError('RECOVERY_INVALID');
  return url.hostname;
}

export async function recoverVercel(env, { fetchImpl = fetch, wait = pause,
  runCli = cli, readMain, healthAttempts = 6 } = {}) {
  // Recovery deliberately does not require or use a Render hook/API credential.
  for (const key of ['DEPLOY_SHA', 'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'BACKEND_HEALTH_URL', 'FRONTEND_HEALTH_URL'])
    if (!env[key]?.trim()) throw new DeploymentError('RECOVERY_INVALID');
  if (!/^[a-f0-9]{40}$/.test(env.DEPLOY_SHA)) throw new DeploymentError('RECOVERY_INVALID');
  for (const key of ['BACKEND_HEALTH_URL', 'FRONTEND_HEALTH_URL'])
    if (httpsUrl(env[key]).search) throw new DeploymentError('RECOVERY_INVALID');
  const reference = recoveryReference(env.RECOVERY_DEPLOYMENT);
  const endpoint = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(reference)}`);
  if (env.VERCEL_ORG_ID.startsWith('team_')) endpoint.searchParams.set('teamId', env.VERCEL_ORG_ID);
  let deploymentId, immutableUrl;
  async function verify(promoted) {
    const response = await request(endpoint, { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` } }, fetchImpl);
    if (!response.ok) throw new DeploymentError('POSTCHECK_FAILED');
    const result = await response.json();
    if (!/^dpl_[a-zA-Z0-9]+$/.test(result.id) ||
        (reference.startsWith('dpl_') ? result.id !== reference : result.url !== reference) ||
        (deploymentId && result.id !== deploymentId) ||
        (result.ownerId ?? result.teamId ?? result.team?.id) !== env.VERCEL_ORG_ID ||
        result.error || result.errorCode || result.errorMessage || result.checksConclusion === 'failed' ||
        result.checks?.['deployment-alias']?.state === 'failed') throw new DeploymentError('POSTCHECK_FAILED');
    const url = new URL(`https://${result.url}`);
    if (recoveryReference(url.href) !== result.url || (immutableUrl && url.href !== immutableUrl.href))
      throw new DeploymentError('POSTCHECK_FAILED');
    try { verifyVercelDeployment(result, url, env, promoted); }
    catch { throw new DeploymentError('POSTCHECK_FAILED'); }
    deploymentId = result.id;
    immutableUrl = url;
  }
  await assertCurrentMain(env, readMain);
  await verify(false);
  const options = { fetchImpl, wait, attempts: healthAttempts };
  await health(env.BACKEND_HEALTH_URL, true, options);
  await health(new URL('/login', immutableUrl), false, options);
  // Re-read identity immediately before promotion; never create another deployment.
  await verify(false);
  await assertCurrentMain(env, readMain);
  if (env.RECOVERY_PROMOTION_AUTHORIZATION !== `promote:${env.DEPLOY_SHA}:${deploymentId}`)
    throw new DeploymentError('RECOVERY_NOT_AUTHORIZED');
  await runCli(['promote', immutableUrl.href, '--yes', '--timeout', '90s'], env);
  await verify(true);
  await health(env.FRONTEND_HEALTH_URL, false, options);
  console.log('Vercel: recuperación del deployment existente comprobada.');
}

export function verifyVercelDeployment(result, url, env, promoted = true) {
  const productionHost = new URL(env.FRONTEND_HEALTH_URL).hostname;
  if (result.readyState !== 'READY' || result.target !== 'production' ||
      result.projectId !== env.VERCEL_PROJECT_ID || result.url !== url.hostname ||
      result.meta?.githubCommitSha !== env.DEPLOY_SHA ||
      result.meta?.githubCommitRef !== 'main' || result.aliasError ||
      (!promoted && result.alias?.includes(productionHost)) ||
      (promoted && (result.aliasAssigned !== true || !Array.isArray(result.alias) ||
      !result.alias.includes(productionHost))))
    throw new Error('Vercel no confirma estado READY, proyecto, SHA y dominio productivo esperados.');
}

export async function main(mode, env = process.env, dependencies = {}) {
  const runCli = dependencies.runCli ?? cli;
  if (mode === 'vercel-recover') return recoverVercel(env, dependencies);
  preflight(env);
  if (mode === 'preflight') return;
  if (mode === 'render') {
    assertPrebuiltOutput(dependencies);
    return deployRender(env, dependencies);
  }
  if (mode === 'vercel-build') {
    await runCli(['pull', '--yes', '--environment=production'], env);
    let project;
    const contextError = (reason) => Object.assign(new DeploymentError('VERCEL_CONTEXT_INVALID'), { reason });
    try { project = dependencies.readProject ? await dependencies.readProject() : JSON.parse(readFileSync('.vercel/project.json', 'utf8')); }
    catch { throw contextError('project_settings_unreadable'); }
    if (project?.projectId !== env.VERCEL_PROJECT_ID) throw contextError('project_mismatch');
    if (project.orgId !== env.VERCEL_ORG_ID) throw contextError('organization_mismatch');
    if (typeof project.settings?.rootDirectory !== 'string' || project.settings.rootDirectory.replace(/\/$/, '') !== 'apps/frontend')
      throw contextError('root_directory_mismatch');
    if (project.settings?.nodeVersion !== '24.x') throw contextError('node_version_mismatch');
    await runCli(['build', '--prod'], env);
    assertPrebuiltOutput(dependencies);
    console.log('Build Vercel production preparado.');
    return;
  }
  if (mode === 'vercel-deploy') return automaticVercel(env, dependencies);
  throw new Error('Modo de despliegue no válido.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => cancellation.abort());
  main(process.argv[2]).catch((error) => {
    // El detalle original puede contener un hook, token, URL o respuesta privada.
    console.error(safeFailure(process.argv[2], error));
    process.exitCode = 1;
  });
}
