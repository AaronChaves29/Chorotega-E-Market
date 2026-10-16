const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const scripts = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
).scripts;

test('los comandos de Render usan JS compilado sin ts-node, Nest CLI ni seeds', () => {
  assert.equal(scripts['start:render'], 'node dist/deployment/start-render.js');
  assert.equal(
    scripts['migration:run:prod'],
    'node dist/deployment/migrate.js',
  );
});

for (const entry of ['migrate', 'start-render']) {
  test(`${entry} compilado rechaza configuración incompleta sin cargar .env ni conectar`, () => {
    // Sin heredar secretos ni variables privadas del proceso de desarrollo.
    const result = spawnSync(
      process.execPath,
      [`dist/deployment/${entry}.js`],
      {
        cwd: root,
        env: { NODE_ENV: 'production' },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /No se inició|Migraciones no completadas/);
    assert.doesNotMatch(
      result.stderr,
      /postgres(?:ql)?:\/\/|mongodb(?:\+srv)?:\/\/|\n\s+at /,
    );
  });
}

test('el artefacto carga tres migraciones JS y sus nueve entidades sin herramientas de desarrollo', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const { createProductionMigrationDataSource } = require('./dist/database/production-migrations.js');
    const source = createProductionMigrationDataSource({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/compiled_test', DATABASE_SSL: 'true' });
    (async () => {
      await source.buildMetadatas();
      assert.equal(source.isInitialized, false);
      assert.equal(source.entityMetadatas.length, 9);
      assert.equal(source.migrations.length, 3);
      assert.equal(source.options.synchronize, false);
      assert.equal(source.options.migrationsRun, false);
      assert.equal(source.options.ssl.rejectUnauthorized, true);
      assert.equal(Object.keys(require.cache).some(path => /node_modules[\\\\/](ts-node|typescript|@nestjs[\\\\/]cli)[\\\\/]/.test(path)), false);
    })().catch(() => { process.exitCode = 1; });
  `,
    ],
    {
      cwd: root,
      env: { NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
});
