import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { preflight, deployRender as realDeployRender, health, verifyVercelDeployment,
  assertCurrentMain, main, safeFailure, DeploymentError, command, cli } from './production-deploy.mjs';

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

test('pull enlaza el proyecto antes de build y rechaza contexto distinto sin publicar', async () => {
  const project = { projectId: env.VERCEL_PROJECT_ID, orgId: env.VERCEL_ORG_ID,
    settings: { rootDirectory: 'apps/frontend', nodeVersion: '24.x' } };
  const calls = [];
  await main('vercel-build', env, { runCli: async (args) => calls.push(args), readProject: () => project });
  assert.deepEqual(calls, [['pull', '--yes', '--environment=production'], ['build', '--prod']]);
  for (const [reason, mutate] of [
    ['project_mismatch', (p) => { p.projectId = 'other'; }],
    ['organization_mismatch', (p) => { p.orgId = 'other'; }],
    ['root_directory_mismatch', (p) => { p.settings.rootDirectory = '.'; }],
    ['node_version_mismatch', (p) => { p.settings.nodeVersion = '22.x'; }],
    ['project_settings_unreadable', () => { throw new Error('synthetic-private-token'); }],
  ]) {
    const commands = [];
    await assert.rejects(main('vercel-build', env, {
      runCli: async (args) => commands.push(args),
      readProject: () => { const p = structuredClone(project); mutate(p); return p; },
    }), (error) => {
      assert.equal(error.code, 'VERCEL_CONTEXT_INVALID');
      assert.equal(error.reason, reason);
      assert(!safeFailure('vercel-build', error).includes('synthetic-private-token'));
      return true;
    });
    assert.deepEqual(commands, [['pull', '--yes', '--environment=production']]);
  }
});

test('fallo de pull impide leer el enlace y ejecutar build', async () => {
  const failure = new DeploymentError('VERCEL_COMMAND_FAILED');
  await assert.rejects(main('vercel-build', env, {
    runCli: async (args) => { assert.equal(args[0], 'pull'); throw failure; },
    readProject: () => assert.fail('No debe leer contexto tras pull fallido'),
  }), (error) => error === failure);
});

test('diagnosticos JSON de pull clasifican causas sin propagar mensajes privados', async () => {
  for (const [reason, category] of [
    ['scope_not_accessible', 'scope'], ['project_unauthorized', 'project'],
    ['invalid_token', 'authentication'], ['forbidden', 'permission'],
    ['invalid_argument', 'invalid_argument'], ['synthetic-private-token', 'unknown'],
  ]) {
    const payload = JSON.stringify({ status: 'error', reason, message: 'synthetic-private-token https://private.test/?key=secret' });
    await assert.rejects(command(process.execPath,
      ['-e', `process.stdout.write(${JSON.stringify(payload)});process.exitCode=1`],
      process.env, 5000, 'vercel_pull'), (error) => {
      assert.equal(error.category, category);
      assert.equal(error.exitCode, 1);
      assert(!JSON.stringify(error).includes('synthetic-private-token'));
      assert(!safeFailure('vercel-build', error).includes('private.test'));
      return true;
    });
  }
});

