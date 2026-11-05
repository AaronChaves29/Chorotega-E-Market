import { pathToFileURL } from 'node:url';
import {
  DeploymentError,
  vercelRead,
  vercelEndpoint,
  existingRelease,
  releaseById,
  verifyVercelDeployment,
} from './production-deploy.mjs';

export const EXPECTED = Object.freeze({
  repository: 'AaronChaves29/Chorotega-E-Market',
  sha: 'c338feb55f61bba51da4de7ef63ab455460d87e1',
  deploymentId: 'dpl_2RA5JfKczFobQfTwmLPqQV8RrBRB',
  host: 'chorotega-e-market-frontend-cpfl6ruvb.vercel.app',
  previousId: 'dpl_EjxFbBNH25mYAQ5oNxx2QCZT5pPP',
  previousSha: '9e353f372c38cb03125074f7b528de5bcc45ab21',
  primaryHost: 'chorotega-e-market-frontend.vercel.app',
  projectId: 'prj_CQzkdYWJ5ZADA1glPpRz9Ak2kOpx',
  teamId: 'team_sqLO7uNfDqUIdILp5Hmdep5n',
  audience: 'https://github.com/AaronChaves29',
});
export const READONLY_MARKER = `[verify-vercel-staged:${EXPECTED.deploymentId}]`;
const loginUrl = `https://${EXPECTED.host}/login`;
const errors = new Set([
  'VERIFY_NOT_AUTHORIZED',
  'VERIFY_CI_FAILED',
  'VERIFY_MAIN_CHANGED',
  'VERIFY_BASELINE_CHANGED',
  'VERIFY_OIDC_FAILED',
  'VERIFY_AUTH_REJECTED',
  'VERIFY_REDIRECT',
  'VERIFY_HTTP_FAILED',
  'VERIFY_HTML_INVALID',
  'VERIFY_REQUEST_FAILED',
  'VERCEL_DUPLICATES',
  'VERCEL_API_FAILED',
  'VERCEL_RELEASE_INVALID',
  'VERCEL_RELEASE_TIMEOUT',
]);
const fail = (code) => {
  throw new DeploymentError(code);
};

export function authorizeReadOnly(env) {
  if (
    env.GITHUB_REPOSITORY !== EXPECTED.repository ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REF !== 'refs/heads/develop' ||
    env.VERIFY_CONFIRMATION !== READONLY_MARKER ||
    env.VERIFY_TRUST_CONFIGURED !== 'true' ||
    !/^[a-f0-9]{40}$/.test(env.VERIFY_CODE_SHA) ||
    env.VERIFY_CODE_SHA === '0'.repeat(40) ||
    env.VERCEL_PROJECT_ID !== EXPECTED.projectId ||
    env.VERCEL_ORG_ID !== EXPECTED.teamId ||
    !env.VERCEL_TOKEN?.trim() ||
    !env.GITHUB_TOKEN?.trim()
  )
    fail('VERIFY_NOT_AUTHORIZED');
}

