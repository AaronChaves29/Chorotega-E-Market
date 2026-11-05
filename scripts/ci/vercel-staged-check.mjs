import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  command, DeploymentError, safeFailure, assertCurrentMain, assertPrebuiltOutput,
  deploymentReference, vercelEndpoint, vercelRead, releaseIdentity, releaseById,
  existingRelease, readyRelease, verifyVercelDeployment, health,
} from './production-deploy.mjs';

export const TARGET_SHA = 'c338feb55f61bba51da4de7ef63ab455460d87e1';
export const AUTHORIZATION_MARKER = `[authorize-vercel-staged:${TARGET_SHA}]`;
const validatorRoot = fileURLToPath(new URL('../../', import.meta.url));
const cancellation = new AbortController();
const fail = (code) => { throw new DeploymentError(code); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fullSha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && value !== '0'.repeat(40);

function approvedReference(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://github.com' && !url.username && !url.password && !url.search &&
      /^\/AaronChaves29\/Chorotega-E-Market\/(pull|issues)\/\d+$/.test(url.pathname) &&
      /^#issuecomment-\d+$/.test(url.hash);
  } catch { return false; }
}

export function authorizeStaged(env) {
  if (env.GITHUB_REPOSITORY !== 'AaronChaves29/Chorotega-E-Market' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/develop' ||
      env.STAGED_CONFIRMATION !== AUTHORIZATION_MARKER ||
      env.DEPLOY_SHA !== TARGET_SHA || !fullSha(env.STAGED_VALIDATOR_SHA) ||
      !/^dpl_[a-zA-Z0-9]+$/.test(env.STAGED_PREVIOUS_DEPLOYMENT_ID) ||
      !fullSha(env.STAGED_PREVIOUS_SHA) || env.STAGED_PREVIOUS_SHA === TARGET_SHA ||
      env.STAGED_BACKUP_VERIFIED !== 'true' || !approvedReference(env.STAGED_BACKUP_EVIDENCE) ||
      !approvedReference(env.STAGED_APPROVAL_REFERENCE) ||
      env.STAGED_AUTHORIZATION !== `stage:${TARGET_SHA}:${env.STAGED_VALIDATOR_SHA}:${env.STAGED_PREVIOUS_DEPLOYMENT_ID}:${env.STAGED_BACKUP_EVIDENCE}`)
    fail('STAGED_NOT_AUTHORIZED');
  for (const key of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'RENDER_API_KEY', 'RENDER_SERVICE_ID'])
    if (!env[key]?.trim()) fail('STAGED_NOT_AUTHORIZED');
  const url = new URL(env.FRONTEND_HEALTH_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/login')
    fail('STAGED_INVALID_BASELINE');
}

export async function stagedCli(args, env, execute = command) {
  if (!['pull', 'build', 'deploy'].includes(args[0])) fail('STAGED_NOT_AUTHORIZED');
  const childEnv = { ...env };
  for (const key of Object.keys(childEnv))
    if (key.startsWith('RENDER_') || key.startsWith('STAGED_')) delete childEnv[key];
  // The workflow runs on develop, but the CLI builds the fixed main checkout.
  // Do not let runner commit variables identify artifacts as the activation SHA.
  Object.assign(childEnv, { GITHUB_SHA: TARGET_SHA, GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: 'main',
    VERCEL_GIT_COMMIT_SHA: TARGET_SHA, VERCEL_GIT_COMMIT_REF: 'main' });
  for (const key of ['GITHUB_HEAD_REF', 'GITHUB_BASE_REF', 'GITHUB_EVENT_PATH']) delete childEnv[key];
  return execute('vercel', args, childEnv, args[0] === 'build' ? 360000 : args[0] === 'deploy' ? 180000 : 120000, `vercel_${args[0]}`, { signal: cancellation.signal });
}

function optionsFor(deps) {
  return { fetchImpl: deps.fetchImpl ?? fetch, wait: deps.wait ?? wait,
    signal: AbortSignal.any([deps.signal ?? AbortSignal.timeout(8 * 60 * 1000), cancellation.signal]), attempts: deps.attempts ?? 60 };
}

async function sourceIdentity(env, deps) {
  const source = await (deps.readSource?.() ?? command('git', ['rev-parse', 'HEAD'], env, 10000, 'git_main'));
  const validator = await (deps.readValidator?.() ?? command('git', ['-C', validatorRoot, 'rev-parse', 'HEAD'], env, 10000, 'git_main'));
  if (source.trim() !== TARGET_SHA || validator.trim() !== env.STAGED_VALIDATOR_SHA) fail('STAGED_SOURCE_MISMATCH');
  if (deps.checkTracked) await deps.checkTracked();
  else await command('git', ['diff', '--quiet', 'HEAD', '--'], env, 10000, 'git_main');
}

