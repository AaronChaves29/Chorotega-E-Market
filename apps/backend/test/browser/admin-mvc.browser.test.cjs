const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { Module } = require('@nestjs/common');
const { ConfigModule } = require('@nestjs/config');
const { Test } = require('@nestjs/testing');
const { getDataSourceToken } = require('@nestjs/typeorm');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { DataSource } = require('typeorm');
const bcrypt = require('bcrypt');
const { startChromeBrowser } = require('../support/chrome-browser.cjs');
const { AdminModule } = require('../../dist/admin/admin.module.js');
const { configureAdminViews } = require('../../dist/admin/admin-views.js');
const { configureHttp } = require('../../dist/common/http/configure-http.js');
const {
  createDatabaseOptions,
} = require('../../dist/database/database.options.js');
const {
  CreateInitialSchema1788732000000,
} = require('../../dist/database/migrations/1788732000000-CreateInitialSchema.js');
const {
  AlignTimestampDefaults1788998400000,
} = require('../../dist/database/migrations/1788998400000-AlignTimestampDefaults.js');
const {
  AddPasswordHashToUser1791352458237,
} = require('../../dist/database/migrations/1791352458237-AddPasswordHashToUser.js');
const { User } = require('../../dist/modules/users/entities/user.entity.js');
const { Store } = require('../../dist/modules/stores/entities/store.entity.js');
const {
  Category,
} = require('../../dist/modules/categories/entities/category.entity.js');
const {
  Product,
} = require('../../dist/modules/products/entities/product.entity.js');

class BrowserDatabaseModule {}
Module({})(BrowserDatabaseModule);

