import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, classify } from './vercel-pull-check.mjs';

const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/develop',
  VERCEL_TOKEN: 'synthetic-private', VERCEL_ORG_ID: 'team-synthetic', VERCEL_PROJECT_ID: 'prj-synthetic' };
const project = { projectId: env.VERCEL_PROJECT_ID, orgId: env.VERCEL_ORG_ID,
  settings: { rootDirectory: 'apps/frontend', nodeVersion: '24.x' } };
const success = () => ({ status: 0 });

test('solo pull con proyecto explicito, captura privada y timeout', () => {
  let calls = 0;
  const message = check(env, (binary, args, options) => {
    calls++;
    assert.equal(binary, 'vercel');
    assert.deepEqual(args, ['pull', '--yes', '--environment=production', '--project=prj-synthetic']);
    assert.equal(options.env.VERCEL_TOKEN, env.VERCEL_TOKEN);
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
    assert.equal(options.timeout, 120000);
    return { status: 0, stdout: 'synthetic-private', stderr: 'synthetic-private' };
  }, () => project);
  assert(message.startsWith('result=success ')); assert.equal(calls, 1);
  assert(!message.includes('synthetic-private'));
});

test('PR, main, otras ramas y configuracion incompleta no ejecutan CLI', () => {
  for (const config of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_REF: 'refs/heads/test/example' }, { GITHUB_ACTIONS: 'false' }, { VERCEL_TOKEN: '' }]) {
    assert(check({ ...env, ...config }, () => assert.fail('No CLI')).startsWith('result=failed '));
  }
});

test('contexto incorrecto y lectura fallida no aprueban', () => {
  for (const [field, value, cause] of [['projectId', 'other', 'project_mismatch'],
    ['orgId', 'other', 'organization_mismatch'], ['rootDirectory', '.', 'root_directory_mismatch'],
    ['nodeVersion', '22.x', 'node_version_mismatch']]) {
    const changed = structuredClone(project);
    if (field in changed.settings) changed.settings[field] = value; else changed[field] = value;
    assert.equal(check(env, success, () => changed), `result=failed cause=${cause}`);
  }
  assert.equal(check(env, success, () => { throw Error('synthetic-private'); }), 'result=failed cause=project_settings_unreadable');
});

test('errores no imprimen stderr, stdout, argumentos ni objetos de error', () => {
  for (const [error, cause] of [[undefined, 'exit_nonzero'], [{ code: 'ETIMEDOUT' }, 'timeout'],
    [{ code: 'ENOBUFS' }, 'output_limit'], [{ code: 'ENOENT' }, 'spawn_failed']]) {
    const message = check(env, () => ({ status: 1, error, stdout: 'synthetic-private', stderr: 'Forbidden synthetic-private' }),
      () => assert.fail('No leer enlace tras fallo'));
    assert(message.includes(`cause=${cause}`)); assert(message.includes('class=permission'));
    assert(!message.includes('synthetic-private'));
  }
  assert.equal(check(env, () => { throw Error('synthetic-private'); }), 'result=failed command=vercel_pull cause=runner_failed');
});

test('clasificacion controlada y limitada', () => {
  for (const [reason, expected] of [['invalid_token', 'authentication'], ['forbidden', 'permission'],
    ['project_unauthorized', 'project'], ['scope_not_accessible', 'scope'], ['invalid_argument', 'arguments'],
    ['synthetic-private', 'unknown']]) assert.equal(classify(JSON.stringify({ reason }), ''), expected);
  assert.equal(classify('', 'ENOTFOUND synthetic-private'), 'network');
  assert.equal(classify('', ' '.repeat(8192) + 'Forbidden'), 'unknown');
});
