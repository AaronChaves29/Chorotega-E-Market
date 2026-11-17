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
const { StoresService } = backend(
  "./src/modules/stores/services/stores.service.ts",
);
const { User } = backend("./src/modules/users/entities/user.entity.ts");
const { Store } = backend("./src/modules/stores/entities/store.entity.ts");
const { BadRequestException } = backend("@nestjs/common");
const { JwtService } = backend("@nestjs/jwt");
const bcrypt = backend("bcrypt");
const evidence = "/private/tmp/chorotega-6c-business-evidence";

test(
  "Mi negocio: Chrome → Next.js → NestJS → PostgreSQL temporal",
  { timeout: 240000 },
  async (t) => {
    let context, next, browser;
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const password = "Solo prueba local temporal 123!";
    try {
      context = await createHttpTestApp([AuthModule, StoresModule]);
      await context.app.listen(0, "127.0.0.1");
      const apiOrigin = await context.app.getUrl(),
        ds = context.database.dataSource;
      const users = ds.getRepository(User),
        stores = ds.getRepository(Store);
      const accounts = {};
      for (const [key, rol] of Object.entries({
        owner: "EMPRENDEDOR",
        other: "EMPRENDEDOR",
        empty: "EMPRENDEDOR",
        CLIENTE: "CLIENTE",
        ADMIN: "ADMIN",
        REPARTIDOR: "REPARTIDOR",
      }))
        accounts[key] = await users.save({
          authId: randomUUID(),
          nombre: "Persona",
          apellido: "Temporal",
          correo: `${key}@example.test`,
          rol,
          estado: "ACTIVO",
          claveHash: await bcrypt.hash(password, 4),
        });
      const own = [];
      for (let i = 0; i < 8; i++)
        own.push(
          await stores.save({
            idEmprendedor: accounts.owner.idUsuario,
            nombre: `Negocio local ${i + 1}`,
            descripcion: "Descripción de prueba",
            direccion: "Dirección sintética de prueba",
            telefono: "+506 8888-8888",
            horario: "Lunes a viernes",
            estado: i % 3 === 0 ? "INACTIVA" : "ACTIVA",
            instagramUrl: "https://www.instagram.com/local/",
            facebookUrl: "https://www.facebook.com/Local/",
            whatsappComercial: "50677777777",
          }),
        );
      const foreign = await stores.save({
        idEmprendedor: accounts.other.idUsuario,
        nombre: "Negocio ajeno de prueba",
        direccion: "Otra dirección sintética",
        estado: "ACTIVA",
      });
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
      const listPath = "/api/mi-negocio/tiendas";
      const editPath = (id) => `/mi-negocio/tiendas/${id}/editar`;
      const detailPath = (id) => `${listPath}/${id}`;
      const readyForm = async (id) => {
        await navigate(editPath(id), "#business-nombre");
        // A controlled input change must be observed before subsequent form actions.
        const name = await browser.evaluate(
          "document.querySelector('#business-nombre').value",
        );
        await browser.fill("#business-nombre", name + " ");
        await browser.fill("#business-nombre", name);
      };
      const save = () =>
        browser.evaluate(
          "document.querySelector('form[aria-label=\"Editar información de la tienda\"]').requestSubmit()",
        );
      const saved = () =>
        browser.wait(
          "document.querySelector('[role=status]')?.innerText.includes('Cambios guardados') || Array.from(document.querySelectorAll('[role=status]')).some(e=>e.innerText.includes('Cambios guardados'))",
          "guardado confirmado",
        );
      const capture = async (name) => {
        await browser.evaluate("document.fonts.ready.then(()=>true)");
        const { cssContentSize } = await browser.call("Page.getLayoutMetrics");
        const shot = await browser.call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: cssContentSize.width,
            height: cssContentSize.height,
            scale: 1,
          },
        });
        await writeFile(join(evidence, name), Buffer.from(shot.data, "base64"));
      };
      await mkdir(evidence, { recursive: true });
      await t.test(
        "visitante sin JWT: BFF 401 y página redirigida a acceso",
        async () => {
          assert.equal((await fetch(origin + listPath)).status, 401);
          assert.equal(
            (await fetch(origin + detailPath(own[0].idTienda))).status,
            401,
          );
          const page = await fetch(origin + "/mi-negocio/tiendas", {
            redirect: "manual",
          });
          assert.equal(page.status, 307);
          assert.match(page.headers.get("location"), /\/api\/auth\/session/);
        },
      );
      for (const key of ["CLIENTE", "ADMIN", "REPARTIDOR"])
        await t.test(
          `${key}: interfaz inaccesible y BFF GET/PATCH 403`,
          async () => {
            await login(key);
            assert.equal((await bff(listPath)).status, 403);
            assert.equal((await bff(detailPath(own[0].idTienda))).status, 403);
            assert.equal(
              (
                await bff(detailPath(own[0].idTienda), {
                  nombre: "No autorizado",
                })
              ).status,
              403,
            );
            await browser.navigate(origin + "/mi-negocio/tiendas");
            await browser.wait(
              "location.pathname === '/cuenta' && !!document.querySelector('.account-trigger')",
              "rol sin acceso",
            );
            assert.equal(
              await browser.evaluate(
                "!!document.querySelector('a[href=\"/mi-negocio/tiendas\"]')",
              ),
              false,
            );
          },
        );
      await login("owner");
      await t.test(
        "navegación del emprendedor muestra Gestionar mi negocio y dropdown",
        async () => {
          assert.equal(
            await browser.evaluate(
              "document.querySelector('a.account-action[href=\"/mi-negocio/tiendas\"]').innerText",
            ),
            "Gestionar mi negocio",
          );
          await click(".account-trigger");
          assert.equal(
            await browser.evaluate(
              "document.querySelector('.account-dropdown a[href=\"/mi-negocio/tiendas\"]').innerText",
            ),
            "Mi negocio",
          );
          await click('.account-dropdown a[href="/mi-negocio/tiendas"]');
          await browser.wait(
            "document.querySelectorAll('[data-managed-store]').length === 6 && !document.querySelector('.session-notice')",
            "tiendas propias",
          );
        },
      );
      await t.test(
        "la carga permanece visible mientras PostgreSQL aún no devuelve el listado",
        async () => {
          await navigate("/cuenta", "a.account-action");
          const loadingService = context.app.get(StoresService);
          const original = loadingService.search;
          let release;
          const gate = new Promise((resolve) => {
            release = resolve;
          });
          loadingService.search = async (...args) => {
            await gate;
            return original.apply(loadingService, args);
          };
          try {
            await browser.navigate(origin + "/mi-negocio/tiendas");
            await browser.wait(
              "!document.querySelector('.session-notice') && Array.from(document.querySelectorAll('[role=status]')).some(e=>e.innerText.includes('Cargando tus tiendas'))",
              "estado de carga visible",
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelectorAll('[data-managed-store]').length",
              ),
              0,
            );
          } finally {
            release();
            loadingService.search = original;
          }
          await browser.wait(
            "document.querySelectorAll('[data-managed-store]').length === 6",
            "listado tras completar carga",
          );
        },
      );
      await t.test(
        "PostgreSQL pagina y cuenta solo las ocho tiendas propias, incluidas inactivas",
        async () => {
          const response = await bff(listPath);
          assert.equal(response.status, 200);
          assert.equal(response.cache, "no-store");
          assert.equal(response.data.totalElements, 8);
          assert.equal(response.data.totalPages, 2);
          assert.ok(
            response.data.content.every(
              (s) => s.idEmprendedor === accounts.owner.idUsuario,
            ),
          );
          assert.ok(response.data.content.some((s) => s.estado === "INACTIVA"));
          assert.equal(
            await browser.evaluate(
              `Array.from(document.querySelectorAll('[data-managed-store]')).every(c=>c.innerText.includes('Inactiva') ? !c.querySelector('a[href^="/tiendas/"]') : !!c.querySelector('a[href^="/tiendas/"]'))`,
            ),
            true,
          );
          await click(
            'nav[aria-label="Páginas de mis tiendas"] button:last-child',
          );
          await browser.wait(
            "document.querySelectorAll('[data-managed-store]').length === 2",
            "segunda página real",
          );
          const second = await bff(listPath + "?page=1&size=6");
          assert.deepEqual(
            second.data.content.map((s) => s.idTienda),
            own.slice(6).map((s) => s.idTienda),
          );
        },
      );
      await t.test(
        "no admite filtro de otro propietario ni modificación de propietario/estado",
        async () => {
          assert.equal(
            (await bff(listPath + `?idEmprendedor=${accounts.other.idUsuario}`))
              .status,
            400,
          );
          for (const body of [
            { idEmprendedor: accounts.other.idUsuario },
            { estado: "ACTIVA" },
            { idTienda: foreign.idTienda },
          ])
            assert.equal(
              (await bff(detailPath(own[0].idTienda), body)).status,
              400,
            );
          assert.equal(
            (await stores.findOneByOrFail({ idTienda: own[0].idTienda }))
              .estado,
            "INACTIVA",
          );
        },
      );
      await t.test(
        "tienda ajena GET y PATCH 404 sin exposición ni escritura",
        async () => {
          for (const response of [
            await bff(detailPath(foreign.idTienda)),
            await bff(detailPath(foreign.idTienda), { nombre: "No permitido" }),
          ]) {
            assert.equal(response.status, 404);
            assert.doesNotMatch(JSON.stringify(response.data), /Negocio ajeno/);
          }
          assert.equal(
            (await stores.findOneByOrFail({ idTienda: foreign.idTienda }))
              .nombre,
            foreign.nombre,
          );
          await navigate(
            editPath(foreign.idTienda),
            '[data-management-status="404"]',
          );
        },
      );
      await t.test(
        "NestJS conserva la autorización definitiva por propietario",
        async () => {
          const loginResponse = await fetch(apiOrigin + "/api/v1/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              correo: accounts.owner.correo,
              clave: password,
            }),
          });
          assert.equal(loginResponse.status, 201);
          const credentials = await loginResponse.json();
          const response = await fetch(
            `${apiOrigin}/api/v1/stores/${foreign.idTienda}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${credentials.token}`,
              },
              body: JSON.stringify({ nombre: "No permitido" }),
            },
          );
          assert.equal(response.status, 404);
          assert.equal(
            (await stores.findOneByOrFail({ idTienda: foreign.idTienda }))
              .nombre,
            foreign.nombre,
          );
        },
      );
      await t.test(
        "edición precarga inactiva y PATCH parcial conserva campos omitidos",
        async () => {
          await readyForm(own[0].idTienda);
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#business-nombre').value",
            ),
            own[0].nombre,
          );
          await browser.evaluate(
            "window.__patchKeys=[]; const real=window.fetch; window.fetch=function(input,init){if(init?.method==='PATCH') window.__patchKeys=Object.keys(JSON.parse(init.body)); return real.apply(this,arguments);}",
          );
          await browser.fill(
            "#business-nombre",
            "Nombre comercial actualizado",
          );
          await save();
          await saved();
          assert.deepEqual(await browser.evaluate("window.__patchKeys"), [
            "nombre",
          ]);
          const after = await stores.findOneByOrFail({
            idTienda: own[0].idTienda,
          });
          assert.equal(after.nombre, "Nombre comercial actualizado");
          assert.equal(after.descripcion, own[0].descripcion);
          assert.equal(after.instagramUrl, own[0].instagramUrl);
          assert.equal(after.estado, "INACTIVA");
          await readyForm(own[0].idTienda);
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#business-nombre').value",
            ),
            after.nombre,
          );
        },
      );
      await t.test(
        "vaciar opcionales envía null y recargar confirma persistencia",
        async () => {
          for (const key of [
            "instagramUrl",
            "facebookUrl",
            "whatsappComercial",
            "telefono",
            "horario",
            "descripcion",
          ])
            await browser.fill(`#business-${key}`, "");
          await save();
          await saved();
          const after = await stores.findOneByOrFail({
            idTienda: own[0].idTienda,
          });
          for (const key of [
            "instagramUrl",
            "facebookUrl",
            "whatsappComercial",
            "telefono",
            "horario",
            "descripcion",
          ])
            assert.equal(after[key], null);
          assert.equal(after.direccion, own[0].direccion);
          await readyForm(own[0].idTienda);
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#business-instagramUrl').value",
            ),
            "",
          );
        },
      );
      await t.test(
        "formulario inválido muestra error por campo y no escribe",
        async () => {
          const before = await stores.findOneByOrFail({
            idTienda: own[0].idTienda,
          });
          await browser.fill("#business-nombre", "");
          await save();
          await browser.wait(
            "document.querySelector('#business-nombre').getAttribute('aria-invalid')==='true'",
            "nombre obligatorio",
          );
          assert.equal(
            await browser.evaluate("document.activeElement.id"),
            "business-nombre",
          );
          await browser.fill("#business-nombre", before.nombre);
          await browser.fill(
            "#business-instagramUrl",
            "https://instagram.com.attacker.test/local",
          );
          await save();
          await browser.wait(
            "!!document.querySelector('#business-instagramUrl-error')",
            "contacto inválido",
          );
          assert.equal(
            (await stores.findOneByOrFail({ idTienda: own[0].idTienda }))
              .instagramUrl,
            null,
          );
        },
      );
      await t.test(
        "reemplazo válido de contactos y dirección persiste normalización oficial",
        async () => {
          for (const [field, value] of Object.entries({
            instagramUrl: "https://instagram.com/nuevo_local",
            facebookUrl: "https://facebook.com/profile.php?id=123456",
            whatsappComercial: "+506 6666-6666",
            direccion: "Nueva dirección sintética",
          }))
            await browser.fill(`#business-${field}`, value);
          await save();
          await saved();
          const after = await stores.findOneByOrFail({
            idTienda: own[0].idTienda,
          });
          assert.equal(
            after.instagramUrl,
            "https://www.instagram.com/nuevo_local/",
          );
          assert.equal(after.whatsappComercial, "50666666666");
          assert.equal(after.direccion, "Nueva dirección sintética");
        },
      );
      const service = context.app.get(StoresService);
      await t.test(
        "rechazo 400 del servidor conserva los valores y evita escritura",
        async () => {
          await browser.fill("#business-nombre", "Valor conservado tras error");
          const original = service.update;
          service.update = async () => {
            throw new BadRequestException("private-database-detail");
          };
          try {
            await save();
            await browser.wait(
              "Array.from(document.querySelectorAll('[role=alert]')).some(e=>e.innerText.includes('servidor rechazó'))",
              "rechazo del servidor",
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelector('#business-nombre').value",
              ),
              "Valor conservado tras error",
            );
            assert.doesNotMatch(
              await browser.evaluate("document.body.innerText"),
              /private-database-detail/,
            );
            assert.equal(
              (await stores.findOneByOrFail({ idTienda: own[0].idTienda }))
                .nombre,
              "Nombre comercial actualizado",
            );
          } finally {
            service.update = original;
          }
          await save();
          await saved();
        },
      );
      await t.test(
        "GET inesperado 500 es seguro y Reintentar recupera listado",
        async () => {
          const original = service.search;
          service.search = async () => {
            throw new Error("private-query-marker");
          };
          try {
            await navigate(
              "/mi-negocio/tiendas",
              '[data-management-status="500"]',
            );
            assert.doesNotMatch(
              await browser.evaluate("document.body.innerText"),
              /private-query-marker/,
            );
          } finally {
            service.search = original;
          }
          await click("[data-management-status] button");
          await browser.wait(
            "document.querySelectorAll('[data-managed-store]').length===6",
            "reintento correcto",
          );
        },
      );
      await t.test(
        "error de red conserva sesión y permite reintentar",
        async () => {
          await browser.evaluate(
            "const original=window.fetch; window.__originalFetch=original; window.fetch=function(input,init){return String(input).startsWith('/api/mi-negocio/') ? Promise.reject(new TypeError('synthetic-network')) : original.apply(this,arguments);}",
          );
          // A Next Link navigation retains this one-page network fixture.
          await click('a[href="' + editPath(own[1].idTienda) + '"]');
          await browser.wait(
            "!!document.querySelector('[data-management-status=\"502\"]')",
            "red no disponible",
          );
          await browser.evaluate("window.fetch=window.__originalFetch");
          await click("[data-management-status] button");
          await browser.wait(
            "!!document.querySelector('#business-nombre')",
            "recuperación de red",
          );
        },
      );
      await t.test(
        "protección de origen rechaza escritura desde otro origen",
        async () => {
          const response = await fetch(origin + detailPath(own[0].idTienda), {
            method: "PATCH",
            headers: {
              origin: "https://evil.test",
              "content-type": "application/json",
            },
            body: JSON.stringify({ nombre: "No permitido" }),
          });
          assert.equal(response.status, 401); // No cookie: authentication is evaluated first.
          const result = await browser.evaluate(
            `fetch(${JSON.stringify(detailPath(own[0].idTienda))},{method:'PATCH',headers:{'Content-Type':'text/plain'},body:'{}'}).then(r=>r.status)`,
          );
          assert.equal(result, 403);
        },
      );
      await t.test("tienda inexistente e identificador inválido", async () => {
        assert.equal((await bff(detailPath(2147483647))).status, 404);
        assert.equal((await bff(detailPath("invalid"))).status, 400);
      });
      for (const width of [320, 390, 768, 1280, 1440])
        await t.test(`listado y formulario responsive ${width}px`, async () => {
          await browser.call("Emulation.setDeviceMetricsOverride", {
            width,
            height: 1000,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await navigate("/mi-negocio/tiendas", "[data-managed-store]");
          assert.ok(
            await browser.evaluate(
              "document.documentElement.scrollWidth<=innerWidth",
            ),
          );
          if ([320, 1440].includes(width))
            await capture(`mis-tiendas-${width}.png`);
          await readyForm(own[0].idTienda);
          assert.ok(
            await browser.evaluate(
              "document.documentElement.scrollWidth<=innerWidth",
            ),
          );
          assert.equal(
            await browser.evaluate(
              "!!document.querySelector('[name=idEmprendedor], [name=estado]')",
            ),
            false,
          );
          if ([320, 1440].includes(width))
            await capture(`editar-tienda-${width}.png`);
        });
      await t.test(
        "otro emprendedor ve solo su tienda y cuenta sin tiendas muestra vacío",
        async () => {
          await login("other");
          const response = await bff(listPath);
          assert.equal(response.data.totalElements, 1);
          assert.equal(response.data.content[0].idTienda, foreign.idTienda);
          assert.equal((await bff(detailPath(own[0].idTienda))).status, 404);
          await login("empty");
          await navigate("/mi-negocio/tiendas", "#my-stores-title");
          await browser.wait(
            "document.body.innerText.includes('Todavía no tenés tiendas')",
            "vacío real",
          );
          assert.equal((await bff(listPath)).data.totalElements, 0);
        },
      );
      await t.test(
        "JWT inválido y vencido: 401 y redirección sin tiendas privadas",
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
            assert.equal((await bff(listPath)).status, 401);
            await browser.navigate(origin + "/mi-negocio/tiendas");
            await browser.wait(
              "location.pathname==='/login' && !!document.querySelector('#correo')",
              "sesión vencida",
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelectorAll('[data-managed-store]').length",
              ),
              0,
            );
          }
        },
      );
      t.diagnostic(`Capturas con fixtures sintéticas: ${evidence}`);
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
