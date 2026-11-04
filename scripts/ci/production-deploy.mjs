import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

// Salidas privadas de comandos/proveedores nunca se propagan al log.
export function safeFailure(mode, error) {
  const code = error instanceof DeploymentError &&
    ['STALE_MAIN', 'MAIN_UNAVAILABLE', 'RENDER_QUERY_FAILED', 'RENDER_FAILED',
      'RENDER_TIMEOUT', 'RENDER_AMBIGUOUS', 'VERCEL_COMMAND_FAILED',
      'POSTCHECK_FAILED', 'RENDER_SHA_MISMATCH'].includes(error.code) ? error.code : 'DEPLOYMENT_FAILED';
  return `Etapa=${mode === 'vercel-deploy' ? 'vercel-deploy (Render puede estar actualizado)' : 'despliegue'} resultado=${code}. Revisar paneles antes de reintentar.`;
}

function command(binary, args, env, timeout) {
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== 'win32';
    const child = spawn(binary, args, { env, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', bytes = 0, failed = false, force;
    function stop() {
      failed = true;
      function kill(signal) {
        try { if (grouped && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Proceso ya terminado. */ }
      }
      kill('SIGTERM');
      force ??= setTimeout(() => kill('SIGKILL'), 2000);
    }
    const timer = setTimeout(stop, timeout);
    cancellation.signal.addEventListener('abort', stop, { once: true });
    if (cancellation.signal.aborted) stop();
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) stop();
      else stdout += chunk;
    });
    child.stderr.on('data', () => {});
    function cleanup() {
      clearTimeout(timer); if (!failed) clearTimeout(force);
      cancellation.signal.removeEventListener('abort', stop);
    }
    child.on('error', () => { cleanup(); reject(new DeploymentError('VERCEL_COMMAND_FAILED')); });
    child.on('close', (code) => {
      cleanup();
      if (code !== 0 || failed) reject(new DeploymentError('VERCEL_COMMAND_FAILED'));
      else resolve(stdout.trim());
    });
  });
}

export async function assertCurrentMain(env, readMain = async () => {
  try { return await command('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], env, 10000); }
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

async function cli(args, env) {
  const childEnv = { ...env };
  for (const key of ['RENDER_DEPLOY_HOOK_URL', 'RENDER_API_KEY', 'RENDER_SERVICE_ID']) delete childEnv[key];
  // 6 min build; 3 min deploy; 2 min otros comandos. Sin reintento de mutaciones.
  const minutes = args[0] === 'build' ? 6 : args[0] === 'deploy' ? 3 : 2;
  return command('vercel', [...args, '--token', env.VERCEL_TOKEN], childEnv, minutes * 60000);
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
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const options = { fetchImpl, wait: dependencies.wait ?? pause, attempts: dependencies.healthAttempts ?? 6 };
  preflight(env);
  if (mode === 'preflight') return;
  if (mode === 'render') return deployRender(env);
  if (mode === 'vercel-build') {
    await runCli(['pull', '--yes', '--environment=production'], env);
    const project = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
    if (project.projectId !== env.VERCEL_PROJECT_ID || project.orgId !== env.VERCEL_ORG_ID ||
        project.settings?.rootDirectory?.replace(/\/$/, '') !== 'apps/frontend' ||
        project.settings?.nodeVersion !== '24.x')
      throw new Error('Proyecto Vercel, Root Directory o Node no coinciden con lo esperado.');
    await runCli(['build', '--prod'], env);
    console.log('Build Vercel production preparado.');
    return;
  }
  if (mode === 'vercel-deploy') {
    await assertCurrentMain(env, dependencies.readMain);
    const output = await runCli(['deploy', '--prebuilt', '--prod', '--skip-domain', '--yes',
      '--meta', `githubCommitSha=${env.DEPLOY_SHA}`, '--meta', 'githubCommitRef=main'], env);
    const url = httpsUrl(output);
    if (!url.hostname.endsWith('.vercel.app') || url.search)
      throw new Error('URL de despliegue Vercel no válida.');
    await runCli(['inspect', url.href, '--wait', '--timeout', '90s'], env);
    // inspect JSON omite projectId/meta y renombra alias como aliases.
    // Obtener el objeto autenticado completo; no asumir su forma a partir de CLI.
    const endpoint = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(url.hostname)}`);
    if (env.VERCEL_ORG_ID.startsWith('team_')) endpoint.searchParams.set('teamId', env.VERCEL_ORG_ID);
    async function verify(promoted) {
      const response = await request(endpoint, {
        headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      }, fetchImpl);
      if (!response.ok) throw new DeploymentError('POSTCHECK_FAILED');
      try { verifyVercelDeployment(await response.json(), url, env, promoted); }
      catch { throw new DeploymentError('POSTCHECK_FAILED'); }
    }
    await verify(false);
    await health(new URL('/login', url), false, options);
    // Revalidar después de staging y antes de cambiar el dominio estable.
    await assertCurrentMain(env, dependencies.readMain);
    await runCli(['promote', url.href, '--yes', '--timeout', '90s'], env);
    await verify(true);
    await health(env.FRONTEND_HEALTH_URL, false, options);
    console.log('Vercel: despliegue finalizado; URL inmutable y frontend comprobados.');
    return;
  }
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
