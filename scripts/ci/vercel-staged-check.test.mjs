import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { DeploymentError } from './production-deploy.mjs';
import { TARGET_SHA, AUTHORIZATION_MARKER, authorizeStaged, stagedCheck, stagedFailure, stagedCli } from './vercel-staged-check.mjs';

const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const login = '<title>Chorotega</title><h2 id="login-title"></h2><input id="correo"><input id="clave">';
function fixture() {
  const env = {
    GITHUB_REPOSITORY: 'AaronChaves29/Chorotega-E-Market', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/develop',
    STAGED_CONFIRMATION: AUTHORIZATION_MARKER,
    DEPLOY_SHA: TARGET_SHA, STAGED_VALIDATOR_SHA: 'f'.repeat(40),
    STAGED_PREVIOUS_DEPLOYMENT_ID: 'dpl_Previous', STAGED_PREVIOUS_SHA: '9e353f3' + 'a'.repeat(33),
    STAGED_BACKUP_VERIFIED: 'true',
    STAGED_BACKUP_EVIDENCE: 'https://github.com/AaronChaves29/Chorotega-E-Market/issues/1#issuecomment-1',
    STAGED_APPROVAL_REFERENCE: 'https://github.com/AaronChaves29/Chorotega-E-Market/pull/1#issuecomment-2',
    VERCEL_TOKEN: 'synthetic-token', VERCEL_ORG_ID: 'team_Authorized', VERCEL_PROJECT_ID: 'prj_Authorized',
    RENDER_API_KEY: 'synthetic-render-key', RENDER_SERVICE_ID: 'srv-synthetic',
    FRONTEND_HEALTH_URL: 'https://frontend.example.test/login',
  };
  env.STAGED_AUTHORIZATION = `stage:${TARGET_SHA}:${env.STAGED_VALIDATOR_SHA}:${env.STAGED_PREVIOUS_DEPLOYMENT_ID}:${env.STAGED_BACKUP_EVIDENCE}`;
  const record = { id: 'dpl_Staged', ownerId: env.VERCEL_ORG_ID, projectId: env.VERCEL_PROJECT_ID,
    target: 'production', readyState: 'READY', url: 'immutable-staged.vercel.app', aliasAssigned: false, alias: [],
    meta: { githubCommitSha: TARGET_SHA, githubCommitRef: 'main' } };
  const previous = { ...record, id: env.STAGED_PREVIOUS_DEPLOYMENT_ID,
    meta: { githubCommitSha: env.STAGED_PREVIOUS_SHA, githubCommitRef: 'main' },
    url: 'immutable-previous.vercel.app', aliasAssigned: true, alias: ['frontend.example.test'] };
  const project = { id: env.VERCEL_PROJECT_ID, accountId: env.VERCEL_ORG_ID, rootDirectory: 'apps/frontend', nodeVersion: '24.x' };
  const state = { created: false, aliasChanged: false };
  const commands = [], requests = [];
  const deps = {
    readMain: async () => TARGET_SHA, readSource: async () => TARGET_SHA,
    readValidator: async () => env.STAGED_VALIDATOR_SHA, checkTracked: async () => {},
    readProject: () => ({ projectId: env.VERCEL_PROJECT_ID, orgId: env.VERCEL_ORG_ID,
      settings: { rootDirectory: 'apps/frontend', nodeVersion: '24.x' } }),
    readPrebuilt: () => ({ config: { version: 3 }, builds: { target: 'production' } }),
    wait: async () => {}, attempts: 2, healthAttempts: 1,
    runCli: async (args) => {
      commands.push(args); assert(['pull', 'build', 'deploy'].includes(args[0]));
      if (args[0] === 'deploy') { state.created = true; return JSON.stringify({ deployment: { id: record.id } }); }
      return '';
    },
    fetchImpl: async (url, options = {}) => {
      assert.equal(options.method ?? 'GET', 'GET', 'Nunca se muta un proveedor mediante HTTP');
      requests.push(String(url)); const u = new URL(url);
      if (u.hostname === 'api.render.com') {
        assert(u.pathname.endsWith('/deploys')); assert.equal(u.searchParams.get('limit'), '1');
        return response([{ deploy: { status: 'live', commit: { id: TARGET_SHA } } }]);
      }
      if (u.hostname === 'api.vercel.com') {
        assert.equal(u.searchParams.get('teamId'), env.VERCEL_ORG_ID);
        if (u.pathname.startsWith('/v9/projects/')) return response(project);
        if (u.pathname.startsWith('/v4/aliases/')) return response({ alias: 'frontend.example.test',
          projectId: env.VERCEL_PROJECT_ID, deploymentId: state.aliasChanged ? 'dpl_Unapproved' : previous.id });
        if (u.pathname === '/v7/deployments') {
          assert.equal(u.searchParams.get('sha'), TARGET_SHA); assert.equal(u.searchParams.get('target'), 'production');
          return response({ deployments: state.created ? [{ uid: record.id, meta: record.meta }] : [], pagination: { next: null } });
        }
        if (u.pathname.endsWith(previous.id)) return response(previous);
        if (u.pathname.startsWith('/v13/deployments/')) return response(record);
      }
      assert.equal(String(url), `https://${record.url}/login`);
      return new Response(login, { headers: { 'content-type': 'text/html' } });
    },
  };
  return { env, deps, commands, requests, record, previous, project, state };
}

