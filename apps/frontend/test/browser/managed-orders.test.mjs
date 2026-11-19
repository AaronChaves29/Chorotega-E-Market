import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chrome, freePort, until } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../..");
const backend = createRequire(resolve(frontend, "../backend/package.json"));
backend("ts-node").register({
  project: resolve(frontend, "../backend/tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backend("./test/support/create-http-test-app.ts");
const { AuthModule } = backend("./src/auth/auth.module.ts");
const { StoresModule } = backend("./src/modules/stores/stores.module.ts");
const { User } = backend("./src/modules/users/entities/user.entity.ts");
const { Store } = backend("./src/modules/stores/entities/store.entity.ts");
const { JwtService } = backend("@nestjs/jwt");
const bcrypt = backend("bcrypt");
const { ProductsModule } = backend("./src/modules/products/products.module.ts");
const { CategoriesModule } = backend(
  "./src/modules/categories/categories.module.ts",
);
const { OrdersHttpModule } = backend(
  "./src/modules/orders/orders-http.module.ts",
);
const { Product } = backend(
  "./src/modules/products/entities/product.entity.ts",
);
const { Category } = backend(
  "./src/modules/categories/entities/category.entity.ts",
);
const { Neighborhood } = backend(
  "./src/modules/neighborhoods/entities/neighborhood.entity.ts",
);
const { Order } = backend("./src/modules/orders/entities/order.entity.ts");
const { OrderDetail: OrderLine } = backend(
  "./src/modules/order-details/entities/order-detail.entity.ts",
);
const { OrderPreparationService } = backend(
  "./src/modules/orders/services/order-preparation.service.ts",
);
const evidence = "/private/tmp/chorotega-phase8-order-evidence";

test(
  "Pedidos del emprendedor: Chrome → Next → Nest → PostgreSQL temporal",
  { timeout: 300000 },
  async (t) => {
    let context, next, browser;
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const password = "Solo prueba local temporal 123!";
    try {
      context = await createHttpTestApp([
        AuthModule,
        StoresModule,
        ProductsModule,
        CategoriesModule,
        OrdersHttpModule,
      ]);
      await context.app.listen(0, "127.0.0.1");
      const apiOrigin = await context.app.getUrl(),
        ds = context.database.dataSource;
      const accounts = {},
        tokens = {};
      for (const [key, rol] of Object.entries({
        owner: "EMPRENDEDOR",
        other: "EMPRENDEDOR",
        CLIENTE: "CLIENTE",
        ADMIN: "ADMIN",
        REPARTIDOR: "REPARTIDOR",
      })) {
        accounts[key] = await ds.getRepository(User).save({
          authId: randomUUID(),
          nombre: "Persona",
          apellido: "Temporal",
          correo: `${key}@example.test`,
          rol,
          estado: "ACTIVO",
          claveHash: await bcrypt.hash(password, 4),
        });
        const r = await fetch(`${apiOrigin}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correo: accounts[key].correo,
            clave: password,
          }),
        });
        assert.equal(r.status, 201);
        tokens[key] = (await r.json()).token;
      }
      const stores = ds.getRepository(Store),
        products = ds.getRepository(Product),
        orders = ds.getRepository(Order),
        lines = ds.getRepository(OrderLine);
      const own = await stores.save({
        idEmprendedor: accounts.owner.idUsuario,
        nombre: "Negocio de prueba",
        direccion: "Dirección sintética",
        estado: "ACTIVA",
      });
      const inactive = await stores.save({
        idEmprendedor: accounts.owner.idUsuario,
        nombre: "Segunda tienda inactiva",
        direccion: "Prueba",
        estado: "INACTIVA",
      });
      const foreign = await stores.save({
        idEmprendedor: accounts.other.idUsuario,
        nombre: "Tienda ajena",
        direccion: "Prueba",
        estado: "ACTIVA",
      });
      const empty = await stores.save({
        idEmprendedor: accounts.owner.idUsuario,
        nombre: "Sin pedidos",
        direccion: "Prueba",
        estado: "ACTIVA",
      });
      const category = await ds
        .getRepository(Category)
        .save({ nombre: "Categoría temporal" });
      const product = await products.save({
        idTienda: own.idTienda,
        idCategoria: category.idCategoria,
        nombre: "Nombre actual que no es histórico",
        precio: "99.99",
        cantidadDisponible: 20,
      });
      const neighborhood = await ds
        .getRepository(Neighborhood)
        .save({ nombre: "Barrio temporal", tarifaEnvio: "1.00" });
      const seedOrder = async (store, state) => {
        const o = await orders.save({
          idTienda: store.idTienda,
          idCliente: accounts.CLIENTE.idUsuario,
          idBarrio: neighborhood.idBarrio,
          estado: state,
          fechaCreacion: new Date(
            Date.UTC(2026, 10, 16, 12, 0, await orders.count()),
          ),
          direccionEntrega: "Dirección de entrega sintética",
          subtotal: "30.75",
          tarifaEnvio: "1.00",
          total: "31.75",
        });
        const p =
          store.idTienda === own.idTienda
            ? product
            : await products.save({
                idTienda: store.idTienda,
                idCategoria: category.idCategoria,
                nombre: "Producto de prueba",
                precio: "99.99",
                cantidadDisponible: 20,
              });
        await lines.save({
          idPedido: o.idPedido,
          idProducto: p.idProducto,
          cantidad: 3,
          precioUnitario: "10.25",
          subtotal: "30.75",
        });
        return o;
      };
      const items = [];
      for (const state of [
        "CONFIRMADO",
        "PENDIENTE",
        "PREPARANDO",
        "EN_CAMINO",
        "ENTREGADO",
        "CANCELADO",
        "CONFIRMADO",
        "CONFIRMADO",
      ])
        items.push(await seedOrder(own, state));
      const second = await seedOrder(inactive, "CONFIRMADO"),
        other = await seedOrder(foreign, "CONFIRMADO");
      const port = await freePort(),
        origin = `http://localhost:${port}`;
      let logs = "";
      next = spawn(
        process.execPath,
        [
          resolve(frontend, "node_modules/next/dist/bin/next"),
          "start",
          "-H",
          "127.0.0.1",
          "-p",
          String(port),
        ],
        {
          cwd: frontend,
          env: {
            ...process.env,
            API_URL: `${apiOrigin}/api/v1`,
            NODE_ENV: "production",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      for (const stream of [next.stdout, next.stderr])
        stream.on("data", (chunk) => {
          logs = (logs + chunk).slice(-10000);
        });
      await until(
        async () => {
          if (next.exitCode !== null)
            throw new Error("Next terminó durante la preparación local.");
          try {
            return (await fetch(`${origin}/login`)).ok;
          } catch {
            return false;
          }
        },
        "Next listo",
        30000,
      );
      browser = await chrome();
      const click = (selector) =>
        browser.evaluate(
          `document.querySelector(${JSON.stringify(selector)}).click()`,
        );
      const navigate = async (path, selector) => {
        await browser.navigate(origin + path);
        await browser.wait(
          `location.pathname === ${JSON.stringify(path)} && document.readyState==='complete' && !!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('.session-notice')`,
          path,
        );
      };
      const login = async (key) => {
        if (await browser.evaluate("location.pathname !== '/login'"))
          await browser.navigate(origin + "/login");
        await browser.wait(
          "location.pathname === '/login' && document.readyState === 'complete' && !!document.querySelector('.login-password-toggle')",
          "login listo",
        );
        await click('.login-password-toggle[aria-label="Mostrar contraseña"]');
        await browser.wait(
          "document.querySelector('#clave')?.type === 'text'",
          "React muestra contraseña",
        );
        await click('.login-password-toggle[aria-label="Ocultar contraseña"]');
        await browser.wait(
          "document.querySelector('#clave')?.type === 'password'",
          "React oculta contraseña",
        );
        await browser.fill("#correo", accounts[key].correo);
        await browser.fill("#clave", password);
        await browser.evaluate(
          "document.querySelector('.login-form').requestSubmit()",
        );
        const path = accounts[key].rol === "CLIENTE" ? "/mercado" : "/cuenta";
        await browser.wait(
          `location.pathname===${JSON.stringify(path)} && !!document.querySelector('.account-trigger') && !document.querySelector('.session-notice')`,
          "login real",
        );
      };
      const bff = (path, body, method = body === undefined ? "GET" : "PATCH") =>
        browser.evaluate(
          `fetch(${JSON.stringify(path)}, {method:${JSON.stringify(method)},cache:'no-store',headers:{'Content-Type':'application/json'},body:${body === undefined ? "undefined" : JSON.stringify(JSON.stringify(body))}}).then(async r=>({status:r.status,cache:r.headers.get('cache-control'),data:await r.json()}))`,
        );

      const root = (store = own.idTienda) =>
        `/mi-negocio/tiendas/${store}/pedidos`;
      const path = (store = own.idTienda) => `/api${root(store)}`;
      const detail = (id = items[0].idPedido, store = own.idTienda) =>
        `${path(store)}/${id}`;
      const view = (id = items[0].idPedido, store = own.idTienda) =>
        `${root(store)}/${id}`;
      const prepare = (
        id = items[0].idPedido,
        store = own.idTienda,
        body = {},
      ) => bff(`${detail(id, store)}/preparar`, body);
      const button = async (text) =>
        browser.evaluate(
          `Array.from(document.querySelectorAll('button')).find(e=>e.textContent===${JSON.stringify(text)}).click()`,
        );
      const state = () =>
        browser.evaluate(
          "document.querySelector('[data-order-state]')?.dataset.orderState",
        );
      const open = async (id = items[0].idPedido, store = own.idTienda) =>
        navigate(view(id, store), "[data-order-detail]");
      const current = (id = items[0].idPedido) =>
        orders.findOneByOrFail({ idPedido: id });
      const start = async () => {
        await button("Comenzar preparación");
        await browser.wait(
          "!!document.querySelector('[aria-label=\"Confirmar preparación\"]')",
          "confirmación visible",
        );
      };
      const capture = async (name) => {
        await browser.evaluate("document.fonts.ready.then(()=>true)");
        const { cssContentSize: s } = await browser.call(
          "Page.getLayoutMetrics",
        );
        const shot = await browser.call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: s.width, height: s.height, scale: 1 },
        });
        await writeFile(join(evidence, name), Buffer.from(shot.data, "base64"));
      };
      const watchWrites = () =>
        browser.evaluate(
          "window.phase8Fetch=window.fetch;window.phase8Writes=0;window.fetch=async(...args)=>{if(args[1]?.method==='PATCH')window.phase8Writes++;return window.phase8Fetch(...args)}",
        );
      const restoreFetch = () =>
        browser.evaluate(
          "if(window.phase8Fetch)window.fetch=window.phase8Fetch;delete window.phase8Fetch;delete window.phase8Writes",
        );
      await mkdir(evidence, { recursive: true });

      await t.test(
        "sin JWT: lecturas/preparación 401 y página protegida",
        async () => {
          for (const url of [path(), detail()])
            assert.equal((await fetch(origin + url)).status, 401);
          assert.equal(
            (
              await fetch(origin + detail() + "/preparar", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Origin: origin },
                body: "{}",
              })
            ).status,
            401,
          );
          assert.equal(
            (await fetch(origin + root(), { redirect: "manual" })).status,
            307,
          );
        },
      );
      for (const key of ["CLIENTE", "ADMIN", "REPARTIDOR"])
        await t.test(`${key}: sin gestión, BFF GET/PATCH 403`, async () => {
          await login(key);
          assert.equal((await bff(path())).status, 403);
          assert.equal((await bff(detail())).status, 403);
          assert.equal((await prepare()).status, 403);
          await browser.navigate(origin + root());
          await browser.wait(
            "location.pathname==='/cuenta' && !!document.querySelector('.account-trigger')",
            "rol rechazado",
          );
        });
      await login("owner");
      await t.test(
        "Mi negocio conserva acciones y agrega Ver pedidos; listado sin datos personales",
        async () => {
          await navigate("/mi-negocio/tiendas", "[data-managed-store]");
          assert.ok(
            await browser.evaluate(
              `!!document.querySelector('a[href="${root()}"]')`,
            ),
          );
          assert.ok(
            await browser.evaluate(
              `!!document.querySelector('a[href="/mi-negocio/tiendas/${own.idTienda}/productos"]')`,
            ),
          );
          const r = await bff(path() + "?size=100");
          assert.equal(r.status, 200);
          assert.equal(r.cache, "no-store");
          assert.equal(r.data.totalElements, 8);
          assert.deepEqual(
            [...new Set(r.data.content.map((o) => o.estado))].sort(),
            [
              "CANCELADO",
              "CONFIRMADO",
              "ENTREGADO",
              "EN_CAMINO",
              "PENDIENTE",
              "PREPARANDO",
            ],
          );
          assert.ok(
            r.data.content.every(
              (o) =>
                o.unidades === 3 &&
                o.lineas === 1 &&
                o.total === "31.75" &&
                !("direccionEntrega" in o) &&
                !("idCliente" in o) &&
                !("items" in o),
            ),
          );
          await navigate(root(), "[data-managed-order]");
          assert.equal(
            await browser.evaluate(
              "document.querySelectorAll('[data-managed-order]').length",
            ),
            6,
          );
        },
      );
      await t.test(
        "paginación y estado reinician página con conteo PostgreSQL restringido",
        async () => {
          await navigate(root(), "[data-managed-order]");
          await button("Siguiente");
          await browser.wait(
            "document.body.innerText.includes('Página 2 de 2') && document.querySelectorAll('[data-managed-order]').length===2",
            "segunda página",
          );
          await browser.evaluate(
            "const e=document.querySelector('#business-order-state');e.value='CONFIRMADO';e.dispatchEvent(new Event('change',{bubbles:true}))",
          );
          await browser.wait(
            "document.body.innerText.includes('3 pedidos') && document.querySelectorAll('[data-managed-order]').length===3",
            "filtro real",
          );
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('Página 1 de 1')",
            ),
          );
          const r = await bff(path() + "?estado=CONFIRMADO");
          assert.equal(r.data.totalElements, 3);
        },
      );
      await t.test(
        "tiendas propias activas/inactivas, pedidos ajenos, filtros e IDs manipulados",
        async () => {
          assert.equal(
            (await bff(path(inactive.idTienda))).data.content[0].idPedido,
            second.idPedido,
          );
          assert.equal(
            (await bff(detail(second.idPedido, inactive.idTienda))).status,
            200,
          );
          for (const url of [
            path(foreign.idTienda),
            path(2147483647),
            detail(other.idPedido),
            detail(second.idPedido),
            detail(2147483647),
            detail(items[0].idPedido, inactive.idTienda),
          ])
            assert.equal((await bff(url)).status, 404);
          assert.equal((await prepare(other.idPedido)).status, 404);
          assert.equal(
            (await prepare(items[0].idPedido, foreign.idTienda)).status,
            404,
          );
          assert.equal((await prepare(second.idPedido)).status, 404);
          for (const q of [
            "?idTienda=" + foreign.idTienda,
            "?idCliente=" + accounts.CLIENTE.idUsuario,
            "?estado=INVALID",
            "?page=0&page=1",
          ])
            assert.equal((await bff(path() + q)).status, 400);
          assert.equal(
            (await bff("/api/mi-negocio/tiendas/no/pedidos")).status,
            400,
          );
          assert.equal((await bff(path() + "/0")).status, 400);
          for (const body of [
            { estado: "PREPARANDO" },
            { idTienda: foreign.idTienda },
            null,
            [],
          ])
            assert.equal(
              (await prepare(items[0].idPedido, own.idTienda, body)).status,
              400,
            );
        },
      );
      await t.test(
        "detalle histórico real, solo IDs y cancelación de confirmación sin PATCH",
        async () => {
          await open();
          assert.equal(await state(), "CONFIRMADO");
          const r = await bff(detail());
          assert.equal(r.data.order.items[0].precioUnitario, "10.25");
          assert.equal(r.data.order.items[0].subtotal, "30.75");
          assert.equal(
            r.data.order.direccionEntrega,
            "Dirección de entrega sintética",
          );
          assert.equal(r.data.order.idCliente, undefined);
          assert.equal(
            await browser.evaluate(
              "document.body.innerText.includes('Nombre actual que no es histórico')",
            ),
            false,
          );
          await watchWrites();
          try {
            await start();
            await button("Volver sin preparar");
            assert.equal(await browser.evaluate("window.phase8Writes"), 0);
            assert.equal((await current()).estado, "CONFIRMADO");
          } finally {
            await restoreFetch();
          }
        },
      );
      await t.test(
        "preparación confirmada y doble clic: un PATCH, sin modificar precios, stock ni detalles",
        async () => {
          await open();
          const beforeProduct = await products.findOneByOrFail({
              idProducto: product.idProducto,
            }),
            beforeOrder = await current(),
            beforeLines = await lines.findBy({ idPedido: items[0].idPedido });
          const service = context.app.get(OrderPreparationService),
            original = service.prepare.bind(service);
          let calls = 0,
            release;
          const gate = new Promise((r) => {
            release = r;
          });
          service.prepare = async (...args) => {
            calls++;
            await gate;
            return original(...args);
          };
          try {
            await start();
            await button("Confirmar preparación");
            await until(() => calls === 1, "prepare alcanzó Nest");
            assert.ok(
              await browser.evaluate(
                "Array.from(document.querySelectorAll('button')).some(e=>e.disabled && e.textContent.includes('Comenzando'))",
              ),
            );
            await browser.evaluate(
              "Array.from(document.querySelectorAll('button')).find(e=>e.textContent.includes('Comenzando'))?.click()",
            );
            assert.equal(calls, 1);
            release();
            await browser.wait(
              "document.querySelector('[data-order-state]')?.dataset.orderState==='PREPARANDO'",
              "preparación real",
            );
            const after = await current();
            assert.deepEqual(
              { ...after, estado: beforeOrder.estado },
              { ...beforeOrder },
            );
            assert.deepEqual(
              await products.findOneByOrFail({
                idProducto: product.idProducto,
              }),
              beforeProduct,
            );
            assert.deepEqual(
              await lines.findBy({ idPedido: items[0].idPedido }),
              beforeLines,
            );
            assert.equal((await prepare()).status, 409);
            assert.equal(calls, 2);
          } finally {
            release();
            service.prepare = original;
          }
          await open();
          assert.equal(await state(), "PREPARANDO");
          assert.equal(
            await browser.evaluate(
              "Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Comenzar preparación')",
            ),
            false,
          );
        },
      );
      for (const item of items.slice(1, 6))
        await t.test(
          `estado ${item.estado}: no acción UI y backend/BFF 409`,
          async () => {
            await open(item.idPedido);
            assert.equal(
              await browser.evaluate(
                "Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Comenzar preparación')",
              ),
              false,
            );
            const r = await prepare(item.idPedido);
            assert.equal(r.status, 409);
            assert.equal((await current(item.idPedido)).estado, item.estado);
          },
        );
      await t.test(
        "dos preparaciones concurrentes desde Chrome: exactamente 200 y 409",
        async () => {
          const target = items[6],
            lock = ds.createQueryRunner();
          await lock.connect();
          await lock.startTransaction();
          let pending;
          try {
            await lock.query(
              "SELECT id_pedido FROM pedido WHERE id_pedido=$1 FOR UPDATE",
              [target.idPedido],
            );
            pending = browser.evaluate(
              `Promise.all([1,2].map(()=>fetch(${JSON.stringify(detail(target.idPedido) + "/preparar")},{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)))`,
            );
            await until(
              async () => {
                const [r] = await ds.query(
                  "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%pedido%'",
                );
                return r.n >= 2;
              },
              "dos preparaciones esperando fila",
              10000,
            );
            await lock.commitTransaction();
            assert.deepEqual((await pending).sort(), [200, 409]);
            assert.equal((await current(target.idPedido)).estado, "PREPARANDO");
          } finally {
            if (lock.isTransactionActive) await lock.rollbackTransaction();
            await lock.release();
            await pending;
          }
        },
      );
      await t.test(
        "409 tras otra sesión: consulta de estado y ningún reintento automático",
        async () => {
          const target = items[7];
          await open(target.idPedido);
          await watchWrites();
          try {
            const r = await fetch(
              `${apiOrigin}/api/v1/orders/${target.idPedido}/prepare`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${tokens.owner}`,
                  "Content-Type": "application/json",
                },
                body: "{}",
              },
            );
            assert.equal(r.status, 200);
            await start();
            await button("Confirmar preparación");
            await browser.wait(
              "document.body.innerText.includes('El pedido cambió')",
              "409 visible",
            );
            assert.equal(await state(), "CONFIRMADO");
            assert.equal(await browser.evaluate("window.phase8Writes"), 1);
            await button("Consultar estado vigente");
            await browser.wait(
              "document.querySelector('[data-order-state]')?.dataset.orderState==='PREPARANDO'",
              "estado real consultado",
            );
            assert.equal(await browser.evaluate("window.phase8Writes"), 1);
          } finally {
            await restoreFetch();
          }
        },
      );
      for (const kind of ["server", "network"])
        await t.test(
          `${kind}: operación guardada con respuesta perdida, consulta segura sin reenvío`,
          async () => {
            const target = await seedOrder(own, "CONFIRMADO");
            await open(target.idPedido);
            const service = context.app.get(OrderPreparationService),
              original = service.prepare.bind(service);
            let calls = 0;
            service.prepare = async (...args) => {
              calls++;
              const r = await original(...args);
              if (kind === "server")
                throw new Error("SYNTHETIC_PRIVATE_FAILURE");
              return r;
            };
            await browser.evaluate(
              `window.phase8Fetch=window.fetch;window.phase8Writes=0;window.fetch=async(...args)=>{if(args[1]?.method==='PATCH')window.phase8Writes++;const r=await window.phase8Fetch(...args);if(args[1]?.method==='PATCH'&&${JSON.stringify(kind)}==='network')throw new TypeError('synthetic disconnect');return r}`,
            );
            try {
              await start();
              await button("Confirmar preparación");
              await browser.wait(
                "!!document.querySelector('[aria-label=\"Revisar resultado de preparación\"]')",
                "ambigüedad visible",
              );
              assert.equal(await state(), "CONFIRMADO");
              assert.equal(
                (await current(target.idPedido)).estado,
                "PREPARANDO",
              );
              assert.equal(calls, 1);
              assert.equal(
                await browser.evaluate(
                  "document.body.innerText.includes('SYNTHETIC_PRIVATE_FAILURE')",
                ),
                false,
              );
              await button("Consultar estado vigente");
              await browser.wait(
                "document.querySelector('[data-order-state]')?.dataset.orderState==='PREPARANDO'",
                "lectura tras ambigüedad",
              );
              assert.equal(calls, 1);
              assert.equal(await browser.evaluate("window.phase8Writes"), 1);
            } finally {
              service.prepare = original;
              await restoreFetch();
            }
          },
        );
      await t.test(
        "red falla antes de enviar: solo habilita otra confirmación tras consultar",
        async () => {
          const target = await seedOrder(own, "CONFIRMADO");
          await open(target.idPedido);
          await browser.evaluate(
            "window.phase8Fetch=window.fetch;window.phase8Writes=0;window.fetch=(...args)=>{if(args[1]?.method==='PATCH'){window.phase8Writes++;return Promise.reject(new TypeError('synthetic network'))}return window.phase8Fetch(...args)}",
          );
          try {
            await start();
            await button("Confirmar preparación");
            await browser.wait(
              "!!document.querySelector('[aria-label=\"Revisar resultado de preparación\"]')",
              "red sin resultado",
            );
            assert.equal((await current(target.idPedido)).estado, "CONFIRMADO");
            await button("Consultar estado vigente");
            await browser.wait(
              "document.body.innerText.includes('Estado consultado; habilitar nueva confirmación')",
              "revisión explícita",
            );
            assert.equal(await browser.evaluate("window.phase8Writes"), 1);
            assert.equal(
              await browser.evaluate(
                "Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Comenzar preparación')",
              ),
              false,
            );
            await restoreFetch();
            await button("Estado consultado; habilitar nueva confirmación");
            await start();
            await button("Confirmar preparación");
            await browser.wait(
              "document.querySelector('[data-order-state]')?.dataset.orderState==='PREPARANDO'",
              "confirmación nueva",
            );
          } finally {
            await restoreFetch();
          }
        },
      );
      await t.test(
        "vacío real y error de red con reintento de lectura",
        async () => {
          await navigate(root(empty.idTienda), "#my-business-orders");
          await browser.wait(
            "document.body.innerText.includes('No hay pedidos para mostrar')",
            "tienda vacía",
          );
          await navigate(root(), "[data-managed-order]");
          await browser.evaluate(
            "window.phase8Fetch=window.fetch;window.fetch=(...args)=>String(args[0]).includes('/pedidos?')?Promise.reject(new Error('synthetic network')):window.phase8Fetch(...args)",
          );
          try {
            await button("Siguiente");
            await browser.wait(
              "!!document.querySelector('[data-orders-error]')",
              "error de lectura",
            );
          } finally {
            await restoreFetch();
          }
          await button("Reintentar");
          await browser.wait(
            "!!document.querySelector('[data-managed-order]')",
            "listado recuperado",
          );
        },
      );
      for (const width of [320, 390, 768, 1280, 1440])
        await t.test(
          `responsive ${width}px: listado, detalle y confirmación`,
          async () => {
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 900,
              deviceScaleFactor: 1,
              mobile: width < 768,
            });
            await navigate(root(), "[data-managed-order]");
            assert.ok(
              await browser.evaluate(
                "document.documentElement.scrollWidth<=innerWidth",
              ),
            );
            if ([320, 1440].includes(width))
              await capture(`pedidos-${width}.png`);
            await open(second.idPedido, inactive.idTienda);
            assert.ok(
              await browser.evaluate(
                "document.documentElement.scrollWidth<=innerWidth",
              ),
            );
            if ([320, 1440].includes(width))
              await capture(`detalle-${width}.png`);
            await start();
            assert.ok(
              await browser.evaluate(
                "document.documentElement.scrollWidth<=innerWidth",
              ),
            );
            if ([320, 1440].includes(width))
              await capture(`confirmacion-${width}.png`);
          },
        );
      await t.test(
        "otro emprendedor no obtiene pedidos del propietario anterior",
        async () => {
          await login("other");
          assert.equal(
            (await bff(path(foreign.idTienda))).data.totalElements,
            1,
          );
          assert.equal((await bff(path())).status, 404);
          assert.equal((await prepare()).status, 404);
        },
      );
      await t.test(
        "JWT inválido y vencido: 401 y redirección sin detalles privados",
        async () => {
          for (const value of [
            "invalid-local-token",
            await context.app.get(JwtService).signAsync(
              {
                sub: accounts.owner.correo,
                idUsuario: accounts.owner.idUsuario,
                rol: "EMPRENDEDOR",
              },
              { expiresIn: -1 },
            ),
          ]) {
            await browser.call("Network.setCookie", {
              name: "chorotega_session",
              value,
              url: origin,
              httpOnly: true,
              sameSite: "Lax",
            });
            assert.equal((await bff(path())).status, 401);
            await browser.navigate(origin + view());
            await browser.wait(
              "location.pathname==='/login' && !!document.querySelector('#correo')",
              "sesión vencida",
            );
            assert.equal(
              await browser.evaluate(
                "!!document.querySelector('[data-order-detail]')",
              ),
              false,
            );
          }
        },
      );
      t.diagnostic(`Capturas con datos exclusivamente sintéticos: ${evidence}`);
      assert.equal(next.exitCode, null);
    } finally {
      try {
        await browser?.close();
      } finally {
        if (next && next.exitCode === null) {
          next.kill();
          await new Promise((r) => {
            next.once("exit", r);
            setTimeout(r, 5000).unref();
          });
        }
        try {
          await context?.close();
        } finally {
          if (previousSecret === undefined) delete process.env.JWT_SECRET;
          else process.env.JWT_SECRET = previousSecret;
        }
      }
    }
  },
);
