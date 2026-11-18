import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chrome, freePort, until } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../.."),
  backend = createRequire(resolve(frontend, "../backend/package.json"));
backend("ts-node").register({
  project: resolve(frontend, "../backend/tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backend("./test/support/create-http-test-app.ts");
const { DeliveriesModule } = backend(
  "./src/modules/deliveries/deliveries.module.ts",
);
const { OrdersHttpModule } = backend(
  "./src/modules/orders/orders-http.module.ts",
);
const { DeliveriesService } = backend(
  "./src/modules/deliveries/services/deliveries.service.ts",
);
const { User } = backend("./src/modules/users/entities/user.entity.ts");
const { Store } = backend("./src/modules/stores/entities/store.entity.ts");
const { Neighborhood } = backend(
  "./src/modules/neighborhoods/entities/neighborhood.entity.ts",
);
const { Order } = backend("./src/modules/orders/entities/order.entity.ts");
const { Courier } = backend(
  "./src/modules/couriers/entities/courier.entity.ts",
);
const { Delivery } = backend(
  "./src/modules/deliveries/entities/delivery.entity.ts",
);
const { JwtService } = backend("@nestjs/jwt"),
  bcrypt = backend("bcrypt");
const evidence = "/private/tmp/chorotega-phase9a-courier-evidence";

test(
  "Panel REPARTIDOR: Chrome → Next → Nest → PostgreSQL temporal",
  { timeout: 300000 },
  async (t) => {
    let context, next, browser;
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const password = "Solo prueba local temporal 123!";
    try {
      context = await createHttpTestApp([DeliveriesModule, OrdersHttpModule]);
      await context.app.listen(0, "127.0.0.1");
      const apiOrigin = await context.app.getUrl(),
        ds = context.database.dataSource;
      const accounts = {},
        tokens = {},
        couriers = {};
      for (const [key, rol] of Object.entries({
        owner: "REPARTIDOR",
        other: "REPARTIDOR",
        empty: "REPARTIDOR",
        unregistered: "REPARTIDOR",
        ADMIN: "ADMIN",
        CLIENTE: "CLIENTE",
        EMPRENDEDOR: "EMPRENDEDOR",
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
        if (["owner", "other", "empty"].includes(key))
          couriers[key] = await ds.getRepository(Courier).save({
            idUsuario: accounts[key].idUsuario,
            medioTransporte: "MOTO",
            disponibilidad: "DISPONIBLE",
          });
      }
      const store = await ds.getRepository(Store).save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Negocio sintético",
        direccion: "Dirección comercial sintética",
      });
      const neighborhood = await ds.getRepository(Neighborhood).save({
        nombre: "Barrio sintético",
        tarifaEnvio: "1.25",
        estado: "ACTIVO",
      });
      const api = async (
        key,
        path,
        body,
        method = body === undefined ? "GET" : "POST",
      ) => {
        const r = await fetch(`${apiOrigin}/api/v1${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${tokens[key]}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: r.status, data: await r.json() };
      };
      const assign = async (who = "owner") => {
        const order = await ds.getRepository(Order).save({
          idCliente: accounts.CLIENTE.idUsuario,
          idTienda: store.idTienda,
          idBarrio: neighborhood.idBarrio,
          estado: "PREPARANDO",
          subtotal: "10.00",
          tarifaEnvio: "1.25",
          total: "11.25",
          direccionEntrega: "Dirección de entrega exclusivamente sintética",
        });
        const r = await api("ADMIN", "/deliveries", {
          idPedido: order.idPedido,
          idRepartidor: couriers[who].idRepartidor,
        });
        assert.equal(r.status, 201);
        return r.data;
      };
      const domainPost = async (d, action, who = "owner") => {
        const r = await api(who, `/deliveries/${d.idEntrega}/${action}`, {});
        assert.equal(r.status, 200);
        return r.data;
      };
      const history = [];
      for (let i = 0; i < 7; i++) {
        const d = await assign();
        if (i % 2) history.push(await domainPost(d, "cancel", "ADMIN"));
        else {
          await domainPost(d, "start");
          history.push(await domainPost(d, "complete"));
        }
      }
      const main = await assign(),
        foreign = await assign("other");
      const port = await freePort(),
        origin = `http://localhost:${port}`;
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
            NEXT_TELEMETRY_DISABLED: "1",
          },
          stdio: ["ignore", "ignore", "ignore"],
        },
      );
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
      const click = (s) =>
        browser.evaluate(
          `document.querySelector(${JSON.stringify(s)}).click()`,
        );
      const button = (text) =>
        browser.evaluate(
          `Array.from(document.querySelectorAll('button')).find(e=>e.textContent===${JSON.stringify(text)}).click()`,
        );
      const navigate = async (path, selector) => {
        await browser.navigate(origin + path);
        await browser.wait(
          `location.pathname===${JSON.stringify(path)} && !!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('.session-notice')`,
          path,
        );
      };
      const login = async (key) => {
        if (await browser.evaluate("location.pathname!='/login'"))
          await browser.navigate(origin + "/login");
        await browser.wait(
          "!!document.querySelector('.login-password-toggle')",
          "formulario de login",
        );
        await click('.login-password-toggle[aria-label="Mostrar contraseña"]');
        await browser.wait(
          "document.querySelector('#clave')?.type==='text'",
          "login hidratado",
        );
        await click('.login-password-toggle[aria-label="Ocultar contraseña"]');
        await browser.wait(
          "document.querySelector('#clave')?.type==='password'",
          "contraseña oculta",
        );
        await browser.fill("#correo", accounts[key].correo);
        await browser.fill("#clave", password);
        await browser.evaluate(
          "document.querySelector('.login-form').requestSubmit()",
        );
        const destination = key === "CLIENTE" ? "/mercado" : "/cuenta";
        await browser.wait(
          `location.pathname===${JSON.stringify(destination)} && !!document.querySelector('.account-trigger') && !document.querySelector('.session-notice')`,
          "login real",
        );
      };
      const bff = (
        path = "",
        body,
        method = body === undefined ? "GET" : "POST",
      ) =>
        browser.evaluate(
          `fetch('/api/mis-entregas'+${JSON.stringify(path)},{method:${JSON.stringify(method)},cache:'no-store',headers:{'Content-Type':'application/json'},body:${body === undefined ? "undefined" : JSON.stringify(JSON.stringify(body))}}).then(async r=>({status:r.status,cache:r.headers.get('cache-control'),data:await r.json()}))`,
        );
      const post = (d, action, body = {}) =>
        bff(`/${d.idEntrega}/${action}`, body);
      const open = (d) =>
        navigate(`/mis-entregas/${d.idEntrega}`, "[data-delivery-detail]");
      const state = () =>
        browser.evaluate(
          "document.querySelector('[data-delivery-state]')?.dataset.deliveryState",
        );
      const waitState = (expected) =>
        browser.wait(
          `document.querySelector('[data-delivery-state]')?.dataset.deliveryState===${JSON.stringify(expected)}`,
          `estado ${expected}`,
        );
      const confirm = async (action) => {
        await button(
          action === "iniciar" ? "Iniciar entrega" : "Completar entrega",
        );
        await browser.wait(
          "!!document.querySelector('[aria-label=\"Confirmar acción de entrega\"]')",
          "confirmación visible",
        );
      };
      const current = (d) =>
        ds.getRepository(Delivery).findOneByOrFail({ idEntrega: d.idEntrega });
      const restoreFetch = () =>
        browser.evaluate(
          "if(window.phase9Fetch)window.fetch=window.phase9Fetch;delete window.phase9Fetch;delete window.phase9Writes",
        );
      await browser.navigate(origin + "/login");
      await t.test(
        "sin sesión: cuatro BFF 401 y página privada redirige",
        async () => {
          for (const [path, body] of [
            ["", undefined],
            [`/${main.idEntrega}`, undefined],
            [`/${main.idEntrega}/iniciar`, {}],
            [`/${main.idEntrega}/completar`, {}],
          ])
            assert.equal((await bff(path, body)).status, 401);
          await browser.navigate(origin + "/mis-entregas");
          await browser.wait(
            "location.pathname==='/login'",
            "página protegida",
          );
        },
      );
      for (const key of ["CLIENTE", "EMPRENDEDOR", "ADMIN"])
        await t.test(
          `${key}: BFF exclusivo 403 y sin menú de reparto`,
          async () => {
            await login(key);
            for (const [path, body] of [
              ["", undefined],
              [`/${main.idEntrega}`, undefined],
              [`/${main.idEntrega}/iniciar`, {}],
              [`/${main.idEntrega}/completar`, {}],
            ])
              assert.equal((await bff(path, body)).status, 403);
            assert.equal(
              await browser.evaluate(
                "!!document.querySelector('a[href=\"/mis-entregas\"]')",
              ),
              false,
            );
            await browser.navigate(origin + "/mis-entregas");
            await browser.wait(
              "location.pathname==='/cuenta' && !document.querySelector('.session-notice')",
              "rol rechazado",
            );
          },
        );
      for (const key of ["empty", "unregistered"])
        await t.test(
          `${key}: listado vacío; lectura 404; operación ajena 403`,
          async () => {
            await login(key);
            const r = await bff();
            assert.equal(r.status, 200);
            assert.equal(r.data.totalElements, 0);
            assert.equal((await bff(`/${main.idEntrega}`)).status, 404);
            assert.equal((await post(main, "iniciar")).status, 403);
            await navigate("/mis-entregas", "#my-deliveries");
            await browser.wait(
              "document.body.innerText.includes('No hay entregas para mostrar')",
              "vacío visible",
            );
          },
        );
      await login("owner");
      await t.test(
        "menú y cuenta de REPARTIDOR enlazan al panel sin cambiar destino del login",
        async () => {
          assert.equal(await browser.evaluate("location.pathname"), "/cuenta");
          assert.equal(
            await browser.evaluate(
              "!!document.querySelector('a.account-action[href=\"/mis-entregas\"]')",
            ),
            true,
          );
          await click(".account-trigger");
          await browser.wait(
            "document.querySelector('.account-trigger').getAttribute('aria-expanded')==='true'",
            "menú abierto",
          );
          assert.equal(
            await browser.evaluate(
              "!!document.querySelector('.account-dropdown a[href=\"/mis-entregas\"]')",
            ),
            true,
          );
        },
      );
      await t.test(
        "paginación SQL, filtro real y aislamiento entre repartidores",
        async () => {
          const first = await bff("?page=0&size=2");
          assert.equal(first.status, 200);
          assert.equal(first.cache, "no-store");
          assert.equal(first.data.totalElements, 8);
          assert.equal(first.data.content.length, 2);
          assert(
            first.data.content.every(
              (d) => d.idRepartidor === couriers.owner.idRepartidor,
            ),
          );
          const second = await bff("?page=1&size=2");
          assert.equal(second.status, 200);
          assert(
            !first.data.content.some((d) =>
              second.data.content.some((v) => d.idEntrega === v.idEntrega),
            ),
          );
          const filtered = await bff("?estado=ASIGNADA");
          assert.equal(filtered.data.totalElements, 1);
          assert.equal(filtered.data.content[0].idEntrega, main.idEntrega);
          await navigate("/mis-entregas", "[data-delivery]");
          await button("Siguiente");
          await browser.wait(
            "document.body.innerText.includes('Página 2 de 2')",
            "segunda página",
          );
          await browser.evaluate(
            "const s=document.querySelector('#delivery-state');s.value='ASIGNADA';s.dispatchEvent(new Event('change',{bubbles:true}))",
          );
          await browser.wait(
            "document.body.innerText.includes('1 entregas · Página 1 de 1')",
            "filtro reinicia página",
          );
        },
      );
      await t.test(
        "ajenas/inexistentes: GET 404, POST ajeno 403, no acceso a pedidos",
        async () => {
          assert.equal((await bff(`/${foreign.idEntrega}`)).status, 404);
          assert.equal((await bff("/2147483647")).status, 404);
          assert.equal((await post(foreign, "iniciar")).status, 403);
          assert.equal((await post(foreign, "completar")).status, 403);
          assert.equal(
            (await api("owner", `/orders/${main.idPedido}`)).status,
            403,
          );
          await open(main);
          const text = await browser.evaluate("document.body.innerText");
          assert(
            !text.includes("Dirección de entrega exclusivamente sintética"),
          );
          assert(!text.includes(accounts.CLIENTE.correo));
        },
      );
      await t.test(
        "URLs, cuerpos, Origin y Content-Type manipulados no escriben",
        async () => {
          for (const q of [
            "?idRepartidor=1",
            "?estado=ENTREGADO",
            "?page=-1",
            "?size=101",
            "?estado=ASIGNADA&estado=CANCELADA",
          ])
            assert.equal((await bff(q)).status, 400);
          for (const id of ["0", "-1", "2147483648", "1e2"])
            assert.equal((await bff("/" + id)).status, 400);
          for (const body of [
            null,
            [],
            { estado: "ENTREGADA" },
            { idRepartidor: couriers.owner.idRepartidor },
          ])
            assert.equal((await post(main, "iniciar", body)).status, 400);
          for (const headers of [
            { Origin: "null", "Content-Type": "application/json" },
            {
              Origin: "https://external.example",
              "Content-Type": "application/json",
            },
            { Origin: origin, "Content-Type": "text/plain" },
          ]) {
            const r = await fetch(
              `${origin}/api/mis-entregas/${main.idEntrega}/iniciar`,
              {
                method: "POST",
                headers: {
                  ...headers,
                  Cookie: `chorotega_session=${tokens.owner}`,
                },
                body: "{}",
              },
            );
            assert.equal(r.status, 403);
          }
          assert.equal((await current(main)).estado, "ASIGNADA");
        },
      );
      await t.test(
        "canceladas y entregadas: sin acciones UI y conflictos 409 reales",
        async () => {
          for (const d of [history[0], history[1]]) {
            await open(d);
            assert.equal(
              await browser.evaluate(
                "Array.from(document.querySelectorAll('button')).some(b=>['Iniciar entrega','Completar entrega'].includes(b.textContent))",
              ),
              false,
            );
            assert.equal((await post(d, "iniciar")).status, 409);
            assert.equal((await post(d, "completar")).status, 409);
          }
        },
      );
      await t.test(
        "ASIGNADA → EN_CAMINO → ENTREGADA: confirmación, doble clic y consistencia",
        async () => {
          await open(main);
          await confirm("iniciar");
          await button("Volver sin cambios");
          assert.equal((await current(main)).estado, "ASIGNADA");
          await browser.evaluate(
            "window.phase9Fetch=window.fetch;window.phase9Writes=0;window.fetch=(...a)=>{if(a[1]?.method==='POST')window.phase9Writes++;return window.phase9Fetch(...a)}",
          );
          try {
            await confirm("iniciar");
            await browser.evaluate(
              "(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirmar inicio');b.click();b.click()})()",
            );
            await waitState("EN_CAMINO");
            assert.equal(await browser.evaluate("window.phase9Writes"), 1);
            assert.equal(
              (
                await ds
                  .getRepository(Order)
                  .findOneByOrFail({ idPedido: main.idPedido })
              ).estado,
              "EN_CAMINO",
            );
            await confirm("completar");
            await browser.evaluate(
              "(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirmar entrega');b.click();b.click()})()",
            );
            await waitState("ENTREGADA");
            assert.equal(await browser.evaluate("window.phase9Writes"), 2);
            assert(
              await browser.evaluate(
                "!!document.querySelector('[data-delivered-at]')",
              ),
            );
            assert.equal(
              (
                await ds
                  .getRepository(Order)
                  .findOneByOrFail({ idPedido: main.idPedido })
              ).estado,
              "ENTREGADO",
            );
            assert.equal(
              (
                await ds.getRepository(Courier).findOneByOrFail({
                  idRepartidor: couriers.owner.idRepartidor,
                })
              ).disponibilidad,
              "DISPONIBLE",
            );
            assert((await current(main)).fechaEntrega instanceof Date);
          } finally {
            await restoreFetch();
          }
        },
      );
      await t.test(
        "dos POST concurrentes para iniciar y completar: uno 200 y otro 409",
        async () => {
          const target = await assign();
          await open(target);
          for (const action of ["iniciar", "completar"]) {
            const lock = ds.createQueryRunner();
            let pending;
            await lock.connect();
            await lock.startTransaction();
            try {
              await lock.query(
                "SELECT id_entrega FROM entrega WHERE id_entrega=$1 FOR UPDATE",
                [target.idEntrega],
              );
              pending = browser.evaluate(
                `Promise.all([1,2].map(()=>fetch('/api/mis-entregas/${target.idEntrega}/${action}',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)))`,
              );
              await until(
                async () => {
                  const [r] = await ds.query(
                    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%entrega%'",
                  );
                  return r.n >= 2;
                },
                "dos POST esperando la fila",
                10000,
              );
              await lock.commitTransaction();
              assert.deepEqual((await pending).sort(), [200, 409]);
            } finally {
              if (lock.isTransactionActive) await lock.rollbackTransaction();
              await lock.release();
              await pending;
            }
          }
          assert.equal((await current(target)).estado, "ENTREGADA");
          assert.equal(
            (
              await ds
                .getRepository(Order)
                .findOneByOrFail({ idPedido: target.idPedido })
            ).estado,
            "ENTREGADO",
          );
        },
      );
      await t.test(
        "otra sesión inicia: 409 visible y recuperación GET sin reenviar",
        async () => {
          const target = await assign();
          await open(target);
          await domainPost(target, "start");
          await confirm("iniciar");
          await button("Confirmar inicio");
          await browser.wait(
            "document.body.innerText.includes('La entrega cambió')",
            "conflicto visible",
          );
          assert.equal(await state(), "ASIGNADA");
          await button("Consultar estado vigente");
          await waitState("EN_CAMINO");
          await domainPost(target, "complete");
        },
      );
      await t.test(
        "respuesta perdida después de iniciar/completar: consulta segura sin repetir POST",
        async () => {
          const target = await assign();
          await open(target);
          await browser.evaluate(
            "window.phase9Fetch=window.fetch;window.phase9Writes=0;window.fetch=async(...a)=>{if(a[1]?.method==='POST')window.phase9Writes++;const r=await window.phase9Fetch(...a);if(a[1]?.method==='POST')throw new TypeError('synthetic lost response');return r}",
          );
          try {
            for (const [action, before, after, label] of [
              ["iniciar", "ASIGNADA", "EN_CAMINO", "Confirmar inicio"],
              ["completar", "EN_CAMINO", "ENTREGADA", "Confirmar entrega"],
            ]) {
              await confirm(action);
              await button(label);
              await browser.wait(
                "!!document.querySelector('[aria-label=\"Revisar resultado de entrega\"]')",
                "respuesta ambigua",
              );
              assert.equal(await state(), before);
              assert.equal((await current(target)).estado, after);
              const writes = await browser.evaluate("window.phase9Writes");
              await button("Consultar estado vigente");
              await waitState(after);
              assert.equal(
                await browser.evaluate("window.phase9Writes"),
                writes,
              );
            }
            assert.equal(await browser.evaluate("window.phase9Writes"), 2);
          } finally {
            await restoreFetch();
          }
        },
      );
      await t.test(
        "fallo después del commit Nest: 500 seguro y GET confirma estado guardado",
        async () => {
          const target = await assign();
          await open(target);
          const service = context.app.get(DeliveriesService),
            original = service.startDelivery;
          service.startDelivery = async (...args) => {
            await original.apply(service, args);
            throw new Error("SYNTHETIC_PRIVATE_FAILURE");
          };
          try {
            await confirm("iniciar");
            await button("Confirmar inicio");
            await browser.wait(
              "!!document.querySelector('[aria-label=\"Revisar resultado de entrega\"]')",
              "error de respuesta",
            );
            assert.equal(await state(), "ASIGNADA");
            assert.equal((await current(target)).estado, "EN_CAMINO");
            assert(
              !(await browser.evaluate("document.body.innerText")).includes(
                "SYNTHETIC_PRIVATE_FAILURE",
              ),
            );
            await button("Consultar estado vigente");
            await waitState("EN_CAMINO");
          } finally {
            service.startDelivery = original;
          }
          await domainPost(target, "complete");
        },
      );
      await t.test(
        "si POST no sale, GET ASIGNADA exige nueva habilitación y confirmación explícitas",
        async () => {
          const target = await assign();
          await open(target);
          await browser.evaluate(
            "window.phase9Fetch=window.fetch;window.phase9Writes=0;window.fetch=(...a)=>a[1]?.method==='POST'?Promise.reject(new TypeError('synthetic offline')):window.phase9Fetch(...a)",
          );
          try {
            await confirm("iniciar");
            await button("Confirmar inicio");
            await browser.wait(
              "!!document.querySelector('[aria-label=\"Revisar resultado de entrega\"]')",
              "resultado incierto",
            );
            await button("Consultar estado vigente");
            await browser.wait(
              "document.body.innerText.includes('Estado consultado; habilitar nueva confirmación')",
              "habilitación necesaria",
            );
            assert.equal((await current(target)).estado, "ASIGNADA");
          } finally {
            await restoreFetch();
          }
          await button("Estado consultado; habilitar nueva confirmación");
          assert.equal((await current(target)).estado, "ASIGNADA");
          await confirm("iniciar");
          await button("Confirmar inicio");
          await waitState("EN_CAMINO");
          await domainPost(target, "complete");
        },
      );
      await t.test(
        "fallos de lectura y respuesta inesperada son recuperables sin exponer datos",
        async () => {
          const target = await assign();
          await open(target);
          const service = context.app.get(DeliveriesService),
            original = service.findVisibleById;
          service.findVisibleById = async () => ({
            idEntrega: target.idEntrega,
            token: "SYNTHETIC_PRIVATE_FAILURE",
          });
          try {
            await navigate(
              `/mis-entregas/${target.idEntrega}`,
              "[data-delivery-detail-error]",
            );
            assert(
              !(await browser.evaluate("document.body.innerText")).includes(
                "SYNTHETIC_PRIVATE_FAILURE",
              ),
            );
          } finally {
            service.findVisibleById = original;
          }
          await button("Reintentar");
          await browser.wait(
            "!!document.querySelector('[data-delivery-detail]')",
            "lectura recuperada",
          );
          await domainPost(target, "cancel", "ADMIN");
        },
      );
      await t.test(
        "error de red del listado conserva sesión y permite reintentar GET",
        async () => {
          await navigate("/mis-entregas", "[data-delivery]");
          await browser.evaluate(
            "window.phase9Fetch=window.fetch;window.fetch=(...a)=>String(a[0]).startsWith('/api/mis-entregas?')?Promise.reject(new TypeError('synthetic network')):window.phase9Fetch(...a)",
          );
          try {
            await button("Siguiente");
            await browser.wait(
              "!!document.querySelector('[data-deliveries-error]')",
              "error de red visible",
            );
          } finally {
            await restoreFetch();
          }
          await button("Reintentar");
          await browser.wait(
            "!!document.querySelector('[data-delivery]')",
            "listado recuperado",
          );
        },
      );
      const visual = await assign();
      await mkdir(evidence, { recursive: true });
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
            await navigate("/mis-entregas", "[data-delivery]");
            assert(
              await browser.evaluate(
                "document.documentElement.scrollWidth<=innerWidth",
              ),
            );
            if ([320, 1440].includes(width))
              await capture(`entregas-${width}.png`);
            await open(visual);
            assert(
              await browser.evaluate(
                "document.documentElement.scrollWidth<=innerWidth",
              ),
            );
            if ([320, 1440].includes(width))
              await capture(`detalle-${width}.png`);
            await confirm("iniciar");
            assert(
              await browser.evaluate(
                "document.documentElement.scrollWidth<=innerWidth",
              ),
            );
            if ([320, 1440].includes(width))
              await capture(`confirmacion-${width}.png`);
          },
        );
      await t.test(
        "cambio de rol posterior al login: BFF 403 antes de leer o escribir",
        async () => {
          await ds
            .getRepository(User)
            .update(accounts.owner.idUsuario, { rol: "CLIENTE" });
          try {
            assert.equal((await bff()).status, 403);
            assert.equal((await post(visual, "iniciar")).status, 403);
          } finally {
            await ds
              .getRepository(User)
              .update(accounts.owner.idUsuario, { rol: "REPARTIDOR" });
          }
        },
      );
      await t.test(
        "cuenta inactiva invalida JWT vigente y elimina cookie",
        async () => {
          await ds
            .getRepository(User)
            .update(accounts.owner.idUsuario, { estado: "INACTIVO" });
          try {
            assert.equal((await bff()).status, 401);
            assert.equal((await post(visual, "iniciar")).status, 401);
          } finally {
            await ds
              .getRepository(User)
              .update(accounts.owner.idUsuario, { estado: "ACTIVO" });
          }
          assert.equal((await current(visual)).estado, "ASIGNADA");
        },
      );
      await t.test(
        "JWT inválido y vencido no muestran entregas y redirigen al login",
        async () => {
          for (const value of [
            "invalid-local-test",
            await context.app.get(JwtService).signAsync(
              {
                idUsuario: accounts.owner.idUsuario,
                sub: accounts.owner.correo,
                rol: "REPARTIDOR",
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
            assert.equal((await bff()).status, 401);
            await browser.navigate(origin + "/mis-entregas");
            await browser.wait(
              "location.pathname==='/login' && !!document.querySelector('#correo')",
              "sesión inválida",
            );
            assert.equal(
              await browser.evaluate(
                "!!document.querySelector('[data-delivery-detail]')",
              ),
              false,
            );
          }
        },
      );
      t.diagnostic(`Capturas exclusivamente sintéticas: ${evidence}`);
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