test('staged: autorización y respaldo pendientes bloquean antes de cualquier consulta', async () => {
  for (const change of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_REPOSITORY: 'other/fork' }, { DEPLOY_SHA: 'a'.repeat(40) },
    { STAGED_VALIDATOR_SHA: '0'.repeat(40) }, { STAGED_BACKUP_VERIFIED: 'false' },
    { STAGED_BACKUP_EVIDENCE: '' }, { STAGED_APPROVAL_REFERENCE: '' },
    { STAGED_PREVIOUS_DEPLOYMENT_ID: '' }, { STAGED_PREVIOUS_SHA: '' }, { STAGED_AUTHORIZATION: '' },
    { STAGED_CONFIRMATION: '' }, { GITHUB_EVENT_NAME: 'push' }, { VERCEL_TOKEN: '' }]) {
    const f = fixture(); Object.assign(f.env, change);
    await assert.rejects(stagedCheck('stage', f.env, f.deps), /STAGED_NOT_AUTHORIZED/);
    assert.equal(f.requests.length, 0); assert.equal(f.commands.length, 0);
  }
  assert.throws(() => authorizeStaged({}), /STAGED_NOT_AUTHORIZED/);
});

test('staged: fuente, validador y cambios tracked se comprueban sin mezclar SHAs', async () => {
  for (const key of ['readSource', 'readValidator', 'checkTracked']) {
    const f = fixture(); f.deps[key] = async () => { if (key === 'checkTracked') throw new Error('changed'); return 'a'.repeat(40); };
    await assert.rejects(stagedCheck('stage', f.env, f.deps));
    assert.equal(f.requests.length, 0); assert.equal(f.commands.length, 0);
  }
});

test('staged: preflight hace solo GET y no ejecuta build ni creación', async () => {
  const f = fixture(); await stagedCheck('preflight', f.env, f.deps);
  assert.equal(f.commands.length, 0); assert(f.requests.some((url) => url.startsWith('https://api.render.com/')));
});

test('staged: CLI recibe contexto main de la fuente y no credenciales Render o aprobación', async () => {
  const f = fixture(); const original = structuredClone(f.env);
  await stagedCli(['build', '--prod'], { ...f.env, GITHUB_SHA: 'a'.repeat(40), GITHUB_EVENT_PATH: '/private-payload' },
    async (binary, args, env) => {
      assert.equal(binary, 'vercel'); assert.deepEqual(args, ['build', '--prod']);
      assert.equal(env.GITHUB_SHA, TARGET_SHA); assert.equal(env.GITHUB_REF, 'refs/heads/main');
      assert.equal(env.VERCEL_GIT_COMMIT_SHA, TARGET_SHA); assert.equal(env.VERCEL_GIT_COMMIT_REF, 'main');
      assert.equal(env.GITHUB_EVENT_PATH, undefined); assert.equal(env.RENDER_API_KEY, undefined);
      assert.equal(env.STAGED_AUTHORIZATION, undefined); assert.equal(env.VERCEL_TOKEN, f.env.VERCEL_TOKEN);
    });
  assert.deepEqual(f.env, original);
  await assert.rejects(stagedCli(['promote'], f.env), /STAGED_NOT_AUTHORIZED/);
});