test(
  'MVC en navegador real: origen, sesión, validación, CSRF, PostgreSQL y PRG',
  { timeout: 180000 },
  async (t) => {
    let container, source, app, module, browser;
    try {
      container = await new PostgreSqlContainer('postgres:16')
        .withDatabase('mvc_browser_test')
        .withUsername('test')
        .withPassword(randomUUID())
        .withLabels({ 'chorotega.test-suite': 'browser' })
        .withStartupTimeout(120000)
        .start();
      source = new DataSource({
        ...createDatabaseOptions(container.getConnectionUri(), 'false', {
          production: false,
        }),
        migrations: [
          CreateInitialSchema1788732000000,
          AlignTimestampDefaults1788998400000,
          AddPasswordHashToUser1791352458237,
        ],
        logging: false,
      });
      await source.initialize();
      await source.runMigrations();
      const password = randomUUID();
      const hash = await bcrypt.hash(password, 10);
      await source.getRepository(User).save({
        authId: randomUUID(),
        nombre: 'Administrador',
        apellido: 'Prueba',
        correo: 'browser-admin@example.test',
        rol: 'ADMIN',
        estado: 'ACTIVO',
        claveHash: hash,
      });
      const owner = await source.getRepository(User).save({
        authId: randomUUID(),
        nombre: 'Propietario',
        apellido: 'Prueba',
        correo: 'browser-owner@example.test',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      });
      const store = await source.getRepository(Store).save({
        idEmprendedor: owner.idUsuario,
        nombre: 'Tienda inicial',
        direccion: 'Nicoya',
      });
      const category = await source
        .getRepository(Category)
        .save({ nombre: 'Categoría inicial' });
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            ignoreEnvVars: true,
            skipProcessEnv: true,
            load: [
              () => ({
                NODE_ENV: 'test',
                JWT_SECRET: randomBytes(32).toString('hex'),
              }),
            ],
          }),
          {
            module: BrowserDatabaseModule,
            global: true,
            providers: [{ provide: getDataSourceToken(), useValue: source }],
            exports: [getDataSourceToken()],
          },
          AdminModule,
        ],
      }).compile();
      app = module.createNestApplication();
      // Reserva puerto dinámico antes de registrar las rutas; no hay tráfico hasta app.init().
      const server = app.getHttpServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const base = `http://127.0.0.1:${server.address().port}`;
      configureAdminViews(app);
      configureHttp(app, [base]);
      await app.init();
      browser = await startChromeBrowser();
      const value = (selector, text) =>
        `document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(String(text))};`;
      const submit = (action, values) =>
        browser.submit(
          Object.entries(values)
            .map(([name, text]) => value(`#${name}`, text))
            .join('') +
            `document.querySelector('form[action="${action}"]').requestSubmit();`,
        );
      const path = () => browser.evaluate('location.pathname');
      await t.test(
        'login del formulario conserva origen real y redirige con 303',
        async () => {
          await browser.navigate(`${base}/admin/login`);
          await submit('/admin/login', {
            correo: 'browser-admin@example.test',
            clave: password,
          });
          assert.equal(await path(), '/admin/products');
          assert.ok(
            browser.requests.some(
              (r) =>
                r.method === 'POST' &&
                r.path === '/admin/login' &&
                r.origin === base,
            ),
          );
          assert.ok(
            browser.redirects.some(
              (r) => r.path === '/admin/login' && r.status === 303,
            ),
          );
        },
      );
      await t.test('GET login conserva la sesión ADMIN y el CSRF', async () => {
        const previous = await browser.evaluate(
          'document.querySelector("input[name=_csrf]").value',
        );
        await browser.navigate(`${base}/admin/login`);
        assert.equal(await path(), '/admin/products');
        assert.ok(
          (await browser.evaluate(
            'document.querySelector("input[name=_csrf]").value',
          )) === previous,
        );
      });
      await t.test(
        'producto inválido muestra error, conserva valores y no escribe',
        async () => {
          await browser.navigate(`${base}/admin/products/new`);
          await submit('/admin/products', {
            idTienda: store.idTienda,
            idCategoria: category.idCategoria,
            nombre: 'Producto navegador',
            precio: '-1',
            cantidadDisponible: '2',
          });
          assert.ok(
            await browser.evaluate('!!document.querySelector("#error-precio")'),
          );
          assert.equal(
            await browser.evaluate('document.querySelector("#nombre").value'),
            'Producto navegador',
          );
          assert.equal(await source.getRepository(Product).count(), 0);
        },
      );
      await t.test(
        'producto válido persiste y POST 303 GET no repite la escritura',
        async () => {
          await submit('/admin/products', { precio: '12.50' });
          assert.equal(await path(), '/admin/products');
          assert.ok(
            browser.redirects.some(
              (r) => r.path === '/admin/products' && r.status === 303,
            ),
          );
          assert.equal(await source.getRepository(Product).count(), 1);
          const product = await source
            .getRepository(Product)
            .findOneByOrFail({ nombre: 'Producto navegador' });
          assert.equal(product.precio, '12.50');
          await browser.navigate(`${base}/admin/products`);
          assert.equal(await source.getRepository(Product).count(), 1);
        },
      );
      await t.test('tienda inválida muestra error y no escribe', async () => {
        await browser.navigate(`${base}/admin/stores/new`);
        await submit('/admin/stores', {
          idEmprendedor: '0',
          nombre: 'Tienda navegador',
          direccion: 'Nicoya',
        });
        assert.ok(
          await browser.evaluate(
            '!!document.querySelector("#error-idEmprendedor")',
          ),
        );
        assert.equal(
          await browser.evaluate('document.querySelector("#nombre").value'),
          'Tienda navegador',
        );
        assert.equal(await source.getRepository(Store).count(), 1);
      });
      await t.test('tienda válida persiste con PRG 303', async () => {
        await submit('/admin/stores', { idEmprendedor: owner.idUsuario });
        assert.equal(await path(), '/admin/stores');
        assert.ok(
          browser.redirects.some(
            (r) => r.path === '/admin/stores' && r.status === 303,
          ),
        );
        await browser.navigate(`${base}/admin/stores`);
        assert.equal(await source.getRepository(Store).count(), 2);
      });
      await t.test(
        'CSRF alterado en el navegador no permite escribir',
        async () => {
          await browser.navigate(`${base}/admin/products/new`);
          await browser.evaluate(
            `document.querySelector('form[action="/admin/products"] input[name="_csrf"]').value=${JSON.stringify('0'.repeat(64))}`,
          );
          await submit('/admin/products', {
            idTienda: store.idTienda,
            idCategoria: category.idCategoria,
            nombre: 'Prohibido',
            precio: '1',
            cantidadDisponible: '1',
          });
          assert.ok(
            await browser.evaluate('document.body.innerText.includes("403")'),
          );
          assert.equal(await source.getRepository(Product).count(), 1);
        },
      );
      await t.test(
        'Origin null y origen externo siguen rechazados',
        async () => {
          for (const origin of ['null', 'https://other.example.test']) {
            const response = await fetch(`${base}/admin/login`, {
              method: 'POST',
              headers: {
                Origin: origin,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: '',
            });
            assert.equal(response.status, 403);
          }
        },
      );
      await t.test('logout por formulario elimina el acceso', async () => {
        await browser.navigate(`${base}/admin/stores`);
        await browser.submit(
          'document.querySelector("form[action=\\"/admin/logout\\"]").requestSubmit();',
        );
        assert.equal(await path(), '/admin/login');
        await browser.navigate(`${base}/admin/products`);
        assert.equal(await path(), '/admin/login');
      });
    } finally {
      const errors = [];
      try {
        await browser?.close();
      } catch (error) {
        errors.push(error);
      }
      try {
        if (app) await app.close();
        else await module?.close();
      } catch (error) {
        errors.push(error);
      }
      try {
        if (source?.isInitialized) await source.destroy();
      } catch (error) {
        errors.push(error);
      }
      try {
        await container?.stop({
          timeout: 10000,
          remove: true,
          removeVolumes: true,
        });
      } catch (error) {
        errors.push(error);
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          'Falló la limpieza de las pruebas de navegador.',
        );
    }
  },
);