async function baseline(env, options, deps) {
  await assertCurrentMain(env, deps.readMain);
  const project = await vercelRead(vercelEndpoint(`/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}`, env), env, options);
  if (project?.id !== env.VERCEL_PROJECT_ID || project.accountId !== env.VERCEL_ORG_ID ||
      project.rootDirectory !== 'apps/frontend' || project.nodeVersion !== '24.x') fail('STAGED_INVALID_BASELINE');
  const renderUrl = new URL(`https://api.render.com/v1/services/${encodeURIComponent(env.RENDER_SERVICE_ID)}/deploys`);
  renderUrl.searchParams.set('limit', '1');
  const render = await options.fetchImpl(renderUrl, { method: 'GET', redirect: 'error',
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(15000)]),
    headers: { Authorization: `Bearer ${env.RENDER_API_KEY}` } });
  if (!render.ok) fail('STAGED_INVALID_BASELINE');
  const releases = await render.json();
  if (!Array.isArray(releases) || releases[0]?.deploy?.status !== 'live' ||
      releases[0]?.deploy?.commit?.id !== TARGET_SHA) fail('STAGED_INVALID_BASELINE');
  const host = new URL(env.FRONTEND_HEALTH_URL).hostname;
  const alias = await vercelRead(vercelEndpoint(`/v4/aliases/${encodeURIComponent(host)}`, env), env, options);
  if (alias?.alias !== host || alias.projectId !== env.VERCEL_PROJECT_ID ||
      alias.deploymentId !== env.STAGED_PREVIOUS_DEPLOYMENT_ID || alias.redirect) fail('STAGED_ALIAS_CHANGED');
  const previous = await releaseById(env.STAGED_PREVIOUS_DEPLOYMENT_ID, { ...env, DEPLOY_SHA: env.STAGED_PREVIOUS_SHA }, options);
  if (previous.readyState !== 'READY' || previous.aliasAssigned !== true || !previous.alias?.includes(host))
    fail('STAGED_INVALID_BASELINE');
}

export async function preflightStaged(env, deps = {}, options = optionsFor(deps)) {
  authorizeStaged(env);
  await sourceIdentity(env, deps);
  await baseline(env, options, deps);
  const id = await existingRelease(env, options);
  if (id) await releaseById(id, env, options);
  return id;
}

export async function prepareStagedBuild(env, deps) {
  const execute = deps.runCli ?? stagedCli;
  await execute(['pull', '--yes', '--environment=production', '--project', env.VERCEL_PROJECT_ID], env);
  const project = deps.readProject ? deps.readProject() : JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
  if (project?.projectId !== env.VERCEL_PROJECT_ID || project.orgId !== env.VERCEL_ORG_ID ||
      project.settings?.rootDirectory !== 'apps/frontend' || project.settings?.nodeVersion !== '24.x') fail('STAGED_INVALID_BASELINE');
  await execute(['build', '--prod'], env);
  assertPrebuiltOutput(deps);
  await sourceIdentity(env, deps);
}

export async function stagedCheck(mode, env = process.env, deps = {}) {
  if (!['preflight', 'stage'].includes(mode)) fail('STAGED_NOT_AUTHORIZED');
  const options = optionsFor(deps);
  let id = await preflightStaged(env, deps, options);
  if (mode === 'preflight') return;
  if (id) console.log('Vercel staged: candidato existente; no se solicita otra creación.');
  if (!id) {
    await prepareStagedBuild(env, deps);
    await baseline(env, options, deps);
    // Re-read after build: another run/operator may already have created it.
    id = await existingRelease(env, options);
    if (!id) {
      await sourceIdentity(env, deps);
      await assertCurrentMain(env, deps.readMain);
      if (options.signal.aborted) fail('VERCEL_RELEASE_TIMEOUT');
      const execute = deps.runCli ?? stagedCli;
      let reference;
      try {
        console.log('Vercel staged: una solicitud de creación; sin asignación del dominio principal.');
        const output = await execute(['deploy', '--prebuilt', '--prod', '--skip-domain', '--yes', '--no-wait', '--json',
          '--meta', `githubCommitSha=${TARGET_SHA}`, '--meta', 'githubCommitRef=main', '--project', env.VERCEL_PROJECT_ID], env);
        reference = deploymentReference(output);
      } catch (error) {
        // Regardless of CLI exit, only GET reconciliation follows. Never retry deploy.
        console.error(stagedFailure(error));
      }
      if (reference?.id) await releaseById(reference.id, env, options);
      else if (reference?.host) {
        const candidate = releaseIdentity(await vercelRead(vercelEndpoint(`/v13/deployments/${encodeURIComponent(reference.host)}`, env), env, options), env);
        if (candidate.url !== reference.host) fail('VERCEL_RELEASE_INVALID');
        reference = { id: candidate.id };
      }
      for (let read = 0; read < 3 && !id; read++) {
        if (read) await options.wait(read * 1000);
        id = await existingRelease(env, options);
      }
      // Require one complete API-listed candidate even if stdout supplied an ID.
      if (!id) fail('VERCEL_DEPLOY_AMBIGUOUS');
      if (reference?.id && id !== reference.id) fail('VERCEL_DUPLICATES');
    }
  }
  const release = await readyRelease(id, env, options);
  const immutable = new URL(`https://${release.url}`);
  verifyVercelDeployment(release, immutable, env, false);
  await health(new URL('/login', immutable), false, { fetchImpl: options.fetchImpl, wait: options.wait, attempts: deps.healthAttempts ?? 6 });
  await baseline(env, options, deps);
  const listed = await existingRelease(env, options);
  if (listed !== id) fail('VERCEL_DUPLICATES');
  const final = await releaseById(id, env, options);
  if (final.url !== immutable.hostname) fail('VERCEL_RELEASE_INVALID');
  verifyVercelDeployment(final, immutable, env, false);
  await sourceIdentity(env, deps);
  await baseline(env, options, deps);
  await assertCurrentMain(env, deps.readMain);
  console.log(`Vercel staged: READY deployment=${id} sha=${TARGET_SHA}; alias principal conservado; sin Promote.`);
  return id;
}

export function stagedFailure(error) {
  if (error instanceof DeploymentError && ['STAGED_NOT_AUTHORIZED', 'STAGED_INVALID_BASELINE', 'STAGED_ALIAS_CHANGED', 'STAGED_SOURCE_MISMATCH'].includes(error.code))
    return `Vercel staged: ${error.code}. No ejecutar de nuevo sin revisar el estado.`;
  return safeFailure('staged', error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => cancellation.abort());
  void stagedCheck(process.argv[2]).catch((error) => {
    console.error(stagedFailure(error));
    process.exitCode = 1;
  });
}