test('staged: rechaza main, Render, proyecto, equipo, raíz o Node diferentes antes de crear', async () => {
  for (const scenario of ['main', 'render', 'project', 'team', 'root', 'node']) {
    const f = fixture(); const fetch = f.deps.fetchImpl;
    if (scenario === 'main') f.deps.readMain = async () => 'a'.repeat(40);
    if (scenario === 'project') f.project.id = 'prj_Other';
    if (scenario === 'team') f.project.accountId = 'team_Other';
    if (scenario === 'root') f.project.rootDirectory = 'other';
    if (scenario === 'node') f.project.nodeVersion = '22.x';
    if (scenario === 'render') f.deps.fetchImpl = async (url, options) => new URL(url).hostname === 'api.render.com'
      ? response([{ deploy: { status: 'live', commit: { id: 'a'.repeat(40) } } }]) : fetch(url, options);
    await assert.rejects(stagedCheck('stage', f.env, f.deps)); assert.equal(f.commands.length, 0);
  }
});

test('staged: autenticación o permisos API fallidos impiden mutaciones', async () => {
  for (const status of [401, 403]) {
    const f = fixture(); f.deps.fetchImpl = async () => response({ message: 'private' }, status);
    await assert.rejects(stagedCheck('stage', f.env, f.deps), /VERCEL_API_FAILED/);
    assert.equal(f.commands.length, 0);
  }
});

test('staged: crea una vez con flags exactos, metadata main y sin Promote/Render/Rollback', async () => {
  const f = fixture(); assert.equal(await stagedCheck('stage', f.env, f.deps), f.record.id);
  assert.deepEqual(f.commands, [
    ['pull', '--yes', '--environment=production', '--project', f.env.VERCEL_PROJECT_ID],
    ['build', '--prod'],
    ['deploy', '--prebuilt', '--prod', '--skip-domain', '--yes', '--no-wait', '--json',
      '--meta', `githubCommitSha=${TARGET_SHA}`, '--meta', 'githubCommitRef=main', '--project', f.env.VERCEL_PROJECT_ID],
  ]);
  assert(!f.commands.flat().includes('--token')); assert(!f.commands.flat().includes('--force'));
  assert.equal(f.state.aliasChanged, false);
});

test('staged: enlace de proyecto o artefacto incorrecto impide deploy', async () => {
  for (const scenario of ['link', 'artifact']) {
    const f = fixture();
    if (scenario === 'link') f.deps.readProject = () => ({ projectId: 'wrong' });
    else f.deps.readPrebuilt = () => ({ config: { version: 3 }, builds: { target: 'preview' } });
    await assert.rejects(stagedCheck('stage', f.env, f.deps));
    assert(!f.commands.some((args) => args[0] === 'deploy'));
  }
});

test('staged: cambio de main después del build detiene la creación', async () => {
  for (const scenario of ['during-build', 'after-last-search']) {
    const f = fixture(); const fetch = f.deps.fetchImpl; let stale = false; let searches = 0;
    f.deps.readMain = async () => stale || (scenario === 'during-build' && f.commands.some((a) => a[0] === 'build')) ? 'a'.repeat(40) : TARGET_SHA;
    f.deps.fetchImpl = async (url, options) => {
      const result = await fetch(url, options);
      if (scenario === 'after-last-search' && new URL(url).pathname === '/v7/deployments' && ++searches === 2) stale = true;
      return result;
    };
    await assert.rejects(stagedCheck('stage', f.env, f.deps), /STALE_MAIN/);
    assert(!f.commands.some((args) => args[0] === 'deploy'));
  }
});

