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
const { mkdtemp, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
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
const {
  AddProductVersion1793296800000,
} = require('../../dist/database/migrations/1793296800000-AddProductVersion.js');
const {
  AddStoreSocialContact1794772600000,
} = require('../../dist/database/migrations/1794772600000-AddStoreSocialContact.js');
const { Order } = require('../../dist/modules/orders/entities/order.entity.js');
const {
  Courier,
} = require('../../dist/modules/couriers/entities/courier.entity.js');
const {
  Delivery,
} = require('../../dist/modules/deliveries/entities/delivery.entity.js');
const {
  Neighborhood,
} = require('../../dist/modules/neighborhoods/entities/neighborhood.entity.js');
const {
  DeliveriesService,
} = require('../../dist/modules/deliveries/services/deliveries.service.js');
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
  'Entregas MVC en Chrome: formularios reales, seguridad y cinco anchos',
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
          AddProductVersion1793296800000,
          AddStoreSocialContact1794772600000,
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
      // Reuse the existing dependency-free CDP utility for viewport control and
      // screenshots. No frontend code or browser launcher is changed.
      const { chrome } =
        await import('../../../frontend/test/browser/support.mjs');
      browser = await chrome();
      const evidence = await mkdtemp(
        join(tmpdir(), 'chorotega-9b-responsive-'),
      );
      console.log(`Evidencia sintética temporal: ${evidence}`);
      const neighborhood = await source.getRepository(Neighborhood).save({
        nombre: 'Barrio sintético',
        tarifaEnvio: '100.00',
        estado: 'ACTIVO',
      });
      const customer = await source.getRepository(User).save({
        authId: randomUUID(),
        nombre: 'Cliente',
        apellido: 'Sintético',
        correo: 'customer@example.test',
        rol: 'CLIENTE',
        estado: 'ACTIVO',
        claveHash: hash,
      });
      const courierUser = await source.getRepository(User).save({
        authId: randomUUID(),
        nombre: 'Repartidor',
        apellido: 'Sintético',
        correo: 'courier@example.test',
        rol: 'REPARTIDOR',
        estado: 'ACTIVO',
        claveHash: hash,
      });
      const courier = await source.getRepository(Courier).save({
        idUsuario: courierUser.idUsuario,
        medioTransporte: 'Bicicleta',
        disponibilidad: 'DISPONIBLE',
      });
      const makeOrder = (estado = 'PREPARANDO') =>
        source.getRepository(Order).save({
          idCliente: customer.idUsuario,
          idTienda: store.idTienda,
          idBarrio: neighborhood.idBarrio,
          subtotal: '1000.00',
          tarifaEnvio: '100.00',
          total: '1100.00',
          direccionEntrega: 'Dirección sintética',
          estado,
        });
      const order = await makeOrder();
      const navigate = async (path, selector) => {
        await browser.navigate(`${base}${path}`);
        await browser.wait(
          `location.pathname === ${JSON.stringify(path.split('?')[0])} && !!document.querySelector(${JSON.stringify(selector)})`,
          'vista administrativa',
        );
      };
      const submit = (action) =>
        browser.evaluate(
          `document.querySelector(${JSON.stringify(`form[action="${action}"]`)}).requestSubmit()`,
        );
      const assignment = async (pedido, repartidor = courier.idRepartidor) => {
        await browser.fill('#idPedido', String(pedido));
        await browser.evaluate(
          `document.querySelector('#idRepartidor').value=${JSON.stringify(String(repartidor))}`,
        );
        await submit('/admin/deliveries');
      };
      await t.test('sin sesión redirige al acceso', async () => {
        await browser.navigate(`${base}/admin/deliveries`);
        await browser.wait(
          `location.pathname === '/admin/login' && !!document.querySelector('#correo')`,
          'redirección sin sesión',
        );
      });
      await t.test(
        'ADMIN inicia sesión y conserva navegación Productos/Tiendas/Entregas',
        async () => {
          await browser.fill('#correo', 'browser-admin@example.test');
          await browser.fill('#clave', password);
          await submit('/admin/login');
          await browser.wait(
            `location.pathname === '/admin/products' && !!document.querySelector('a[href="/admin/deliveries"]')`,
            'acceso ADMIN',
          );
          for (const path of ['products', 'stores', 'deliveries'])
            assert.ok(
              await browser.evaluate(
                `!!document.querySelector('nav a[href="/admin/${path}"]')`,
              ),
            );
        },
      );
      await t.test(
        'formulario inválido conserva valores y no guarda',
        async () => {
          await navigate('/admin/deliveries/new', '#idPedido');
          await assignment(0);
          await browser.wait(
            `!!document.querySelector('#error-idPedido')`,
            'validación servidor',
          );
          assert.equal(
            await browser.evaluate(`document.querySelector('#idPedido').value`),
            '0',
          );
          assert.equal(
            await browser.evaluate(
              `document.querySelector('#idRepartidor').value`,
            ),
            String(courier.idRepartidor),
          );
          assert.equal(await source.getRepository(Delivery).count(), 0);
        },
      );
      let delivery;
      await t.test(
        'asignación nativa guarda y redirige al detalle; recarga no repite',
        async () => {
          await assignment(order.idPedido);
          await browser.wait(
            `location.pathname.startsWith('/admin/deliveries/') && location.pathname !== '/admin/deliveries/new' && document.body.innerText.includes('ASIGNADA')`,
            'asignación y PRG',
          );
          delivery = await source
            .getRepository(Delivery)
            .findOneByOrFail({ idPedido: order.idPedido });
          assert.equal(
            (
              await source
                .getRepository(Courier)
                .findOneByOrFail({ idRepartidor: courier.idRepartidor })
            ).disponibilidad,
            'OCUPADO',
          );
          await navigate(
            `/admin/deliveries/${delivery.idEntrega}`,
            '#cancel-confirmation',
          );
          assert.equal(await source.getRepository(Delivery).count(), 1);
          assert.equal(
            await browser.evaluate(
              `document.querySelector('#cancel-confirmation').open`,
            ),
            false,
          );
        },
      );
      await t.test(
        'confirmación explícita cancela y libera repartidor con PRG',
        async () => {
          await browser.evaluate(
            `document.querySelector('#cancel-confirmation summary').click()`,
          );
          assert.equal(
            await browser.evaluate(
              `document.querySelector('#cancel-confirmation').open`,
            ),
            true,
          );
          await submit(`/admin/deliveries/${delivery.idEntrega}/cancel`);
          await browser.wait(
            `document.body.innerText.includes('CANCELADA') && !document.querySelector('#cancel-confirmation')`,
            'cancelación',
          );
          assert.equal(
            (
              await source
                .getRepository(Courier)
                .findOneByOrFail({ idRepartidor: courier.idRepartidor })
            ).disponibilidad,
            'DISPONIBLE',
          );
        },
      );
      await t.test(
        'cancelación duplicada directa no escribe y muestra 409 seguro',
        async () => {
          await browser.evaluate(
            `(() => { const form = document.createElement('form'); form.method = 'post'; form.action = '/admin/deliveries/${delivery.idEntrega}/cancel'; const input = document.querySelector('input[name="_csrf"]').cloneNode(); form.append(input); document.body.append(form); form.requestSubmit(); })()`,
          );
          await browser.wait(
            `document.body.innerText.includes('409') && document.body.innerText.includes('Consultar estado vigente')`,
            'conflicto cancelación',
          );
          assert.equal(
            (
              await source
                .getRepository(Delivery)
                .findOneByOrFail({ idEntrega: delivery.idEntrega })
            ).estado,
            'CANCELADA',
          );
        },
      );
      await t.test(
        'pedido no preparado produce error visible sin escritura',
        async () => {
          const pending = await makeOrder('CONFIRMADO');
          await navigate('/admin/deliveries/new', '#idPedido');
          await assignment(pending.idPedido);
          await browser.wait(
            `!!document.querySelector('[role="alert"]')`,
            'conflicto de pedido',
          );
          assert.ok(
            (await browser.evaluate('document.body.innerText')).includes(
              'conflicto',
            ),
          );
          assert.equal(await source.getRepository(Delivery).count(), 1);
        },
      );
      await t.test(
        'CSRF inválido en formulario real impide la asignación',
        async () => {
          await navigate('/admin/deliveries/new', '#idPedido');
          await browser.evaluate(
            `document.querySelector('form[action="/admin/deliveries"] input[name="_csrf"]').value = 'invalid'`,
          );
          await assignment(order.idPedido);
          await browser.wait(
            `document.body.innerText.includes('403')`,
            'CSRF rechazado',
          );
          assert.equal(await source.getRepository(Delivery).count(), 1);
        },
      );
      const active = await app.get(DeliveriesService).assignDelivery({
        idPedido: order.idPedido,
        idRepartidor: courier.idRepartidor,
      });
      const third = await makeOrder();
      await t.test('repartidor ocupado produce conflicto visible', async () => {
        await navigate('/admin/deliveries/new', '#idPedido');
        await assignment(third.idPedido);
        await browser.wait(
          `!!document.querySelector('[role="alert"]')`,
          'repartidor ocupado',
        );
        assert.ok(
          (await browser.evaluate('document.body.innerText')).includes(
            'conflicto',
          ),
        );
        assert.equal(await source.getRepository(Delivery).count(), 2);
      });
      await t.test(
        'paginación y filtros funcionan mediante formularios y enlaces HTML',
        async () => {
          await navigate(
            '/admin/deliveries?size=1&sortBy=idEntrega&sortDirection=ASC',
            'table',
          );
          assert.ok(
            await browser.evaluate(
              `document.body.innerText.includes('Total de registros: 2')`,
            ),
          );
          await browser.evaluate(
            `document.querySelector('[rel="next"]').click()`,
          );
          await browser.wait(
            `location.search.includes('page=1') && !!document.querySelector('[rel="prev"]')`,
            'página siguiente',
          );
          await browser.evaluate(
            `document.querySelector('#estado').value='ASIGNADA'; document.querySelector('form.filters').requestSubmit()`,
          );
          await browser.wait(
            `location.search.includes('estado=ASIGNADA') && document.body.innerText.includes('Total de registros: 1')`,
            'filtro de estado',
          );
          assert.ok(
            !(await browser.evaluate('location.search')).includes('page=1'),
          );
        },
      );
      for (const width of [320, 390, 768, 1280, 1440]) {
        await t.test(
          `responsive ${width}px: listado, asignación y detalle sin scroll de página`,
          async () => {
            await browser.call('Emulation.setDeviceMetricsOverride', {
              width,
              height: 1000,
              deviceScaleFactor: 1,
              mobile: false,
            });
            for (const [name, path, selector] of [
              ['listado', '/admin/deliveries?size=1', 'table'],
              ['asignacion', '/admin/deliveries/new', '#idPedido'],
              [
                'detalle',
                `/admin/deliveries/${active.idEntrega}`,
                '#cancel-confirmation',
              ],
            ]) {
              await navigate(path, selector);
              assert.equal(await browser.evaluate('window.innerWidth'), width);
              if (name === 'detalle') {
                await browser.evaluate(
                  `document.querySelector('#cancel-confirmation summary').focus()`,
                );
                assert.ok(
                  await browser.evaluate(
                    `document.activeElement.matches('#cancel-confirmation summary')`,
                  ),
                  'confirmación accesible por foco',
                );
                await browser.call('Input.dispatchKeyEvent', {
                  type: 'keyDown',
                  key: 'Enter',
                  code: 'Enter',
                  windowsVirtualKeyCode: 13,
                  text: '\r',
                });
                await browser.call('Input.dispatchKeyEvent', {
                  type: 'keyUp',
                  key: 'Enter',
                  code: 'Enter',
                  windowsVirtualKeyCode: 13,
                });
                assert.ok(
                  await browser.evaluate(
                    `document.querySelector('#cancel-confirmation').open`,
                  ),
                  'confirmación abierta con teclado',
                );
                assert.ok(
                  await browser.evaluate(
                    `(() => { const panel = document.querySelector('#cancel-confirmation'); return panel.scrollWidth <= panel.clientWidth; })()`,
                  ),
                  'texto y formulario abiertos sin desbordamiento',
                );
              }
              assert.ok(
                await browser.evaluate(
                  'document.documentElement.scrollWidth <= innerWidth',
                ),
                `${name}: overflow horizontal`,
              );
              assert.ok(
                await browser.evaluate(
                  `Array.from(document.querySelectorAll('nav a, summary, button, input:not([type="hidden"]), select')).every(el => { const rect = el.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })`,
                ),
                `${name}: control cortado`,
              );
              const screenshot = await browser.call('Page.captureScreenshot', {
                format: 'png',
                captureBeyondViewport: true,
              });
              await writeFile(
                join(evidence, `${name}-${width}.png`),
                Buffer.from(screenshot.data, 'base64'),
              );
            }
          },
        );
      }
      await t.test('EN_CAMINO no muestra acción de cancelación', async () => {
        await app
          .get(DeliveriesService)
          .startDelivery(active.idEntrega, courierUser.idUsuario);
        await navigate(`/admin/deliveries/${active.idEntrega}`, 'dl');
        assert.equal(
          await browser.evaluate(
            `!!document.querySelector('#cancel-confirmation')`,
          ),
          false,
        );
      });
      await t.test(
        'cierre de sesión retira acceso y CLIENTE no puede entrar',
        async () => {
          await submit('/admin/logout');
          await browser.wait(
            `location.pathname === '/admin/login' && !!document.querySelector('#correo')`,
            'cierre de sesión',
          );
          await browser.fill('#correo', 'customer@example.test');
          await browser.fill('#clave', password);
          await submit('/admin/login');
          await browser.wait(
            `document.body.innerText.includes('403')`,
            'rol prohibido',
          );
          await browser.navigate(`${base}/admin/deliveries`);
          await browser.wait(
            `location.pathname === '/admin/login' && !!document.querySelector('#correo')`,
            'acceso restringido',
          );
        },
      );
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
