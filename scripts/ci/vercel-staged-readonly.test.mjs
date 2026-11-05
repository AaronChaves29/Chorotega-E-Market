import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { DeploymentError } from './production-deploy.mjs';
import {
  EXPECTED,
  READONLY_MARKER,
  authorizeReadOnly,
  verifyExistingStaged,
  verifyProtectedLogin,
  githubOidcToken,
  readOnlyFailure,
} from './vercel-staged-readonly.mjs';

const loginUrl = `https://${EXPECTED.host}/login`;
const login =
  '<title>Chorotega</title><h2 id="login-title"></h2><input id="correo"><input id="clave">';
const jwt = 'synthetic.oidc.signature';
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
function html(
  body = login,
  { status = 200, url = loginUrl, redirected = false, headers = {} } = {},
) {
  const response = new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
  Object.defineProperties(response, {
    url: { value: url },
    redirected: { value: redirected },
  });
  return response;
}
function fixture() {
  const env = {
    GITHUB_REPOSITORY: EXPECTED.repository,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/develop',
    VERIFY_CODE_SHA: 'f'.repeat(40),
    VERIFY_TRUST_CONFIGURED: 'true',
    VERIFY_CONFIRMATION: READONLY_MARKER,
    VERCEL_PROJECT_ID: EXPECTED.projectId,
    VERCEL_ORG_ID: EXPECTED.teamId,
    GITHUB_TOKEN: 'synthetic-github',
    VERCEL_TOKEN: 'synthetic-vercel',
    ACTIONS_ID_TOKEN_REQUEST_URL:
      'https://run-actions-test.actions.githubusercontent.com/token?api-version=1',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-oidc-request',
  };
  const project = { id: EXPECTED.projectId, accountId: EXPECTED.teamId };
  const candidate = {
    id: EXPECTED.deploymentId,
    projectId: EXPECTED.projectId,
    ownerId: EXPECTED.teamId,
    url: EXPECTED.host,
    readyState: 'READY',
    target: 'production',
    alias: [],
    meta: { githubCommitSha: EXPECTED.sha, githubCommitRef: 'main' },
  };
  const previous = {
    ...candidate,
    id: EXPECTED.previousId,
    url: 'previous.vercel.app',
    meta: { githubCommitSha: EXPECTED.previousSha, githubCommitRef: 'main' },
  };
  const alias = {
    alias: EXPECTED.primaryHost,
    deploymentId: previous.id,
    projectId: EXPECTED.projectId,
  };
  const listing = {
    deployments: [{ uid: candidate.id, meta: candidate.meta }],
    pagination: { next: null },
  };
  const runs = {
    total_count: 1,
    workflow_runs: [
      {
        id: 123,
        head_sha: env.VERIFY_CODE_SHA,
        head_branch: 'develop',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        path: '.github/workflows/ci.yml',
      },
    ],
  };
  const jobs = {
    total_count: 2,
    jobs: ['Build Backend', 'Build Frontend'].map((name) => ({
      name,
      status: 'completed',
      conclusion: 'success',
    })),
  };
  const state = {
    main: EXPECTED.sha,
    loginResponse: () => html(),
    oidcResponse: () => json({ value: jwt }),
    onLogin: () => {},
  };
  const requests = [];
  const deps = {
    wait: async () => {},
    fetchImpl: async (input, options) => {
      const url = new URL(input);
      const headers = new Headers(options.headers);
      requests.push({ url: String(url), options, headers });
      assert.equal(options.method, 'GET', 'La recuperación solo usa GET');
      if (url.hostname === 'api.github.com') {
        assert.equal(options.redirect, 'error');
        assert.equal(
          headers.get('authorization'),
          `Bearer ${env.GITHUB_TOKEN}`,
        );
        assert.equal(headers.has('x-vercel-trusted-oidc-idp-token'), false);
        if (url.pathname.endsWith('/git/ref/heads/main'))
          return json({ ref: 'refs/heads/main', object: { sha: state.main } });
        if (url.pathname.endsWith('/actions/runs')) {
          assert.equal(url.searchParams.get('head_sha'), env.VERIFY_CODE_SHA);
          return json(runs);
        }
        if (url.pathname.endsWith('/jobs')) return json(jobs);
      }
      if (url.hostname === 'api.vercel.com') {
        assert.equal(options.redirect, 'error');
        assert.equal(
          headers.get('authorization'),
          `Bearer ${env.VERCEL_TOKEN}`,
        );
        assert.equal(headers.has('x-vercel-trusted-oidc-idp-token'), false);
        assert.equal(url.searchParams.get('teamId'), EXPECTED.teamId);
        if (url.pathname.startsWith('/v9/projects/')) return json(project);
        if (url.pathname === '/v7/deployments') {
          assert.equal(url.searchParams.get('sha'), EXPECTED.sha);
          assert.equal(url.searchParams.get('target'), 'production');
          assert.equal(url.searchParams.get('projectId'), EXPECTED.projectId);
          return json(listing);
        }
        if (url.pathname.endsWith(EXPECTED.deploymentId))
          return json(candidate);
        if (url.pathname.endsWith(EXPECTED.previousId)) return json(previous);
        if (url.pathname.startsWith('/v4/aliases/')) return json(alias);
      }
      if (url.hostname === 'run-actions-test.actions.githubusercontent.com') {
        assert.equal(options.redirect, 'error');
        assert.equal(url.searchParams.get('audience'), EXPECTED.audience);
        assert.equal(
          headers.get('authorization'),
          `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
        );
        return state.oidcResponse();
      }
      if (String(url) === loginUrl) {
        assert.equal(options.redirect, 'manual');
        assert.equal(options.credentials, 'omit');
        assert.equal(options.cache, 'no-store');
        assert.equal(headers.get('x-vercel-trusted-oidc-idp-token'), jwt);
        assert.equal(headers.has('authorization'), false);
        assert.equal(headers.has('cookie'), false);
        state.onLogin();
        return state.loginResponse();
      }
      throw new Error('Unexpected request');
    },
  };
  return {
    env,
    deps,
    project,
    candidate,
    previous,
    alias,
    listing,
    runs,
    jobs,
    state,
    requests,
  };
}
const appRequests = (f) =>
  f.requests.filter((r) => new URL(r.url).hostname === EXPECTED.host);
const oidcRequests = (f) =>
  f.requests.filter((r) =>
    new URL(r.url).hostname.endsWith('.actions.githubusercontent.com'),
  );

test('lectura staged: contexto, confirmación, pin y configuración pendiente bloquean sin IO', async () => {
  for (const change of [
    { GITHUB_REPOSITORY: 'other/repo' },
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/main' },
    { VERIFY_CONFIRMATION: 'wrong' },
    { VERIFY_TRUST_CONFIGURED: 'false' },
    { VERIFY_CODE_SHA: '0'.repeat(40) },
    { VERIFY_CODE_SHA: 'develop' },
    { VERCEL_PROJECT_ID: 'prj_Other' },
    { VERCEL_ORG_ID: 'team_Other' },
    { VERCEL_TOKEN: '' },
    { GITHUB_TOKEN: '' },
  ]) {
    const f = fixture();
    Object.assign(f.env, change);
    await assert.rejects(
      verifyExistingStaged(f.env, f.deps),
      /VERIFY_NOT_AUTHORIZED/,
    );
    assert.deepEqual(f.requests, []);
  }
});

test('lectura staged: éxito hace solo GET, verifica antes/después y no exporta credenciales', async (t) => {
  const logs = [];
  t.mock.method(console, 'log', (line) => logs.push(line));
  const f = fixture();
  assert.equal(
    await verifyExistingStaged(f.env, f.deps),
    EXPECTED.deploymentId,
  );
  assert.equal(appRequests(f).length, 1);
  assert.equal(oidcRequests(f).length, 1);
  assert.equal(
    f.requests.filter((r) => new URL(r.url).pathname.startsWith('/v4/aliases/'))
      .length,
    2,
  );
  assert.equal(
    f.requests.filter((r) => new URL(r.url).pathname === '/v7/deployments')
      .length,
    2,
  );
  assert(logs.some((line) => line.includes('alias principal intacto')));
  for (const secret of [
    jwt,
    f.env.VERCEL_TOKEN,
    f.env.GITHUB_TOKEN,
    f.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  ])
    assert(!JSON.stringify(logs).includes(secret));
});

test('lectura staged: CI incompleto, incorrecto o fallido impide OIDC y acceso a la aplicación', async () => {
  for (const scenario of [
    'failure',
    'wrong-sha',
    'wrong-branch',
    'wrong-event',
    'incomplete',
    'missing-count',
    'missing-job',
    'failed-job',
    'newer-failed',
  ]) {
    const f = fixture();
    const run = f.runs.workflow_runs[0];
    if (scenario === 'failure') run.conclusion = 'failure';
    if (scenario === 'wrong-sha') run.head_sha = 'a'.repeat(40);
    if (scenario === 'wrong-branch') run.head_branch = 'main';
    if (scenario === 'wrong-event') run.event = 'pull_request';
    if (scenario === 'incomplete') f.runs.total_count = 2;
    if (scenario === 'missing-count') delete f.runs.total_count;
    if (scenario === 'missing-job') {
      f.jobs.jobs.pop();
      f.jobs.total_count--;
    }
    if (scenario === 'failed-job') f.jobs.jobs[0].conclusion = 'failure';
    if (scenario === 'newer-failed') {
      f.runs.workflow_runs.push({ ...run, id: 124, conclusion: 'failure' });
      f.runs.total_count++;
    }
    await assert.rejects(
      verifyExistingStaged(f.env, f.deps),
      /VERIFY_CI_FAILED/,
    );
    assert.equal(oidcRequests(f).length, 0);
    assert.equal(appRequests(f).length, 0);
  }
});

test('lectura staged: main, proyecto o equipo diferente impiden usar el token OIDC', async () => {
  for (const scenario of ['main', 'project', 'team']) {
    const f = fixture();
    if (scenario === 'main') f.state.main = 'a'.repeat(40);
    if (scenario === 'project') f.project.id = 'prj_Other';
    if (scenario === 'team') f.project.accountId = 'team_Other';
    await assert.rejects(
      verifyExistingStaged(f.env, f.deps),
      /VERIFY_MAIN_CHANGED|VERIFY_BASELINE_CHANGED/,
    );
    assert.equal(oidcRequests(f).length, 0);
  }
});

test('lectura staged: candidato único debe ser el ID esperado; ausencia o duplicados fallan', async () => {
  for (const scenario of ['missing', 'other', 'duplicate', 'incomplete']) {
    const f = fixture();
    if (scenario === 'missing') f.listing.deployments = [];
    if (scenario === 'other') f.listing.deployments[0].uid = 'dpl_Other';
    if (scenario === 'duplicate')
      f.listing.deployments.push({ uid: 'dpl_Other', meta: f.candidate.meta });
    if (scenario === 'incomplete') delete f.listing.pagination;
    await assert.rejects(
      verifyExistingStaged(f.env, f.deps),
      /VERIFY_BASELINE_CHANGED|VERCEL_DUPLICATES|VERCEL_API_FAILED/,
    );
    assert.equal(oidcRequests(f).length, 0);
    assert.equal(appRequests(f).length, 0);
  }
});

test('lectura staged: identidad, READY y host inmutable del candidato son obligatorios', async () => {
  for (const change of [
    { id: 'dpl_Other' },
    { projectId: 'prj_Other' },
    { ownerId: 'team_Other' },
    { target: 'preview' },
    { readyState: 'BUILDING' },
    { url: 'other.vercel.app' },
    { meta: { githubCommitSha: 'a'.repeat(40), githubCommitRef: 'main' } },
    { meta: { githubCommitSha: EXPECTED.sha, githubCommitRef: 'develop' } },
    { alias: [EXPECTED.primaryHost] },
  ]) {
    const f = fixture();
    Object.assign(f.candidate, change);
    await assert.rejects(verifyExistingStaged(f.env, f.deps));
    assert.equal(oidcRequests(f).length, 0);
  }
});

test('lectura staged: alias o deployment principal cambiado, incompleto o contradictorio falla', async () => {
  for (const change of [
    { alias: 'other.vercel.app' },
    { projectId: 'prj_Other' },
    { deploymentId: EXPECTED.deploymentId },
    { deploymentId: undefined },
    { redirect: 'vercel.com' },
    { deployment: {} },
    { deployment: { id: EXPECTED.previousId, url: 'other.vercel.app' } },
  ]) {
    const f = fixture();
    Object.assign(f.alias, change);
    await assert.rejects(
      verifyExistingStaged(f.env, f.deps),
      /VERIFY_BASELINE_CHANGED/,
    );
    assert.equal(appRequests(f).length, 0);
  }
  const f = fixture();
  f.previous.meta.githubCommitSha = 'a'.repeat(40);
  await assert.rejects(
    verifyExistingStaged(f.env, f.deps),
    /VERCEL_RELEASE_INVALID/,
  );
});

test('lectura staged: cambio de alias después del HTML impide declarar éxito', async () => {
  const f = fixture();
  f.state.onLogin = () => {
    f.alias.deploymentId = EXPECTED.deploymentId;
  };
  await assert.rejects(
    verifyExistingStaged(f.env, f.deps),
    /VERIFY_BASELINE_CHANGED/,
  );
  assert.equal(appRequests(f).length, 1);
  assert.equal(oidcRequests(f).length, 1);
});

test('lectura staged: main o candidato que cambia durante la lectura impide éxito', async () => {
  for (const scenario of ['main', 'candidate', 'duplicate']) {
    const f = fixture();
    f.state.onLogin = () => {
      if (scenario === 'main') f.state.main = 'a'.repeat(40);
      if (scenario === 'candidate') f.candidate.url = 'changed.vercel.app';
      if (scenario === 'duplicate')
        f.listing.deployments.push({
          uid: 'dpl_Other',
          meta: f.candidate.meta,
        });
    };
    await assert.rejects(verifyExistingStaged(f.env, f.deps));
    assert.equal(appRequests(f).length, 1);
  }
});

test('lectura staged: 200 original con HTML y cuatro marcas aprueba', async () => {
  await verifyProtectedLogin(jwt, {
    fetchImpl: async (url, options) => {
      assert.equal(String(url), loginUrl);
      assert.equal(options.redirect, 'manual');
      return html();
    },
  });
});

test('lectura staged: redirecciones a Vercel no se siguen ni se aceptan', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    let count = 0;
    await assert.rejects(
      verifyProtectedLogin(jwt, {
        fetchImpl: async () => {
          count++;
          return html('', {
            status,
            headers: { location: 'https://vercel.com/sso-api?private=value' },
          });
        },
      }),
      /VERIFY_REDIRECT/,
    );
    assert.equal(count, 1);
  }
});

test('lectura staged: 200 final de Vercel, otra URL o response.redirected no son el login', async () => {
  for (const options of [
    { url: 'https://vercel.com/login' },
    { url: loginUrl + '/' },
    { redirected: true },
  ])
    await assert.rejects(
      verifyProtectedLogin(jwt, {
        fetchImpl: async () => html(login, options),
      }),
      /VERIFY_REDIRECT/,
    );
});

test('lectura staged: 401 y 403 se distinguen de HTML inválido', async () => {
  for (const status of [401, 403])
    await assert.rejects(
      verifyProtectedLogin(jwt, {
        fetchImpl: async () => html('private', { status }),
      }),
      /VERIFY_AUTH_REJECTED/,
    );
});

test('lectura staged: otros estados no se reintentan ni permiten fallback anónimo', async () => {
  for (const status of [404, 429, 500, 503]) {
    let requests = 0;
    await assert.rejects(
      verifyProtectedLogin(jwt, {
        fetchImpl: async () => {
          requests++;
          return html('', { status });
        },
      }),
      /VERIFY_HTTP_FAILED/,
    );
    assert.equal(requests, 1);
  }
});

test('lectura staged: contenido o marcas incorrectas se rechazan aunque respondan 200', async () => {
  for (const body of [
    '<title>Vercel Login</title>',
    login.replace('Chorotega', 'Other'),
    login.replace('login-title', 'other'),
    login.replace('correo', 'other'),
    login.replace('clave', 'other'),
  ])
    await assert.rejects(
      verifyProtectedLogin(jwt, { fetchImpl: async () => html(body) }),
      /VERIFY_HTML_INVALID/,
    );
  await assert.rejects(
    verifyProtectedLogin(jwt, {
      fetchImpl: async () =>
        html(login, { headers: { 'content-type': 'application/json' } }),
    }),
    /VERIFY_HTML_INVALID/,
  );
});

test('lectura staged: HTML excesivo o sin body se rechaza sin imprimirlo', async () => {
  await assert.rejects(
    verifyProtectedLogin(jwt, {
      fetchImpl: async () => html(login + 'x'.repeat(256 * 1024)),
    }),
    /VERIFY_HTML_INVALID/,
  );
  const response = html();
  Object.defineProperty(response, 'body', { value: null });
  await assert.rejects(
    verifyProtectedLogin(jwt, { fetchImpl: async () => response }),
    /VERIFY_HTML_INVALID/,
  );
});

test('lectura staged: OIDC no envía credenciales a un emisor, protocolo o puerto arbitrarios', async () => {
  for (const url of [
    'https://evil.test/token',
    'http://token.actions.githubusercontent.com/token',
    'https://token.actions.githubusercontent.com.evil.test/token',
    'https://user:password@token.actions.githubusercontent.com/token',
    'https://token.actions.githubusercontent.com:444/token',
    'https://token.actions.githubusercontent.com/token#private',
  ]) {
    const f = fixture();
    f.env.ACTIONS_ID_TOKEN_REQUEST_URL = url;
    let count = 0;
    await assert.rejects(
      githubOidcToken(f.env, {
        fetchImpl: async () => {
          count++;
          return json({ value: jwt });
        },
      }),
      /VERIFY_OIDC_FAILED/,
    );
    assert.equal(count, 0);
  }
});

test('lectura staged: token OIDC inválido o permiso ausente impiden consultar /login', async () => {
  for (const scenario of [
    'missing-request-token',
    'http',
    'missing-value',
    'newline',
    'malformed-json',
  ]) {
    const f = fixture();
    if (scenario === 'missing-request-token')
      f.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = '';
    if (scenario === 'http') f.state.oidcResponse = () => json({}, 403);
    if (scenario === 'missing-value') f.state.oidcResponse = () => json({});
    if (scenario === 'newline')
      f.state.oidcResponse = () => json({ value: 'secret\r\nheader' });
    if (scenario === 'malformed-json')
      f.state.oidcResponse = () => new Response('private');
    await assert.rejects(
      verifyExistingStaged(f.env, f.deps),
      /VERIFY_OIDC_FAILED/,
    );
    assert.equal(appRequests(f).length, 0);
  }
});

test('lectura staged: credencial OIDC nunca se propaga a API ni se usa como Vercel API token', async () => {
  const f = fixture();
  await verifyExistingStaged(f.env, f.deps);
  for (const r of f.requests) {
    if (r.headers.has('x-vercel-trusted-oidc-idp-token'))
      assert.equal(r.url, loginUrl);
    assert(!r.url.includes(jwt));
    assert(!r.url.includes(f.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN));
  }
});

test('lectura staged: timeout o cancelación previa no generan solicitudes', async () => {
  const f = fixture();
  f.deps.signal = AbortSignal.abort();
  await assert.rejects(
    verifyExistingStaged(f.env, f.deps),
    /VERIFY_REQUEST_FAILED/,
  );
  assert.deepEqual(f.requests, []);
});

test('lectura staged: errores de red, cuerpo o proveedor no se imprimen ni causan mutaciones', async () => {
  const f = fixture();
  f.deps.fetchImpl = async () => {
    throw new Error('private-token https://private.test');
  };
  await assert.rejects(
    verifyExistingStaged(f.env, f.deps),
    /VERIFY_REQUEST_FAILED/,
  );
  for (const error of [
    new Error('private-token'),
    new DeploymentError('private-token'),
    Object.assign(new DeploymentError('VERIFY_HTML_INVALID'), {
      stack: 'private-token',
      cause: jwt,
    }),
  ]) {
    assert(!readOnlyFailure(error).includes('private-token'));
    assert(!readOnlyFailure(error).includes(jwt));
  }
  assert(
    readOnlyFailure(new DeploymentError('VERCEL_DUPLICATES')).includes(
      'VERCEL_DUPLICATES',
    ),
  );
});

test('lectura staged: workflow sigue bloqueado, requiere Environment, pin y solo permisos mínimos', () => {
  const require = createRequire(
    new URL('../../apps/backend/package.json', import.meta.url),
  );
  const { load } = require('js-yaml');
  const workflow = load(
    readFileSync(
      new URL(
        '../../.github/workflows/vercel-staged-readonly.yml',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const job = workflow.jobs.verify_existing;
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(job.permissions, {
    contents: 'read',
    actions: 'read',
    'id-token': 'write',
  });
  assert.deepEqual(job.environment, { name: 'vercel-staged-approval' });
  assert.deepEqual(job.concurrency, {
    group: 'chorotega-production',
    'cancel-in-progress': false,
  });
  assert.equal(job.env.VERIFY_CODE_SHA, '0'.repeat(40));
  assert.equal(job.env.VERIFY_TRUST_CONFIGURED, 'false');
  const condition = job.if.match(/^\$\{\{\s*(.*?)\s*\}\}$/)[1];
  assert(condition.startsWith('false && '));
  for (const repository of [EXPECTED.repository, 'other/repo'])
    for (const event_name of ['push', 'pull_request', 'workflow_dispatch'])
      for (const ref of ['refs/heads/main', 'refs/heads/develop'])
        for (const confirmation of ['', READONLY_MARKER]) {
          assert.equal(
            Function(
              'github',
              'inputs',
              `return (${condition})`,
            )({ repository, event_name, ref }, { confirmation }),
            false,
          );
        }
  const checkout = job.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@'),
  );
  assert.equal(checkout.with.ref, '${{ env.VERIFY_CODE_SHA }}');
  assert.equal(checkout.with['persist-credentials'], false);
  const gateIndex = job.steps.findIndex((step) =>
    step.name.includes('Exigir CI'),
  );
  const secretIndex = job.steps.findIndex((step) =>
    JSON.stringify(step.env ?? {}).includes('secrets.'),
  );
  assert(gateIndex >= 0 && gateIndex < secretIndex);
  assert(!JSON.stringify(job.env).includes('secrets.'));
  for (const step of job.steps) {
    assert(
      !/vercel (deploy|build|promote)|vercel-staged-check\.mjs|migration|RENDER_/i.test(
        JSON.stringify(step),
      ),
    );
    assert(!JSON.stringify(step).includes('GITHUB_OUTPUT'));
  }
  const guard = job.steps[0].run;
  for (const env of [
    job.env,
    { VERIFY_CODE_SHA: 'f'.repeat(40), VERIFY_TRUST_CONFIGURED: 'false' },
    { VERIFY_CODE_SHA: 'develop', VERIFY_TRUST_CONFIGURED: 'true' },
  ])
    assert.equal(
      spawnSync('bash', ['-e', '-c', guard], { env, encoding: 'utf8' }).status,
      1,
    );
  assert.equal(
    spawnSync('bash', ['-e', '-c', guard], {
      env: { VERIFY_CODE_SHA: 'f'.repeat(40), VERIFY_TRUST_CONFIGURED: 'true' },
      encoding: 'utf8',
    }).status,
    0,
  );
  const f = fixture();
  Object.assign(f.env, {
    VERIFY_CODE_SHA: job.env.VERIFY_CODE_SHA,
    VERIFY_TRUST_CONFIGURED: job.env.VERIFY_TRUST_CONFIGURED,
  });
  assert.throws(() => authorizeReadOnly(f.env), /VERIFY_NOT_AUTHORIZED/);
});

test('lectura staged: gate anterior a Secrets exige CI completo del pin, con API simulada', () => {
  const require = createRequire(
    new URL('../../apps/backend/package.json', import.meta.url),
  );
  const { load } = require('js-yaml');
  const workflow = load(
    readFileSync(
      new URL(
        '../../.github/workflows/vercel-staged-readonly.yml',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const step = workflow.jobs.verify_existing.steps.find((item) =>
    item.name.includes('Exigir CI'),
  );
  const script = step.run.match(/<<'NODE'\n([\s\S]*?)\nNODE\s*$/)[1];
  for (const scenario of [
    'success',
    'failed-run',
    'wrong-sha',
    'wrong-ref',
    'missing-job',
    'incomplete',
    'permission',
  ]) {
    const f = fixture();
    if (scenario === 'failed-run')
      f.runs.workflow_runs[0].conclusion = 'failure';
    if (scenario === 'wrong-sha')
      f.runs.workflow_runs[0].head_sha = 'a'.repeat(40);
    if (scenario === 'wrong-ref') f.runs.workflow_runs[0].head_branch = 'main';
    if (scenario === 'missing-job') {
      f.jobs.jobs.pop();
      f.jobs.total_count--;
    }
    if (scenario === 'incomplete') f.runs.total_count++;
    const harness = `globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('/jobs?') ? ${JSON.stringify(f.jobs)} : ${JSON.stringify(f.runs)}), { status: ${scenario === 'permission' ? 403 : 200} });\n`;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', harness + script],
      {
        env: {
          VERIFY_CODE_SHA: f.env.VERIFY_CODE_SHA,
          GH_TOKEN: 'synthetic-private-token',
        },
        encoding: 'utf8',
        timeout: 5000,
      },
    );
    assert.equal(child.status, scenario === 'success' ? 0 : 1);
    assert(
      !`${child.stdout}${child.stderr}`.includes('synthetic-private-token'),
    );
  }
});