test('staged: deployment apropiado previo o creado durante build se recupera sin duplicar', async () => {
  for (const scenario of ['existing', 'during-build']) {
    const f = fixture(); const run = f.deps.runCli; f.state.created = scenario === 'existing';
    f.deps.runCli = async (args) => { const result = await run(args); if (args[0] === 'build') f.state.created = true; return result; };
    await stagedCheck('stage', f.env, f.deps);
    assert(!f.commands.some((args) => args[0] === 'deploy'));
    if (scenario === 'existing') assert.equal(f.commands.length, 0);
  }
});

test('staged: reejecutar el mismo ensayo conserva el ID y no repite build ni deploy', async () => {
  const f = fixture(); await stagedCheck('stage', f.env, f.deps); await stagedCheck('stage', f.env, f.deps);
  assert.deepEqual(f.commands.map((a) => a[0]), ['pull', 'build', 'deploy']);
});

test('staged: duplicados o listado incompleto impiden la creación', async () => {
  for (const scenario of ['duplicate', 'incomplete']) {
    const f = fixture(); const fetch = f.deps.fetchImpl;
    f.deps.fetchImpl = async (url, options) => new URL(url).pathname === '/v7/deployments'
      ? response({ deployments: scenario === 'duplicate' ? [
        { uid: 'dpl_One', meta: f.record.meta }, { uid: 'dpl_Two', meta: f.record.meta }] : [],
        ...(scenario === 'duplicate' ? { pagination: { next: null } } : {}) }) : fetch(url, options);
    await assert.rejects(stagedCheck('stage', f.env, f.deps), scenario === 'duplicate' ? /VERCEL_DUPLICATES/ : /VERCEL_API_FAILED/);
    assert.equal(f.commands.length, 0);
  }
});

test('staged: JSON plano, anidado, URL y salida ambigua se verifican por API', async () => {
  for (const output of [(f) => JSON.stringify({ id: f.record.id }), (f) => JSON.stringify({ deployment: { id: f.record.id } }),
    (f) => `https://${f.record.url}`, () => 'unparseable']) {
    const f = fixture(); const run = f.deps.runCli;
    f.deps.runCli = async (args) => { const result = await run(args); return args[0] === 'deploy' ? output(f) : result; };
    await stagedCheck('stage', f.env, f.deps);
    assert.equal(f.commands.filter((a) => a[0] === 'deploy').length, 1);
  }
});

test('staged: fallo CLI aceptado se reconcilia solo por GET, sin repetir deploy', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const accepted of [true, false]) {
    const f = fixture(); const run = f.deps.runCli;
    f.deps.runCli = async (args) => {
      if (args[0] !== 'deploy') return run(args);
      f.commands.push(args); f.state.created = accepted;
      throw Object.assign(new DeploymentError('VERCEL_COMMAND_FAILED'), { command: 'vercel_deploy', reason: 'exit_nonzero', category: 'unknown', exitCode: 1 });
    };
    if (accepted) await stagedCheck('stage', f.env, f.deps);
    else await assert.rejects(stagedCheck('stage', f.env, f.deps), /VERCEL_DEPLOY_AMBIGUOUS/);
    assert.equal(f.commands.filter((a) => a[0] === 'deploy').length, 1);
  }
});

test('staged: permiso CLI denegado conserva diagnóstico sanitizado y nunca reintenta creación', async (t) => {
  const logs = []; t.mock.method(console, 'error', (message) => logs.push(message));
  const f = fixture(); const run = f.deps.runCli;
  f.deps.runCli = async (args) => {
    if (args[0] !== 'deploy') return run(args);
    f.commands.push(args);
    throw Object.assign(new DeploymentError('VERCEL_COMMAND_FAILED'),
      { command: 'vercel_deploy', reason: 'exit_nonzero', category: 'permission', exitCode: 1 });
  };
  await assert.rejects(stagedCheck('stage', f.env, f.deps), /VERCEL_DEPLOY_AMBIGUOUS/);
  assert(logs.some((line) => line.includes('clase=permission')));
  assert(!logs.some((line) => line.includes(f.env.VERCEL_TOKEN)));
  assert.equal(f.commands.filter((a) => a[0] === 'deploy').length, 1);
});

