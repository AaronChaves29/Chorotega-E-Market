const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { randomBytes } = require('node:crypto');

const root = resolve(__dirname, '../..');
const scripts = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
).scripts;

test('las seis vistas compiladas renderizan con dependencias de runtime y escapan datos', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const express = require('express');
    const { configureAdminViews } = require('./dist/admin/admin-views.js');
    const server = express();
    configureAdminViews({ getHttpAdapter: () => ({ getInstance: () => server }) });
    const views = ['login', 'products', 'stores', 'product-form', 'store-form', 'error'];
    Promise.all(views.map(view => new Promise((resolve, reject) => {
      server.render(view, { csrf: 'synthetic-csrf', content: [{nombre:'<script>unsafe</script>'}], values: {nombre:'<script>unsafe</script>'}}, (error, html) => {
        if (error) return reject(error);
        try {
          assert.match(html, /<!doctype html>/i);
          assert.doesNotMatch(html, /<script>/);
          if (['products', 'stores', 'product-form', 'store-form'].includes(view)) assert.match(html, /&lt;script&gt;/);
          resolve();
        } catch(error) { reject(error); }
      });
    }))).catch(error => { console.error(error.message); process.exitCode = 1; });
  `,
    ],
    {
      cwd: root,
      env: { NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
});

test('los comandos de Render usan JS compilado sin ts-node, Nest CLI ni seeds', () => {
  assert.equal(scripts.start, 'node dist/deployment/start-render.js');
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
    assert.equal(result.stderr, '');
    const records = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const diagnostic = records.find(
      (record) => record.event === 'startup_failure',
    );
    assert.equal(
      diagnostic.stage,
      entry === 'migrate' ? 'migraciones_postgresql' : 'validacion_variables',
    );
    assert.equal(diagnostic.type, 'Error');
    assert.match(
      diagnostic.message,
      /La variable(?: de entorno)? DATABASE_URL/,
    );
    assert(
      records.every(
        (record) =>
          record.timestamp && record.level && record.context && record.reason,
      ),
    );
    assert.doesNotMatch(
      result.stdout + result.stderr,
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

function productionEnvironment() {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost/compiled_test',
    DATABASE_SSL: 'true',
    MONGODB_URI: 'mongodb+srv://cluster.example.test/compiled_test',
    MONGODB_DATABASE: 'compiled_test',
    JWT_SECRET: randomBytes(32).toString('hex'),
    CORS_ORIGIN: 'https://frontend.example.test',
  };
}

for (const entry of ['migrate', 'start-render']) {
  test(`${entry} compilado muestra fallo PostgreSQL sin datos privados y sale con código 1`, () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), 'chorotega-startup-probe-'),
    );
    try {
      const preload = resolve(directory, 'preload.cjs');
      writeFileSync(
        preload,
        `
        const { DataSource } = require(${JSON.stringify(resolve(root, 'node_modules/typeorm'))});
        DataSource.prototype.initialize = async function () {
          throw Object.assign(new Error('postgresql://user:password-private-marker@host/db'), {code:'ENOTFOUND'});
        };
      `,
      );
      const result = spawnSync(
        process.execPath,
        ['--require', preload, `dist/deployment/${entry}.js`],
        {
          cwd: root,
          env: productionEnvironment(),
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stderr, '');
      const records = result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert(
        records.some(
          (record) =>
            record.event === 'startup_failure' &&
            record.stage === 'migraciones_postgresql' &&
            record.type === 'Error' &&
            record.code === 'ENOTFOUND',
        ),
      );
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /password-private-marker|postgresql:\/\/|\n\s+at /,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const entry of ['deployment/start-render', 'main']) {
  test(`${entry}: Nest real falla en un proveedor sin imprimir el error privado antes del diagnóstico`, () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), 'chorotega-startup-probe-'),
    );
    try {
      const preload = resolve(directory, 'preload.cjs');
      writeFileSync(
        preload,
        `
      const migrations = require(${JSON.stringify(resolve(root, 'dist/database/production-migrations.js'))});
      migrations.runProductionMigrations = async () => 0;
      const { AppModule } = require(${JSON.stringify(resolve(root, 'dist/app.module.js'))});
      // Sustituye las conexiones por un proveedor fallido solo en este proceso.
      Reflect.defineMetadata('imports', [], AppModule);
      Reflect.defineMetadata('providers', [{ provide: 'startup-probe', useFactory() {
        throw Object.assign(new Error('mongodb+srv://user:password-private-marker@host/db -----BEGIN CERTIFICATE----- certificate-private-marker'), {name:'MongoServerSelectionError',code:'ENOTFOUND'});
      }}], AppModule);
    `,
      );
      const result = spawnSync(
        process.execPath,
        ['--require', preload, `dist/${entry}.js`],
        {
          cwd: root,
          env: productionEnvironment(),
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stderr, '');
      const records = result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert(
        records.some(
          (record) =>
            record.event === 'startup_failure' &&
            record.stage === 'arranque_nestjs' &&
            record.type === 'MongoServerSelectionError' &&
            record.code === 'ENOTFOUND',
        ),
      );
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /password-private-marker|certificate-private-marker|mongodb\+srv:\/\/|BEGIN CERTIFICATE|\n\s+at /,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
