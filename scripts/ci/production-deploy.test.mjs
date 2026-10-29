import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preflight, deployRender as realDeployRender, health, verifyVercelDeployment,
  assertCurrentMain, main, safeFailure, DeploymentError } from './production-deploy.mjs';

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
const currentMain = async () => env.DEPLOY_SHA;
const deployRender = (config, options) => realDeployRender(config, { readMain: currentMain, ...options });

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
  } }), /RENDER_AMBIGUOUS/);
  assert.equal(calls, 1);
});

test('commit obsoleto o main inaccesible impiden solicitar despliegue', async () => {
  let calls = 0;
  await assert.rejects(deployRender(env, { readMain: async () => 'b'.repeat(40),
    fetchImpl: async () => { calls++; } }), /STALE_MAIN/);
  await assert.rejects(assertCurrentMain(env, async () => ''), /MAIN_UNAVAILABLE/);
  assert.equal(calls, 0);
});

test('Render recupera 503 y error de red con backoff, sin repetir POST', async () => {
  const delays = [], methods = [];
  let index = 0;
  await deployRender(env, {
    wait: async (ms) => delays.push(ms),
    fetchImpl: async (_url, options) => {
      methods.push(options.method ?? 'GET');
      index++;
      if (index === 1) return response({ deploy: { id: 'dep-test' } });
      if (index === 2) return response({}, 503);
      if (index === 3) throw new Error('synthetic private URL');
      if (index === 4) return response({ status: 'live', commit: { id: env.DEPLOY_SHA } });
      return response({ status: 'connected' });
    },
  });
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(methods.filter((m) => m === 'POST').length, 1);
});

test('Render no reintenta 401 y un timeout del hook queda ambiguo', async () => {
  let calls = 0;
  await assert.rejects(deployRender(env, { fetchImpl: async () => {
    calls++;
    return calls === 1 ? response({ deploy: { id: 'dep-test' } }) : response({}, 401);
  } }), /RENDER_QUERY_FAILED/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(deployRender(env, { fetchImpl: async () => {
    calls++; throw new DOMException('synthetic-secret', 'TimeoutError');
  } }), /RENDER_AMBIGUOUS/);
  assert.equal(calls, 1);
});

const loginHtml = '<title>Chorotega</title><h2 id="login-title"></h2><input id="correo"><input id="clave">';
function vercelDependencies({ stale = false, failCli = '', failHealth = false } = {}) {
  const commands = [];
  let reads = 0;
  const url = 'https://immutable.example.vercel.app';
  return {
    commands,
    readMain: async () => ++reads > 1 && stale ? 'b'.repeat(40) : env.DEPLOY_SHA,
    runCli: async (args) => {
      commands.push(args);
      if (args[0] === failCli) throw new DeploymentError('VERCEL_COMMAND_FAILED');
      return args[0] === 'deploy' ? url : '';
    },
    fetchImpl: async (requestUrl) => {
      if (String(requestUrl).startsWith('https://api.vercel.com/')) return response({
        readyState: 'READY', target: 'production', projectId: env.VERCEL_PROJECT_ID,
        url: new URL(url).hostname, meta: { githubCommitSha: env.DEPLOY_SHA, githubCommitRef: 'main' },
        aliasAssigned: true,
        alias: commands.some((args) => args[0] === 'promote') ? ['frontend.example.test'] : [],
      });
      return new Response(failHealth ? 'Error' : loginHtml, { headers: { 'content-type': 'text/html' } });
    },
    healthAttempts: 1, wait,
  };
}

test('Vercel valida staging antes de promover y comprueba el dominio después', async () => {
  const deps = vercelDependencies();
  await main('vercel-deploy', env, deps);
  assert(deps.commands[0].includes('--skip-domain'));
  assert.deepEqual(deps.commands.map((args) => args[0]), ['deploy', 'inspect', 'promote']);
});

test('Vercel no promueve si main cambió, staging falla o la CLI falla', async () => {
  for (const config of [{ stale: true }, { failHealth: true }, { failCli: 'inspect' }]) {
    const deps = vercelDependencies(config);
    await assert.rejects(main('vercel-deploy', env, deps));
    assert(!deps.commands.some((args) => args[0] === 'promote'));
  }
});

test('despliegue parcial conserva Render sin rollback si Vercel falla', async () => {
  const replies = [response({ deploy: { id: 'dep-test' } }),
    response({ status: 'live', commit: { id: env.DEPLOY_SHA } }), response({ status: 'connected' })];
  await deployRender(env, { fetchImpl: async () => replies.shift(), wait });
  const deps = vercelDependencies({ failCli: 'deploy' });
  await assert.rejects(main('vercel-deploy', env, deps), /VERCEL_COMMAND_FAILED/);
  assert.equal(replies.length, 0);
  assert(!deps.commands.some((args) => ['rollback', 'promote'].includes(args[0])));
});

test('logs seguros omiten mensajes arbitrarios de proveedores', () => {
  const secret = 'synthetic-secret https://private.example.test/?key=private';
  assert(!safeFailure('vercel-deploy', new Error(secret)).includes(secret));
  const hostile = new DeploymentError(secret);
  assert(!safeFailure('render', hostile).includes(secret));
  assert(safeFailure('vercel-deploy', new Error(secret)).includes('Render puede estar actualizado'));
  // Modo inválido: prueba el manejador real de errores sin red ni proveedores.
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./production-deploy.mjs', import.meta.url)), 'unsupported'],
    { env: { ...env, VERCEL_TOKEN: 'synthetic-private-token' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 1);
  assert(child.stderr.includes('resultado=DEPLOYMENT_FAILED'));
  assert(!`${child.stdout}${child.stderr}`.includes('synthetic-private-token'));
  assert(!`${child.stdout}${child.stderr}`.includes('key=synthetic'));
});

test('workflow mantiene false y excluye PR/develop/fallos/cancelaciones', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const condition = yaml.match(/if: \$\{\{ (false && github.event_name.*) \}\}/)?.[1];
  assert(condition);
  assert(yaml.includes('needs: [backend, frontend]'));
  assert(yaml.includes('cancel-in-progress: false'));
  const evaluate = Function('github', 'needs', `return ${condition.replace(/^false && /, '')}`);
  for (const event_name of ['push', 'pull_request'])
    for (const ref of ['refs/heads/main', 'refs/heads/develop', 'refs/heads/feat/test'])
      for (const b of ['success', 'failure', 'skipped', 'cancelled'])
        for (const f of ['success', 'failure', 'skipped', 'cancelled']) {
          assert.equal(evaluate({ event_name, ref }, { backend: { result: b }, frontend: { result: f } }),
            event_name === 'push' && ref === 'refs/heads/main' && b === 'success' && f === 'success');
        }
});

test('plazo Render agotado antes del hook no produce solicitudes', async () => {
  let calls = 0;
  await assert.rejects(deployRender(env, { signal: AbortSignal.abort(),
    fetchImpl: async () => { calls++; } }), /RENDER_TIMEOUT/);
  assert.equal(calls, 0);
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