test('staged: referencias CLI con ID o host contradictorio nunca se aceptan por sí solas', async () => {
  for (const output of [JSON.stringify({ id: 'dpl_Other' }), 'https://different.vercel.app']) {
    const f = fixture(); const run = f.deps.runCli;
    f.deps.runCli = async (args) => { const result = await run(args); return args[0] === 'deploy' ? output : result; };
    await assert.rejects(stagedCheck('stage', f.env, f.deps), /VERCEL_RELEASE_INVALID/);
    assert.equal(f.commands.filter((a) => a[0] === 'deploy').length, 1);
  }
});

test('staged: múltiples candidatos después de una creación detienen la comprobación', async () => {
  const f = fixture(); const fetch = f.deps.fetchImpl;
  f.deps.fetchImpl = async (url, options) => f.state.created && new URL(url).pathname === '/v7/deployments'
    ? response({ deployments: [{ uid: f.record.id, meta: f.record.meta },
      { uid: 'dpl_Other', meta: f.record.meta }], pagination: { next: null } }) : fetch(url, options);
  await assert.rejects(stagedCheck('stage', f.env, f.deps), /VERCEL_DUPLICATES/);
  assert.equal(f.commands.filter((a) => a[0] === 'deploy').length, 1);
});

test('staged: identidad incorrecta, URL ajena o estado no READY no autorizan éxito', async () => {
  for (const change of [{ ownerId: 'team_Other' }, { projectId: 'prj_Other' }, { target: 'preview' },
    { meta: { githubCommitSha: 'a'.repeat(40), githubCommitRef: 'main' } },
    { meta: { githubCommitSha: TARGET_SHA, githubCommitRef: 'develop' } },
    { url: 'evil.test' }, { readyState: 'ERROR' }, { errorCode: 'private' }, { readyState: 'BUILDING' }]) {
    const f = fixture(); f.state.created = true; Object.assign(f.record, change); const fetch = f.deps.fetchImpl;
    f.deps.fetchImpl = async (url, options) => new URL(url).pathname === '/v7/deployments'
      ? response({ deployments: [{ uid: f.record.id, meta: { githubCommitSha: TARGET_SHA, githubCommitRef: 'main' } }], pagination: { next: null } }) : fetch(url, options);
    await assert.rejects(stagedCheck('stage', f.env, f.deps)); assert.equal(f.commands.length, 0);
  }
});

test('staged: espera READY de manera acotada sin repetir creación', async () => {
  const f = fixture(); const fetch = f.deps.fetchImpl; let reads = 0; const delays = [];
  f.deps.wait = async (ms) => delays.push(ms);
  f.deps.fetchImpl = async (url, options) => new URL(url).pathname.endsWith(f.record.id) && ++reads <= 2
    ? response({ ...f.record, readyState: 'BUILDING' }) : fetch(url, options);
  await stagedCheck('stage', f.env, f.deps); assert(reads > 1);
  assert(delays.includes(5000));
  assert.equal(f.commands.filter((a) => a[0] === 'deploy').length, 1);
});

test('staged: alias previo diferente o cambio externo después de crear impide éxito', async () => {
  for (const scenario of ['before', 'after']) {
    const f = fixture(); const run = f.deps.runCli; f.state.aliasChanged = scenario === 'before';
    f.deps.runCli = async (args) => { const result = await run(args); if (args[0] === 'deploy') f.state.aliasChanged = true; return result; };
    await assert.rejects(stagedCheck('stage', f.env, f.deps), /STAGED_ALIAS_CHANGED/);
    assert.equal(f.commands.filter((a) => a[0] === 'deploy').length, scenario === 'before' ? 0 : 1);
    assert(!f.commands.some((a) => ['promote', 'rollback', 'redeploy'].includes(a[0])));
  }
});