test('diagnosticos stderr distinguen scope, proyecto y red con salida limitada', async () => {
  for (const [message, category] of [
    ['You do not have access to the specified account', 'scope'],
    ['Project not found prj-private', 'project'], ['fetch failed ENOTFOUND', 'network'],
  ]) {
    await assert.rejects(command(process.execPath,
      ['-e', `process.stderr.write(${JSON.stringify(message + ' synthetic-private-token')});process.exitCode=1`],
      process.env, 5000, 'vercel_pull'), (error) => error.category === category && !JSON.stringify(error).includes('synthetic-private-token'));
  }
  await assert.rejects(command(process.execPath,
    ['-e', `process.stdout.write(' '.repeat(8192)+JSON.stringify({reason:'invalid_token'}));process.exitCode=1`],
    process.env, 5000, 'vercel_pull'), (error) => error.category === 'unknown');
});

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
  const requests = [];
  const state = { created: false, promoted: false };
  let reads = 0;
  const url = 'https://immutable-example.vercel.app';
  const record = { id: 'dpl_Automatic', ownerId: env.VERCEL_ORG_ID,
    readyState: 'READY', target: 'production', projectId: env.VERCEL_PROJECT_ID,
    url: new URL(url).hostname, meta: { githubCommitSha: env.DEPLOY_SHA, githubCommitRef: 'main' },
    aliasAssigned: false, alias: [] };
  return {
    commands, requests, state, record,
    readMain: async () => ++reads > 1 && stale ? 'b'.repeat(40) : env.DEPLOY_SHA,
    runCli: async (args) => {
      commands.push(args);
      if (args[0] === failCli) throw new DeploymentError('VERCEL_COMMAND_FAILED');
      if (args[0] === 'deploy') { state.created = true; return JSON.stringify({ deployment: { id: record.id } }); }
      if (args[0] === 'promote') state.promoted = true;
      return '';
    },
    fetchImpl: async (requestUrl) => {
      const parsed = new URL(requestUrl); requests.push(String(requestUrl));
      if (parsed.pathname.startsWith('/v9/projects/')) return response({ id: env.VERCEL_PROJECT_ID, accountId: env.VERCEL_ORG_ID });
      if (parsed.hostname === 'api.render.com') return response([{ deploy: { status: 'live', commit: { id: env.DEPLOY_SHA } } }]);
      if (parsed.pathname === '/v7/deployments') return response({ deployments: state.created ? [{ uid: record.id, meta: record.meta }] : [], pagination: { next: null } });
      if (parsed.pathname.startsWith('/v13/deployments/')) return response({ ...record,
        aliasAssigned: state.promoted ? true : record.aliasAssigned,
        alias: state.promoted ? ['frontend.example.test'] : record.alias });
      if (parsed.pathname.startsWith('/v4/aliases/')) return response({ alias: 'frontend.example.test', projectId: env.VERCEL_PROJECT_ID,
        deploymentId: state.promoted ? record.id : 'dpl_Previous' });
      if (String(requestUrl) === env.BACKEND_HEALTH_URL) return response({ status: 'connected' });
      return new Response(failHealth ? 'Error' : loginHtml, { headers: { 'content-type': 'text/html' } });
    },
    healthAttempts: 1, vercelAttempts: 2, wait,
  };
}

test('Vercel valida staging antes de promover y comprueba el dominio después', async () => {
  const deps = vercelDependencies();
  await main('vercel-deploy', env, deps);
  assert(deps.commands[0].includes('--skip-domain'));
  assert(deps.commands[0].includes('--json'));
  assert(deps.commands[0].includes('--no-wait'));
  assert.deepEqual(deps.commands.map((args) => args[0]), ['deploy', 'promote']);
});