function readContext(deps) {
  const signal = deps.signal ?? AbortSignal.timeout(120000);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchRead = async (input, options = {}) => {
    const url = new URL(input);
    const known =
      ['api.vercel.com', 'api.github.com', EXPECTED.host].includes(
        url.hostname,
      ) || /(^|\.)actions\.githubusercontent\.com$/.test(url.hostname);
    if (
      signal.aborted ||
      options.signal?.aborted ||
      !known ||
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      (options.method ?? 'GET') !== 'GET'
    )
      fail('VERIFY_REQUEST_FAILED');
    try {
      return await fetchImpl(url, {
        ...options,
        method: 'GET',
        redirect: options.redirect ?? 'error',
        signal: AbortSignal.any([
          signal,
          options.signal ?? signal,
          AbortSignal.timeout(15000),
        ]),
      });
    } catch {
      fail('VERIFY_REQUEST_FAILED');
    }
  };
  return {
    fetchImpl: fetchRead,
    signal,
    wait:
      deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
}

async function githubRead(path, env, options) {
  const result = await options.fetchImpl(
    new URL(path, 'https://api.github.com'),
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );
  if (result.status !== 200) fail('VERIFY_CI_FAILED');
  try {
    return await result.json();
  } catch {
    fail('VERIFY_CI_FAILED');
  }
}

async function reviewedCI(env, options) {
  const root = `/repos/${EXPECTED.repository}`;
  const runs = await githubRead(
    `${root}/actions/runs?head_sha=${env.VERIFY_CODE_SHA}&branch=develop&event=push&per_page=100`,
    env,
    options,
  );
  if (
    !Array.isArray(runs.workflow_runs) ||
    !Number.isSafeInteger(runs.total_count) ||
    runs.total_count !== runs.workflow_runs.length
  )
    fail('VERIFY_CI_FAILED');
  const candidates = runs.workflow_runs.filter(
    (run) => run.path === '.github/workflows/ci.yml',
  );
  if (!candidates.every((run) => Number.isSafeInteger(run.id) && run.id > 0))
    fail('VERIFY_CI_FAILED');
  const run = candidates.sort((a, b) => b.id - a.id)[0];
  if (
    !run ||
    run.head_sha !== env.VERIFY_CODE_SHA ||
    run.head_branch !== 'develop' ||
    run.event !== 'push' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  )
    fail('VERIFY_CI_FAILED');
  const jobs = await githubRead(
    `${root}/actions/runs/${run.id}/jobs?per_page=100&filter=latest`,
    env,
    options,
  );
  if (
    !Array.isArray(jobs.jobs) ||
    !Number.isSafeInteger(jobs.total_count) ||
    jobs.total_count !== jobs.jobs.length ||
    !['Build Backend', 'Build Frontend'].every((name) =>
      jobs.jobs.some(
        (job) =>
          job.name === name &&
          job.status === 'completed' &&
          job.conclusion === 'success',
      ),
    )
  )
    fail('VERIFY_CI_FAILED');
}

async function baseline(env, options) {
  const main = await githubRead(
    `/repos/${EXPECTED.repository}/git/ref/heads/main`,
    env,
    options,
  );
  if (main?.ref !== 'refs/heads/main' || main.object?.sha !== EXPECTED.sha)
    fail('VERIFY_MAIN_CHANGED');
  const project = await vercelRead(
    vercelEndpoint(`/v9/projects/${EXPECTED.projectId}`, env),
    env,
    options,
  );
  if (
    project?.id !== EXPECTED.projectId ||
    project.accountId !== EXPECTED.teamId
  )
    fail('VERIFY_BASELINE_CHANGED');
  const identity = {
    ...env,
    DEPLOY_SHA: EXPECTED.sha,
    FRONTEND_HEALTH_URL: `https://${EXPECTED.primaryHost}/login`,
  };
  if ((await existingRelease(identity, options)) !== EXPECTED.deploymentId)
    fail('VERIFY_BASELINE_CHANGED');
  const candidate = await releaseById(EXPECTED.deploymentId, identity, options);
  if (candidate.url !== EXPECTED.host || candidate.readyState !== 'READY')
    fail('VERIFY_BASELINE_CHANGED');
  verifyVercelDeployment(candidate, new URL(loginUrl), identity, false);
  const previous = await releaseById(
    EXPECTED.previousId,
    { ...identity, DEPLOY_SHA: EXPECTED.previousSha },
    options,
  );
  if (previous.readyState !== 'READY') fail('VERIFY_BASELINE_CHANGED');
  const alias = await vercelRead(
    vercelEndpoint(`/v4/aliases/${EXPECTED.primaryHost}`, env),
    env,
    options,
  );
  if (
    alias?.alias !== EXPECTED.primaryHost ||
    alias.projectId !== EXPECTED.projectId ||
    alias.deploymentId !== EXPECTED.previousId ||
    alias.redirect ||
    (alias.deployment !== undefined &&
      alias.deployment?.id !== EXPECTED.previousId) ||
    (alias.deployment?.url !== undefined &&
      alias.deployment.url !== previous.url)
  )
    fail('VERIFY_BASELINE_CHANGED');
}

export async function githubOidcToken(env, options) {
  let url;
  try {
    url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  } catch {
    fail('VERIFY_OIDC_FAILED');
  }
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !/(^|\.)actions\.githubusercontent\.com$/.test(url.hostname) ||
    !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN?.trim()
  )
    fail('VERIFY_OIDC_FAILED');
  url.searchParams.set('audience', EXPECTED.audience);
  const result = await options.fetchImpl(url, {
    headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    redirect: 'error',
  });
  if (result.status !== 200) fail('VERIFY_OIDC_FAILED');
  let data;
  try {
    data = await result.json();
  } catch {
    fail('VERIFY_OIDC_FAILED');
  }
  if (
    typeof data?.value !== 'string' ||
    data.value.length > 32768 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.value)
  )
    fail('VERIFY_OIDC_FAILED');
  // Opaque credential: Vercel validates its signature and configured claims.
  // Never print, persist, export or return this token from the verification entry point.
  return data.value;
}

async function boundedHtml(response) {
  if (!response.body) fail('VERIFY_HTML_INVALID');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    html = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 256 * 1024) {
        await reader.cancel();
        fail('VERIFY_HTML_INVALID');
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function verifyProtectedLogin(token, options) {
  const response = await options.fetchImpl(new URL(loginUrl), {
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    cache: 'no-store',
    headers: { 'x-vercel-trusted-oidc-idp-token': token },
  });
  if (
    response.redirected ||
    response.url !== loginUrl ||
    response.headers.has('location') ||
    (response.status >= 300 && response.status < 400)
  )
    fail('VERIFY_REDIRECT');
  if ([401, 403].includes(response.status)) fail('VERIFY_AUTH_REJECTED');
  if (response.status !== 200) fail('VERIFY_HTTP_FAILED');
  if (
    !/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
  )
    fail('VERIFY_HTML_INVALID');
  const html = await boundedHtml(response);
  if (
    !html.includes('Chorotega') ||
    !/id=["']login-title["']/.test(html) ||
    !/id=["']correo["']/.test(html) ||
    !/id=["']clave["']/.test(html)
  )
    fail('VERIFY_HTML_INVALID');
}

export async function verifyExistingStaged(env = process.env, deps = {}) {
  authorizeReadOnly(env);
  const options = readContext(deps);
  await reviewedCI(env, options);
  await baseline(env, options);
  const token = await githubOidcToken(env, options);
  await verifyProtectedLogin(token, options);
  await baseline(env, options);
  console.log(
    `Vercel staged lectura: OK deployment=${EXPECTED.deploymentId} sha=${EXPECTED.sha}; alias principal intacto.`,
  );
  return EXPECTED.deploymentId;
}

export function readOnlyFailure(error) {
  return `Vercel staged lectura: ${error instanceof DeploymentError && errors.has(error.code) ? error.code : 'VERIFY_REQUEST_FAILED'}. Revisar sin volver a crear el deployment.`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void verifyExistingStaged().catch((error) => {
    console.error(readOnlyFailure(error));
    process.exitCode = 1;
  });
}