test('staged: cambio del alias durante la última lectura del candidato no permite declarar éxito', async () => {
  const f = fixture(); const fetch = f.deps.fetchImpl; let candidateReads = 0;
  f.deps.fetchImpl = async (url, options) => {
    const response = await fetch(url, options);
    if (new URL(url).pathname.endsWith(f.record.id) && ++candidateReads === 3) f.state.aliasChanged = true;
    return response;
  };
  await assert.rejects(stagedCheck('stage', f.env, f.deps), /STAGED_ALIAS_CHANGED/);
  assert.equal(f.commands.filter((a) => a[0] === 'deploy').length, 1);
});

test('staged: alias de producción en candidato o login inválido no dan éxito', async () => {
  for (const scenario of ['alias', 'login']) {
    const f = fixture(); f.state.created = true; const fetch = f.deps.fetchImpl;
    if (scenario === 'alias') f.record.alias = ['frontend.example.test'];
    else f.deps.fetchImpl = async (url, options) => new URL(url).hostname === f.record.url
      ? new Response('Error', { headers: { 'content-type': 'text/html' } }) : fetch(url, options);
    await assert.rejects(stagedCheck('stage', f.env, f.deps)); assert.equal(f.commands.length, 0);
  }
});

test('staged: plazo agotado impide consultas y mutación', async () => {
  const f = fixture(); f.deps.signal = AbortSignal.abort();
  await assert.rejects(stagedCheck('stage', f.env, f.deps), /VERCEL_RELEASE_TIMEOUT/);
  assert.equal(f.requests.length, 0); assert.equal(f.commands.length, 0);
});

test('staged: diagnóstico solo contiene códigos permitidos, nunca secretos originales', () => {
  for (const value of [new Error('private-token https://secret.test'), Object.assign(new DeploymentError('private-token'), { stack: 'private-token' })])
    assert(!stagedFailure(value).includes('private-token'));
  assert(stagedFailure(new DeploymentError('STAGED_NOT_AUTHORIZED')).includes('STAGED_NOT_AUTHORIZED'));
});

test('staged: workflow manual inerte, checkout doble fijado, autorización adicional y ninguna ruta PR/main', () => {
  const require = createRequire(new URL('../../apps/backend/package.json', import.meta.url));
  const { load } = require('js-yaml');
  const workflow = load(readFileSync(new URL('../../.github/workflows/vercel-staged-check.yml', import.meta.url), 'utf8'));
  const job = workflow.jobs.vercel_staged_check;
  assert.equal(job.needs, undefined); assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.authorization.required, true);
  assert.deepEqual(job.concurrency, { group: 'chorotega-production', 'cancel-in-progress': false });
  assert.equal(job.env.STAGED_VALIDATOR_SHA, '0'.repeat(40));
  assert.equal(job.env.STAGED_AUTHORIZATION, ''); assert.equal(job.env.STAGED_BACKUP_VERIFIED, 'false');
  const pinGate = job.steps[0].run;
  for (const sha of ['develop', 'refs/heads/develop', 'a'.repeat(39), '0'.repeat(40), 'f'.repeat(40)]) {
    const result = spawnSync('bash', ['-e', '-c', pinGate], { env: { STAGED_VALIDATOR_SHA: sha,
      STAGED_BACKUP_VERIFIED: 'true', STAGED_AUTHORIZATION: 'synthetic-confirmation' }, encoding: 'utf8' });
    assert.equal(result.status, sha === 'f'.repeat(40) ? 0 : 1);
  }
  assert.equal(job.environment, undefined, 'No fingir un Environment protegido que no existe');
  const condition = job.if.match(/^\$\{\{\s*(.*?)\s*\}\}$/)[1]; assert(condition.startsWith('false && '));
  const evaluate = (expression) => Function('github', 'inputs', `return (${expression})`);
  for (const repository of ['AaronChaves29/Chorotega-E-Market', 'other/fork'])
    for (const event_name of ['push', 'pull_request', 'workflow_dispatch'])
      for (const ref of ['refs/heads/main', 'refs/heads/develop', 'refs/heads/test/work'])
        for (const marker of ['', AUTHORIZATION_MARKER]) {
          const github = { repository, event_name, ref }; const inputs = { authorization: marker };
          assert.equal(evaluate(condition)(github, inputs), false);
          assert.equal(evaluate(condition.slice('false && '.length))(github, inputs),
            repository === 'AaronChaves29/Chorotega-E-Market' && event_name === 'workflow_dispatch' && ref === 'refs/heads/develop' && marker === AUTHORIZATION_MARKER);
        }
  const checkouts = job.steps.filter((s) => s.uses?.startsWith('actions/checkout@'));
  assert.equal(checkouts[0].with.ref, '${{ env.STAGED_VALIDATOR_SHA }}');
  assert.equal(checkouts[1].with.ref, TARGET_SHA);
  assert(checkouts.every((s) => s.with['persist-credentials'] === false));
  for (const s of job.steps) assert(!JSON.stringify(s.env ?? {}).includes('RENDER_DEPLOY_HOOK_URL'));
  assert.equal(job.steps.at(-1).if, '${{ always() }}');
  const gate = job.steps.findIndex((step) => step.name.includes('Exigir CI exitoso'));
  const secretStep = job.steps.findIndex((step) => JSON.stringify(step.env ?? {}).includes('secrets.'));
  assert(gate >= 0 && gate < secretStep);
  assert(!Object.values(job.env).some((x) => String(x).includes('secrets.')));
});

