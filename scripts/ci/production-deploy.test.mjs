import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflight, deployRender, health, verifyVercelDeployment } from './production-deploy.mjs';

const env = {
  DEPLOY_SHA: 'a'.repeat(40), RENDER_SERVICE_ID: 'srv-test',
  RENDER_DEPLOY_HOOK_URL: 'https://api.render.com/deploy/srv-test?key=synthetic',
  RENDER_API_KEY: 'synthetic', VERCEL_TOKEN: 'synthetic',
  VERCEL_ORG_ID: 'team-test', VERCEL_PROJECT_ID: 'prj-test',
  BACKEND_HEALTH_URL: 'https://backend.example.test/api/database/health',
  FRONTEND_HEALTH_URL: 'https://frontend.example.test/login',
};
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const wait = async () => {};

test('rechaza configuración ausente o hook de otro servicio antes de desplegar', () => {
  assert.throws(() => preflight({}));
  assert.throws(() => preflight({ ...env, RENDER_SERVICE_ID: 'srv-other' }));
  assert.throws(() => preflight({ ...env, FRONTEND_HEALTH_URL: 'http://example.test' }));
  assert.doesNotThrow(() => preflight(env));
});

test('el hook envía el SHA exacto y requiere live, commit coincidente y health', async () => {
  const calls = [];
  const replies = [response({ deploy: { id: 'dep-test' } }),
    response({ status: 'build_in_progress' }),
    response({ status: 'live', commit: { id: env.DEPLOY_SHA } }),
    response({ status: 'connected' })];
  await deployRender(env, { wait, fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return replies.shift();
  } });
  assert.equal(new URL(calls[0].url).searchParams.get('ref'), env.DEPLOY_SHA);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls.length, 4);
});

test('202 no se confunde con despliegue finalizado ni se reintenta el hook', async () => {
  let calls = 0;
  await assert.rejects(deployRender(env, { fetchImpl: async () => {
    calls++; return response({}, 202);
  } }), /rastreable/);
  assert.equal(calls, 1);
});

test('live de otro SHA no supera la verificación', async () => {
  const replies = [response({ deploy: { id: 'dep-test' } }),
    response({ status: 'live', commit: { id: 'b'.repeat(40) } })];
  await assert.rejects(deployRender(env, { fetchImpl: async () => replies.shift() }), /SHA/);
});

test('estado de fallo y timeout impiden continuar a Vercel', async () => {
  for (const status of ['build_failed', 'update_in_progress']) {
    const replies = [response({ deploy: { id: 'dep-test' } }), response({ status })];
    await assert.rejects(deployRender(env, {
      fetchImpl: async () => replies.shift(), wait, attempts: 1,
    }));
  }
});

test('health falla ante 503, redirección o PostgreSQL desconectado', async () => {
  for (const [status, body] of [[503, {}], [302, {}], [200, { status: 'disconnected' }]]) {
    await assert.rejects(health(env.BACKEND_HEALTH_URL, true, {
      fetchImpl: async () => response(body, status), wait, attempts: 1,
    }));
  }
});

test('HTTP 200 no basta: exige HTML del formulario de acceso', async () => {
  for (const body of ['OK', '<html>Error temporal</html>', '{"status":"ok"}']) {
    await assert.rejects(health(env.FRONTEND_HEALTH_URL, false, {
      fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/html' } }),
      wait, attempts: 1,
    }));
  }
  await health(env.FRONTEND_HEALTH_URL, false, {
    fetchImpl: async () => new Response('<title>Chorotega</title><h2 id="login-title"></h2><input id="correo"><input id="clave">',
      { headers: { 'content-type': 'text/html; charset=utf-8' } }), wait, attempts: 1,
  });
});

test('Vercel exige READY, proyecto, SHA y asociación del dominio productivo', () => {
  const url = new URL('https://immutable.example.vercel.app');
  const result = {
    readyState: 'READY', target: 'production', projectId: env.VERCEL_PROJECT_ID,
    url: url.hostname, meta: { githubCommitSha: env.DEPLOY_SHA, githubCommitRef: 'main' },
    aliasAssigned: true, alias: ['frontend.example.test'], aliasError: null,
  };
  assert.doesNotThrow(() => verifyVercelDeployment(result, url, env));
  for (const change of [
    { readyState: 'ERROR' }, { readyState: 'BUILDING' }, { target: null },
    { projectId: 'prj-other' }, { url: 'other.vercel.app' },
    { meta: { githubCommitSha: 'b'.repeat(40), githubCommitRef: 'main' } },
    { aliasAssigned: false }, { alias: [] }, { aliasError: { code: 'synthetic' } },
  ]) assert.throws(() => verifyVercelDeployment({ ...result, ...change }, url, env));
});