test('Vercel no promueve si main cambió, staging falla o la CLI falla', async () => {
  for (const config of [{ stale: true }, { failHealth: true }, { failCli: 'deploy' }]) {
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
  await assert.rejects(main('vercel-deploy', env, deps), /VERCEL_DEPLOY_AMBIGUOUS/);
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

test('workflow activo excluye PR/develop/fallos/cancelaciones', () => {
  // CI instala primero las dependencias del backend, incluido js-yaml.
  const require = createRequire(new URL('../../apps/backend/package.json', import.meta.url));
  const { load } = require('js-yaml');
  const workflow = load(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const deploy = workflow?.jobs?.deploy;
  assert(deploy, 'Debe existir jobs.deploy');
  assert.deepEqual(deploy.needs, ['backend', 'frontend']);
  assert.equal(deploy.concurrency?.['cancel-in-progress'], false);
  assert.equal(typeof deploy.if, 'string');
  const match = deploy.if.match(/^\s*\$\{\{\s*([\s\S]+?)\s*\}\}\s*$/);
  assert(match, 'jobs.deploy.if debe ser una expresión completa');
  const condition = match[1];
  const validate = (expression) => {
    const evaluate = Function('github', 'needs', `return (${expression})`);
    let combinations = 0;
    for (const event_name of ['push', 'pull_request'])
      for (const ref of ['refs/heads/main', 'refs/heads/develop', 'refs/heads/feat/test'])
        for (const b of ['success', 'failure', 'skipped', 'cancelled'])
          for (const f of ['success', 'failure', 'skipped', 'cancelled']) {
            assert.equal(evaluate({ event_name, ref }, { backend: { result: b }, frontend: { result: f } }),
              event_name === 'push' && ref === 'refs/heads/main' && b === 'success' && f === 'success');
            combinations++;
          }
    assert.equal(combinations, 96);
  };
  validate(condition);
  // Mutaciones solo en memoria: omitir cualquiera de los controles debe fallar.
  for (const control of [
    "github.event_name == 'push'",
    "github.ref == 'refs/heads/main'",
    "needs.backend.result == 'success'",
    "needs.frontend.result == 'success'",
  ]) {
    assert(condition.includes(control), `Falta control: ${control}`);
    assert.throws(() => validate(condition.replace(control, 'true')));
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

test('subprocesos CLI conservan comando/exit y clasifican stderr sin revelar secretos', async () => {
  for (const label of ['vercel_deploy', 'vercel_inspect', 'vercel_promote']) {
    await assert.rejects(command(process.execPath, ['-e',
      "process.stdout.write('private-token'); process.stderr.write('Unauthorized private-token https://private.test/?key=private'); process.exitCode=7"],
    process.env, 5000, label), (error) => {
      assert.equal(error.command, label);
      assert.equal(error.exitCode, 7);
      assert.equal(error.reason, 'exit_nonzero');
      assert.equal(error.category, 'authentication');
      const text = safeFailure('vercel-deploy', error);
      assert(text.includes(`comando=${label}`));
      assert(!/private-token|private\.test|key=private/.test(`${text}${JSON.stringify(error)}`));
      return true;
    });
  }
});

test('runner distingue timeout, cancelación, spawn_failed y exceso de stdout', async () => {
  const controller = new AbortController(); controller.abort();
  for (const [binary, args, timeout, options, expected] of [
    [process.execPath, ['-e', 'setInterval(()=>{},1000)'], 50, {}, 'timeout'],
    [process.execPath, ['-e', 'setInterval(()=>{},1000)'], 5000, { signal: controller.signal }, 'cancelled'],
    ['chorotega-nonexistent-command-synthetic', [], 5000, {}, 'spawn_failed'],
    [null, [], 5000, {}, 'spawn_failed'],
    [process.execPath, ['-e', "process.stdout.write('x'.repeat(100000))"], 5000, { maxOutputBytes: 128 }, 'output_limit'],
  ]) await assert.rejects(command(binary, args, process.env, timeout, 'vercel_inspect', options), (error) => {
    assert.equal(error.reason, expected);
    assert.equal(error.command, 'vercel_inspect');
    assert(!safeFailure('vercel-deploy', error).includes('undefined'));
    return true;
  });
});

test('stderr está limitado y su clasificación solo devuelve un catálogo controlado', async () => {
  for (const [stderr, category] of [
    ['Forbidden synthetic-secret', 'permission'],
    ['Deployment not found synthetic-secret', 'not_found'],
    ['Unknown option synthetic-secret', 'invalid_argument'],
    ['ECONNRESET synthetic-secret', 'network'],
    ['x'.repeat(9000) + 'Unauthorized synthetic-secret', 'unknown'],
  ]) await assert.rejects(command(process.execPath,
    ['-e', `process.stderr.write(${JSON.stringify(stderr)});process.exitCode=1`],
    process.env, 5000, 'vercel_inspect'), (error) => {
      assert.equal(error.category, category);
      assert(!safeFailure('vercel-deploy', error).includes('synthetic-secret'));
      return true;
    });
});

test('stdout exitoso permanece disponible y metadatos hostiles no llegan al diagnóstico', async () => {
  assert.equal(await command(process.execPath, ['-e', "process.stdout.write('  safe-result  ');process.stderr.write('private-token')"],
    process.env, 5000, 'vercel_inspect'), 'safe-result');
  const hostile = Object.assign(new DeploymentError('VERCEL_COMMAND_FAILED'), {
    command: 'vercel_inspect', reason: 'exit_nonzero', exitCode: 'private-token',
    signal: 'private-token', category: 'private-token',
  });
  assert(!safeFailure('vercel-recover', hostile).includes('private-token'));
});

test('diagnóstico real en subproceso sale con error y solo imprime campos controlados', () => {
  const moduleUrl = new URL('./production-deploy.mjs', import.meta.url).href;
  const script = `import { command, safeFailure } from ${JSON.stringify(moduleUrl)};
    try { await command(process.execPath, ['-e', "process.stderr.write('Forbidden synthetic-private-token');process.exitCode=9"], process.env, 5000, 'vercel_inspect'); }
    catch (error) { console.error(safeFailure('vercel-deploy', error)); process.exitCode=1; }`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  assert(child.stderr.includes('comando=vercel_inspect causa=exit_nonzero exit=9'));
  assert(child.stderr.includes('clase=permission'));
  assert(!child.stderr.includes('synthetic-private-token'));
});

function recoveryFixture() {
  const config = { ...env, RECOVERY_DEPLOYMENT: 'dpl_Existing',
    RECOVERY_PROMOTION_AUTHORIZATION: `promote:${env.DEPLOY_SHA}:dpl_Existing` };
  delete config.RENDER_DEPLOY_HOOK_URL;
  delete config.RENDER_API_KEY;
  delete config.RENDER_SERVICE_ID;
  const commands = [], requests = [];
  let promoted = false;
  const record = {
    id: 'dpl_Existing', ownerId: env.VERCEL_ORG_ID, projectId: env.VERCEL_PROJECT_ID,
    readyState: 'READY', target: 'production', url: 'immutable.vercel.app',
    meta: { githubCommitSha: env.DEPLOY_SHA, githubCommitRef: 'main' },
    alias: [], aliasAssigned: false, aliasError: null,
  };
  const deps = { healthAttempts: 1, wait, readMain: currentMain,
    runCli: async (args) => {
      commands.push(args);
      assert.equal(args[0], 'promote', 'Recuperación nunca crea deployments ni ejecuta build/Render');
      promoted = true; return '';
    },
    fetchImpl: async (url, options) => {
      requests.push(String(url));
      assert.equal(options.method, undefined, 'Solo consultas GET');
      if (new URL(url).hostname === 'api.vercel.com') return response({ ...record,
        alias: promoted ? ['frontend.example.test'] : record.alias,
        aliasAssigned: promoted ? true : record.aliasAssigned });
      if (String(url) === env.BACKEND_HEALTH_URL) return response({ status: 'connected' });
      assert(['https://immutable.vercel.app/login', env.FRONTEND_HEALTH_URL].includes(String(url)));
      return new Response(loginHtml, { headers: { 'content-type': 'text/html' } });
    },
  };
  return { config, commands, requests, record, deps };
}

test('recuperación por ID o URL reutiliza READY y solo promueve tras validar todo', async () => {
  for (const reference of ['dpl_Existing', 'https://immutable.vercel.app']) {
    const f = recoveryFixture(); f.config.RECOVERY_DEPLOYMENT = reference;
    await main('vercel-recover', f.config, f.deps);
    assert.deepEqual(f.commands.map((args) => args[0]), ['promote']);
    assert(f.requests.includes(env.BACKEND_HEALTH_URL));
    assert(f.requests.includes('https://immutable.vercel.app/login'));
    assert(f.requests.includes(env.FRONTEND_HEALTH_URL));
  }
});

test('recuperación sin autorización exacta nunca promueve ni repite despliegues', async () => {
  for (const authorization of [undefined, 'yes', `promote:${env.DEPLOY_SHA}:dpl_Other`]) {
    const f = recoveryFixture(); f.config.RECOVERY_PROMOTION_AUTHORIZATION = authorization;
    await assert.rejects(main('vercel-recover', f.config, f.deps), /RECOVERY_NOT_AUTHORIZED/);
    assert.equal(f.commands.length, 0);
  }
});

test('recuperación rechaza referencias arbitrarias y configuración incompleta antes de consultar', async () => {
  for (const reference of ['https://evil.test', 'https://immutable.vercel.app/login',
    'https://secret@immutable.vercel.app', 'https://immutable.vercel.app?token=private',
    'http://immutable.vercel.app', 'dpl_bad/../id', 'https://immutable.vercel.app:8443']) {
    const f = recoveryFixture(); f.config.RECOVERY_DEPLOYMENT = reference;
    await assert.rejects(main('vercel-recover', f.config, f.deps));
    assert.equal(f.requests.length, 0); assert.equal(f.commands.length, 0);
  }
  const f = recoveryFixture(); delete f.config.VERCEL_PROJECT_ID;
  await assert.rejects(main('vercel-recover', f.config, f.deps), /RECOVERY_INVALID/);
  assert.equal(f.requests.length, 0);
});

test('recuperación exige ID, organización, proyecto, SHA, main, READY y ausencia de errores', async () => {
  for (const change of [
    { id: 'dpl_Other' }, { ownerId: 'team-other' }, { ownerId: undefined },
    { projectId: 'prj-other' }, { readyState: 'BUILDING' }, { target: 'preview' },
    { meta: { githubCommitSha: 'b'.repeat(40), githubCommitRef: 'main' } },
    { meta: { githubCommitSha: env.DEPLOY_SHA, githubCommitRef: 'develop' } },
    { aliasError: 'private' }, { errorCode: 'private' }, { checksConclusion: 'failed' },
    { url: 'evil.test' }, { alias: ['frontend.example.test'] },
  ]) {
    const f = recoveryFixture(); Object.assign(f.record, change);
    await assert.rejects(main('vercel-recover', f.config, f.deps));
    assert.equal(f.commands.length, 0);
  }
});

test('recuperación falla cerrada si main cambia o health/backend/login no son válidos', async () => {
  for (const scenario of ['stale', 'backend', 'login', 'api']) {
    const f = recoveryFixture(); let reads = 0;
    const fetch = f.deps.fetchImpl;
    if (scenario === 'stale') f.deps.readMain = async () => ++reads > 1 ? 'b'.repeat(40) : env.DEPLOY_SHA;
    else f.deps.fetchImpl = async (url, options) => {
      if ((scenario === 'backend' && String(url) === env.BACKEND_HEALTH_URL) ||
          (scenario === 'api' && new URL(url).hostname === 'api.vercel.com')) return response({}, 503);
      if (scenario === 'login' && String(url).includes('/login')) return new Response('Error', { status: 200 });
      return fetch(url, options);
    };
    await assert.rejects(main('vercel-recover', f.config, f.deps));
    assert.equal(f.commands.length, 0);
  }
});

test('recuperación revalida identidad antes de promover y no reintenta CLI fallida', async () => {
  const f = recoveryFixture(); let apiReads = 0; const fetch = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, options) => {
    if (new URL(url).hostname === 'api.vercel.com' && ++apiReads === 2) f.record.ownerId = 'team-other';
    return fetch(url, options);
  };
  await assert.rejects(main('vercel-recover', f.config, f.deps)); assert.equal(f.commands.length, 0);
  const g = recoveryFixture(); let calls = 0;
  g.deps.runCli = async (args) => { assert.equal(args[0], 'promote'); calls++; throw new DeploymentError('VERCEL_COMMAND_FAILED'); };
  await assert.rejects(main('vercel-recover', g.config, g.deps), /VERCEL_COMMAND_FAILED/);
  assert.equal(calls, 1);
});

test('postcheck fallido tras promoción no crea otro deployment ni hace rollback', async () => {
  const f = recoveryFixture(); const fetch = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, options) => String(url) === env.FRONTEND_HEALTH_URL
    ? new Response('Error', { status: 503 }) : fetch(url, options);
  await assert.rejects(main('vercel-recover', f.config, f.deps), /POSTCHECK_FAILED/);
  assert.deepEqual(f.commands.map((args) => args[0]), ['promote']);
});

test('automático espera READY por API sin invocar inspect', async () => {
  const f = vercelDependencies({ failCli: 'inspect' });
  const fetch = f.fetchImpl; let reads = 0; const delays = [];
  f.wait = async (ms) => delays.push(ms);
  f.fetchImpl = async (url) => {
    if (new URL(url).pathname.startsWith('/v13/deployments/') && ++reads === 1)
      return response({ ...f.record, readyState: 'BUILDING', url: null });
    return fetch(url);
  };
  await main('vercel-deploy', env, f);
  assert(delays.includes(5000));
  assert.deepEqual(f.commands.map((args) => args[0]), ['deploy', 'promote']);
});

test('automático rechaza SHA, rama, proyecto, organización, errores y URL incorrectos', async () => {
  for (const change of [
    { meta: { githubCommitSha: 'b'.repeat(40), githubCommitRef: 'main' } },
    { meta: { githubCommitSha: env.DEPLOY_SHA, githubCommitRef: 'develop' } },
    { projectId: 'prj-other' }, { ownerId: 'team-other' },
    { readyState: 'ERROR' }, { readyState: 'CANCELED' }, { target: 'preview' },
    { errorCode: 'synthetic-secret' }, { aliasError: 'synthetic-secret' },
    { checksConclusion: 'failed' }, { url: 'private.test' }, { url: 'user:password@x.vercel.app' },
  ]) {
    const f = vercelDependencies(); Object.assign(f.record, change);
    await assert.rejects(main('vercel-deploy', env, f), /VERCEL_RELEASE_INVALID/);
    assert(!f.commands.some((args) => args[0] === 'promote'));
  }
});

test('API 401/403 falla sin reintento ni creación y sin revelar respuestas privadas', async () => {
  for (const status of [401, 403]) {
    const f = vercelDependencies(); let calls = 0;
    f.fetchImpl = async () => { calls++; return response({ error: 'synthetic-private-token' }, status); };
    await assert.rejects(main('vercel-deploy', env, f), (error) => {
      assert.equal(error.code, 'VERCEL_API_FAILED');
      assert(!safeFailure('vercel-deploy', error).includes('synthetic-private-token')); return true;
    });
    assert.equal(calls, 1); assert.equal(f.commands.length, 0);
  }
});

test('consultas Vercel reintentan red/503 acotadamente; JSON inválido falla cerrado', async () => {
  const f = vercelDependencies(); const fetch = f.fetchImpl; let count = 0; const delays = [];
  f.wait = async (ms) => delays.push(ms);
  f.fetchImpl = async (url) => {
    if (++count === 1) throw new Error('private-token https://private.test');
    if (count === 2) return response({}, 503);
    return fetch(url);
  };
  await main('vercel-deploy', env, f); assert.deepEqual(delays.slice(0, 2), [1000, 2000]);
  for (const scenario of ['network', 'json']) {
    const g = vercelDependencies(); let calls = 0;
    g.fetchImpl = async () => { calls++; if (scenario === 'network') throw new Error('private'); return new Response('{bad', { status: 200 }); };
    await assert.rejects(main('vercel-deploy', env, g), /VERCEL_API_FAILED/);
    assert.equal(calls, scenario === 'network' ? 3 : 1); assert.equal(g.commands.length, 0);
  }
});

test('espera READY agotada o señal vencida nunca permite promoción', async () => {
  const f = vercelDependencies(); f.record.readyState = 'BUILDING';
  await assert.rejects(main('vercel-deploy', env, f), /VERCEL_RELEASE_TIMEOUT/);
  assert(!f.commands.some((args) => args[0] === 'promote'));
  const g = vercelDependencies(); g.vercelSignal = AbortSignal.abort();
  await assert.rejects(main('vercel-deploy', env, g), /VERCEL_RELEASE_TIMEOUT/);
  assert.equal(g.commands.length, 0);
});

test('Render debe seguir live del SHA aprobado y ambos health deben pasar', async () => {
  for (const scenario of ['render-sha', 'render-state', 'backend-health', 'staging-health', 'final-health']) {
    const f = vercelDependencies(); const fetch = f.fetchImpl;
    f.fetchImpl = async (url) => {
      if (new URL(url).hostname === 'api.render.com') {
        if (scenario === 'render-sha') return response([{ deploy: { status: 'live', commit: { id: 'b'.repeat(40) } } }]);
        if (scenario === 'render-state') return response([{ deploy: { status: 'build_failed', commit: { id: env.DEPLOY_SHA } } }]);
      }
      if (scenario === 'backend-health' && String(url) === env.BACKEND_HEALTH_URL) return response({ status: 'disconnected' });
      if (scenario === 'staging-health' && new URL(url).hostname === f.record.url) return new Response('Error', { status: 200 });
      if (scenario === 'final-health' && String(url) === env.FRONTEND_HEALTH_URL) return new Response('Error', { status: 503 });
      return fetch(url);
    };
    await assert.rejects(main('vercel-deploy', env, f));
    assert.equal(f.commands.filter((a) => a[0] === 'promote').length, scenario === 'final-health' ? 1 : 0);
  }
});

test('reintento del mismo SHA reutiliza deployment; ya promovido no vuelve a mutar', async () => {
  const f = vercelDependencies();
  await main('vercel-deploy', env, f);
  await main('vercel-deploy', env, f);
  assert.deepEqual(f.commands.map((args) => args[0]), ['deploy', 'promote']);
  const g = vercelDependencies(); g.state.created = true;
  await main('vercel-deploy', env, g);
  assert.deepEqual(g.commands.map((args) => args[0]), ['promote']);
});

test('listado con duplicados o búsqueda incompleta nunca crea otro deployment', async () => {
  for (const scenario of ['duplicates', 'pagination', 'invalid']) {
    const f = vercelDependencies(); let reads = 0; const fetch = f.fetchImpl;
    f.fetchImpl = async (url) => {
      if (new URL(url).pathname.startsWith('/v9/projects/')) return fetch(url);
      reads++;
      if (scenario === 'invalid') return response({ deployments: [{}] });
      return response({ deployments: [
        { uid: 'dpl_One', meta: f.record.meta },
        ...(scenario === 'duplicates' ? [{ uid: 'dpl_Two', meta: f.record.meta }] : []),
      ], pagination: { next: scenario === 'pagination' ? reads : null } });
    };
    await assert.rejects(main('vercel-deploy', env, f), /VERCEL_DUPLICATES|VERCEL_API_FAILED/);
    assert.equal(f.commands.length, 0);
    assert(reads <= 5);
  }
});

test('creación aceptada con CLI fallida o stdout inválido solo reconcilia por GET', async () => {
  for (const scenario of ['cli', 'stdout']) {
    const f = vercelDependencies(); const cli = f.runCli;
    f.runCli = async (args) => {
      if (args[0] !== 'deploy') return cli(args);
      f.commands.push(args); f.state.created = true;
      if (scenario === 'cli') throw Object.assign(new DeploymentError('VERCEL_COMMAND_FAILED'),
        { command: 'vercel_deploy', reason: 'exit_nonzero', category: 'unknown', exitCode: 1 });
      return 'not-a-valid-cli-result';
    };
    await main('vercel-deploy', env, f);
    assert.deepEqual(f.commands.map((args) => args[0]), ['deploy', 'promote']);
  }
});

test('creación ambigua sin candidato no se repite y permiso CLI denegado falla cerrado', async () => {
  for (const category of ['unknown', 'permission']) {
    const f = vercelDependencies();
    f.runCli = async (args) => { f.commands.push(args); throw Object.assign(new DeploymentError('VERCEL_COMMAND_FAILED'),
      { command: 'vercel_deploy', reason: 'exit_nonzero', category, exitCode: 1 }); };
    await assert.rejects(main('vercel-deploy', env, f), category === 'permission' ? /VERCEL_COMMAND_FAILED/ : /VERCEL_DEPLOY_AMBIGUOUS/);
    assert.deepEqual(f.commands.map((args) => args[0]), ['deploy']);
  }
});

test('promoción fallida o ambigua no se repite; API confirmada permite terminar', async () => {
  for (const scenario of ['failed', 'ambiguous', 'accepted']) {
    const f = vercelDependencies(); const cli = f.runCli;
    f.runCli = async (args) => {
      if (args[0] !== 'promote') return cli(args);
      f.commands.push(args); f.state.promoted = scenario === 'accepted';
      throw Object.assign(new DeploymentError('VERCEL_COMMAND_FAILED'), { command: 'vercel_promote',
        reason: scenario === 'failed' ? 'exit_nonzero' : 'timeout', category: scenario === 'failed' ? 'permission' : 'unknown', exitCode: 1 });
    };
    if (scenario === 'accepted') await main('vercel-deploy', env, f);
    else await assert.rejects(main('vercel-deploy', env, f), scenario === 'failed' ? /VERCEL_COMMAND_FAILED/ : /VERCEL_PROMOTION_AMBIGUOUS/);
    assert.equal(f.commands.filter((args) => args[0] === 'promote').length, 1);
  }
});

test('alias a otro deployment impide éxito aunque READY y HTML sean correctos', async () => {
  const f = vercelDependencies(); const fetch = f.fetchImpl;
  f.fetchImpl = async (url) => new URL(url).pathname.startsWith('/v4/aliases/')
    ? response({ alias: 'frontend.example.test', projectId: env.VERCEL_PROJECT_ID, deploymentId: 'dpl_Other' }) : fetch(url);
  await assert.rejects(main('vercel-deploy', env, f), /POSTCHECK_FAILED/);
  assert.equal(f.commands.filter((a) => a[0] === 'promote').length, 1);
});

test('CLI fija proyecto para pull y scope para otros comandos, sin entregar credenciales Render', async () => {
  for (const subcommand of ['pull', 'build', 'deploy', 'inspect', 'promote']) {
    let calls = 0;
    await cli([subcommand], env, async (binary, args, childEnv, timeout, label) => {
      calls++;
      assert.equal(binary, 'vercel');
      assert.deepEqual(args, subcommand === 'pull'
        ? [subcommand, '--project', env.VERCEL_PROJECT_ID]
        : [subcommand, '--scope', env.VERCEL_ORG_ID]);
      assert(!args.includes('--token'));
      assert.equal(childEnv.VERCEL_TOKEN, env.VERCEL_TOKEN);
      assert.equal(childEnv.VERCEL_ORG_ID, env.VERCEL_ORG_ID);
      assert.equal(childEnv.VERCEL_PROJECT_ID, env.VERCEL_PROJECT_ID);
      assert.equal(childEnv.RENDER_API_KEY, undefined);
      assert.equal(childEnv.RENDER_DEPLOY_HOOK_URL, undefined);
      assert.equal(label, `vercel_${subcommand}`);
      assert(timeout > 0); return '';
    });
    assert.equal(calls, 1);
  }
});

test('propietario del proyecto se verifica incluso si deployment omite ownerId', async () => {
  const f = vercelDependencies(); delete f.record.ownerId;
  await main('vercel-deploy', env, f);
  const g = vercelDependencies(); const fetch = g.fetchImpl;
  g.fetchImpl = async (url) => new URL(url).pathname.startsWith('/v9/projects/')
    ? response({ id: env.VERCEL_PROJECT_ID, accountId: 'team-other' }) : fetch(url);
  await assert.rejects(main('vercel-deploy', env, g), /VERCEL_RELEASE_INVALID/);
  assert.equal(g.commands.length, 0);
});

test('main o Render que cambian después de staging impiden promoción', async () => {
  for (const scenario of ['main', 'render']) {
    const f = vercelDependencies(); const fetch = f.fetchImpl; let stagingRead = false;
    f.readMain = async () => scenario === 'main' && stagingRead ? 'b'.repeat(40) : env.DEPLOY_SHA;
    f.fetchImpl = async (url) => {
      if (new URL(url).hostname === f.record.url) stagingRead = true;
      if (scenario === 'render' && stagingRead && new URL(url).hostname === 'api.render.com')
        return response([{ deploy: { status: 'live', commit: { id: 'b'.repeat(40) } } }]);
      return fetch(url);
    };
    await assert.rejects(main('vercel-deploy', env, f));
    assert(!f.commands.some((args) => args[0] === 'promote'));
  }
});

test('espera de propagación del alias es acotada y no reejecuta promote', async () => {
  const f = vercelDependencies(); const fetch = f.fetchImpl; let aliases = 0;
  f.fetchImpl = async (url) => {
    if (new URL(url).pathname.startsWith('/v4/aliases/') && ++aliases === 1)
      return response({ alias: 'frontend.example.test', projectId: env.VERCEL_PROJECT_ID, deploymentId: 'dpl_Previous' });
    return fetch(url);
  };
  await main('vercel-deploy', env, f);
  assert.equal(f.commands.filter((args) => args[0] === 'promote').length, 1);
  assert(aliases >= 2);
});

test('URL estable no se acepta como URL inmutable del deployment', async () => {
  const f = vercelDependencies();
  await assert.rejects(main('vercel-deploy', { ...env, FRONTEND_HEALTH_URL: `https://${f.record.url}/login` }, f), /VERCEL_RELEASE_INVALID/);
  assert(!f.commands.some((args) => args[0] === 'promote'));
});

test('alias que cambia después del health final impide declarar éxito', async () => {
  const f = vercelDependencies(); const fetch = f.fetchImpl; let frontendChecked = false;
  f.fetchImpl = async (url) => {
    if (String(url) === env.FRONTEND_HEALTH_URL) frontendChecked = true;
    if (frontendChecked && new URL(url).pathname.startsWith('/v4/aliases/'))
      return response({ alias: 'frontend.example.test', projectId: env.VERCEL_PROJECT_ID, deploymentId: 'dpl_Other' });
    return fetch(url);
  };
  await assert.rejects(main('vercel-deploy', env, f), /POSTCHECK_FAILED/);
  assert.equal(f.commands.filter((args) => args[0] === 'promote').length, 1);
});