test('staged: gate de CI exige run y ambos jobs del SHA correcto, con respuestas simuladas', () => {
  const require = createRequire(new URL('../../apps/backend/package.json', import.meta.url));
  const { load } = require('js-yaml');
  const workflow = load(readFileSync(new URL('../../.github/workflows/vercel-staged-check.yml', import.meta.url), 'utf8'));
  const step = workflow.jobs.vercel_staged_check.steps.find((s) => s.name.includes('Exigir CI exitoso'));
  const script = step.run.match(/<<'NODE'\n([\s\S]*?)\nNODE\s*$/)[1];
  const sha = 'f'.repeat(40);
  for (const scenario of ['success', 'failed-run', 'newer-failed', 'wrong-sha', 'wrong-branch', 'wrong-event', 'failed-job', 'missing-job', 'incomplete', 'missing-count', 'permission']) {
    const run = { id: 1, path: '.github/workflows/ci.yml', head_sha: sha, head_branch: 'develop', event: 'push', status: 'completed', conclusion: 'success' };
    if (scenario === 'failed-run') run.conclusion = 'failure';
    if (scenario === 'wrong-sha') run.head_sha = 'a'.repeat(40);
    if (scenario === 'wrong-branch') run.head_branch = 'main';
    if (scenario === 'wrong-event') run.event = 'pull_request';
    const jobs = ['Build Backend', 'Build Frontend'].map((name) => ({ name, status: 'completed', conclusion: 'success' }));
    if (scenario === 'failed-job') jobs[0].conclusion = 'failure';
    if (scenario === 'missing-job') jobs.pop();
    const runs = { total_count: scenario === 'incomplete' ? 2 : 1, workflow_runs: [run] };
    if (scenario === 'missing-count') delete runs.total_count;
    if (scenario === 'newer-failed') { runs.workflow_runs.push({ ...run, id: 2, conclusion: 'failure' }); runs.total_count = 2; }
    const harness = `globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('/jobs?') ? ${JSON.stringify({ total_count: jobs.length, jobs })} : ${JSON.stringify(runs)}), { status: ${scenario === 'permission' ? 403 : 200} });\n`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', harness + script],
      { env: { STAGED_VALIDATOR_SHA: sha, GH_TOKEN: 'synthetic-private-token' }, encoding: 'utf8', timeout: 5000 });
    assert.equal(child.status, scenario === 'success' ? 0 : 1);
    assert(!`${child.stdout}${child.stderr}`.includes('synthetic-private-token'));
  }
});
