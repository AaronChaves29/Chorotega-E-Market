import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chrome, freePort, until } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../..");
const backendRequire = createRequire(
  resolve(frontend, "../backend/package.json"),
);
backendRequire("ts-node").register({
  project: resolve(frontend, "../backend/tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backendRequire(
  "./test/support/create-http-test-app.ts",
);
const { AuthModule } = backendRequire("./src/auth/auth.module.ts");
const { StoresModule } = backendRequire(
  "./src/modules/stores/stores.module.ts",
);
const { StoresService } = backendRequire(
  "./src/modules/stores/services/stores.service.ts",
);
const { User } = backendRequire("./src/modules/users/entities/user.entity.ts");
const { Store } = backendRequire(
  "./src/modules/stores/entities/store.entity.ts",
);
const { JwtService } = backendRequire("@nestjs/jwt");
const bcrypt = backendRequire("bcrypt");

test(
  "Explorar: Chrome → Next.js → NestJS → PostgreSQL temporal",
  { timeout: 240000 },
  async (t) => {
    let context, next, browser, release;
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const password = "Solo prueba temporal 123!";
    try {
      context = await createHttpTestApp([AuthModule, StoresModule]);
      await context.app.listen(0, "127.0.0.1");
      const apiOrigin = await context.app.getUrl();
      const ds = context.database.dataSource;
      const hash = await bcrypt.hash(password, 4);
      const users = ds.getRepository(User);
      const accounts = {};
      for (const rol of ["CLIENTE", "EMPRENDEDOR", "ADMIN", "REPARTIDOR"])
        accounts[rol] = await users.save({
          authId: randomUUID(),
          nombre: "Cuenta",
          apellido: "Temporal",
          correo: `${rol.toLowerCase()}@example.test`,
          rol,
          estado: "ACTIVO",
          claveHash: hash,
        });
      const stores = ds.getRepository(Store);
      const names = [
        "Alfarería Alba",
        "Alfarería Brisa",
        "Alfarería Cielo",
        "Alfarería Dalia",
        "Alfarería Estrella",
        "Alfarería Faro",
        "Alfarería Grano",
        "Alfarería Hoja",
        "Mercado Nicoya",
        "Taller 100%_real",
        "Sin descripción",
        "Zeta",
        "<img src=x onerror=alert(1)>",
        "Zeta",
      ];
      const saved = [];
      for (const nombre of names)
        saved.push(
          await stores.save({
            idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
            nombre,
            descripcion:
              nombre === "Sin descripción"
                ? null
                : "Creaciones locales · datos de prueba temporal",
            direccion: "Nicoya · dirección de prueba",
            estado: "ACTIVA",
          }),
        );
      await stores.save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Alfarería inactiva",
        direccion: "Temporal",
        estado: "INACTIVA",
      });
      const service = context.app.get(StoresService);
      const originalSearch = service.search.bind(service);
      const port = await freePort();
      const origin = `http://localhost:${port}`;
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
      next.stdout.on("data", (chunk) => {
        logs = (logs + chunk).slice(-10000);
      });
      next.stderr.on("data", (chunk) => {
        logs = (logs + chunk).slice(-10000);
      });
      await until(
        async () => {
          if (next.exitCode !== null) throw new Error(logs);
          return fetch(origin)
            .then((response) => response.ok)
            .catch(() => false);
        },
        "Next listo",
        30000,
      );
      browser = await chrome();
      const click = (selector) =>
        browser.evaluate(
          `document.querySelector(${JSON.stringify(selector)}).click()`,
        );
      const settled = () =>
        browser.wait(
          "!!document.querySelector('#emprendimientos[aria-busy=\"false\"]') && !document.querySelector('.session-notice')",
          "resultados listos",
        );
      const titles = () =>
        browser.evaluate(
          "Array.from(document.querySelectorAll('[data-store-id] h2'), e => e.textContent)",
        );
      const search = async (name) => {
        await browser.fill("#store-name", name);
        await browser.evaluate(
          "document.querySelector('form[role=search]').requestSubmit()",
        );
        await settled();
      };
      const sort = async (value) => {
        await browser.evaluate(
          `(() => {const select = document.querySelector('#store-sort'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true }));})()`,
        );
        await settled();
      };
      const login = async (role = "CLIENTE") => {
        await browser.navigate(`${origin}/login`);
        await browser.wait(
          "location.pathname === '/login' && !!document.querySelector('#correo')",
          "login",
        );
        await browser.fill("#correo", accounts[role].correo);
        await browser.fill("#clave", password);
        await browser.evaluate(
          "document.querySelector('form').requestSubmit()",
        );
        await browser.wait(
          `location.pathname === '${role === "CLIENTE" ? "/mercado" : "/cuenta"}' && !!document.querySelector('.account-trigger')`,
          "login real",
        );
        if (role !== "CLIENTE") await browser.navigate(`${origin}/mercado`);
        await settled();
      };
      const sessionCookie = (value) =>
        browser.call("Network.setCookie", {
          name: "chorotega_session",
          value,
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        });

      await t.test(
        "visitante anónimo no ve tiendas; route handler devuelve 401",
        async () => {
          const response = await fetch(`${origin}/mercado`, {
            redirect: "manual",
          });
          assert.equal(response.status, 307);
          assert.match(
            response.headers.get("location"),
            /\/api\/auth\/session/,
          );
          const proxy = await fetch(`${origin}/api/stores?size=6`);
          assert.equal(proxy.status, 401);
          assert.equal((await proxy.json()).content, undefined);
          await browser.navigate(`${origin}/mercado`);
          await browser.wait(
            "location.pathname === '/login' && !!document.querySelector('#correo')",
            "visitante en login",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelectorAll('[data-store-id]').length",
            ),
            0,
          );
        },
      );
      await t.test(
        "login real, listado activo, total SQL y cookie HttpOnly",
        async () => {
          await login();
          assert.equal((await titles()).length, 6);
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#emprendimientos').innerText.includes('14 emprendimientos')",
            ),
            true,
          );
          assert.equal(
            await browser.evaluate(
              "document.cookie.includes('chorotega_session')",
            ),
            false,
          );
          const response = await browser.evaluate(
            "fetch('/api/stores').then(r => r.json())",
          );
          assert.equal(response.size, 20);
          assert.equal(response.totalElements, 14);
          assert.ok(
            response.content.every((store) => store.estado === "ACTIVA"),
          );
          assert.equal(
            await browser.evaluate(
              "Array.from(document.querySelectorAll('[data-store-id]')).every(card => card.querySelector('a').getAttribute('href') === '/tiendas/' + card.dataset.storeId && card.querySelector('a').textContent.includes('Ver tienda'))",
            ),
            true,
          );
        },
      );
      await t.test(
        "búsqueda por nombre con paginación real y conservación de filtros",
        async () => {
          await search("Alfarería");
          assert.deepEqual(await titles(), names.slice(0, 6));
          assert.ok(
            await browser.evaluate(
              "document.querySelector('#emprendimientos').innerText.includes('8 emprendimientos')",
            ),
          );
          await click(
            'nav[aria-label="Páginas de emprendimientos"] button:last-child',
          );
          await settled();
          assert.deepEqual(await titles(), names.slice(6, 8));
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('Página 2 de 2')",
            ),
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#store-name').value",
            ),
            "Alfarería",
          );
        },
      );
      await t.test(
        "orden A–Z y Z–A reinicia página y preserva búsqueda",
        async () => {
          await sort("nombre-DESC");
          assert.deepEqual(
            await titles(),
            names.slice(0, 8).reverse().slice(0, 6),
          );
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('Página 1 de 2')",
            ),
          );
          await sort("nombre-ASC");
          assert.deepEqual(await titles(), names.slice(0, 6));
        },
      );
      await t.test(
        "orden por ID y desempate determinista con nombres repetidos",
        async () => {
          await search("Zeta");
          await sort("nombre-DESC");
          assert.deepEqual(
            await browser.evaluate(
              "Array.from(document.querySelectorAll('[data-store-id]'), e => Number(e.dataset.storeId))",
            ),
            [saved[13].idTienda, saved[11].idTienda],
          );
          await search("");
          await sort("idTienda-DESC");
          assert.deepEqual(
            await browser.evaluate(
              "Array.from(document.querySelectorAll('[data-store-id]'), e => Number(e.dataset.storeId))",
            ),
            saved
              .slice(-6)
              .reverse()
              .map((store) => store.idTienda),
          );
          await sort("idTienda-ASC");
          assert.deepEqual(await titles(), names.slice(0, 6));
        },
      );
      await t.test(
        "vacío, limpieza y búsqueda literal de %/_ y resistencia XSS",
        async () => {
          await search("Sin coincidencias");
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('No encontramos emprendimientos')",
            ),
          );
          await click('aside[aria-labelledby="filters-title"] button');
          await settled();
          assert.equal((await titles()).length, 6);
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#store-name').value",
            ),
            "",
          );
          await search("100%_");
          assert.deepEqual(await titles(), ["Taller 100%_real"]);
          await search("<img");
          assert.deepEqual(await titles(), ["<img src=x onerror=alert(1)>"]);
          assert.equal(
            await browser.evaluate(
              "!!document.querySelector('[data-store-id] [onerror]')",
            ),
            false,
          );
          await search("Sin descripción");
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('todavía no agregó una descripción')",
            ),
          );
        },
      );
      await t.test(
        "parámetros inválidos 400 y filtro de estado no permite tiendas inactivas",
        async () => {
          assert.equal(
            await browser.evaluate(
              "fetch('/api/stores?sortBy=claveHash').then(r => r.status)",
            ),
            400,
          );
          const result = await browser.evaluate(
            "fetch('/api/stores?estado=INACTIVA').then(r => r.json())",
          );
          assert.equal(result.totalElements, 14);
          assert.ok(result.content.every((store) => store.estado === "ACTIVA"));
        },
      );
      await t.test(
        "error inesperado seguro, reintento y sesión conservada",
        async () => {
          try {
            service.search = async () => {
              throw new Error("private-sql-marker");
            };
            await search("fallo-temporal-sin-coincidencias");
            await browser.wait(
              "!!document.querySelector('#emprendimientos [role=alert]')",
              "error visible",
            );
            assert.equal(
              await browser.evaluate(
                "document.body.innerText.includes('private-sql-marker')",
              ),
              false,
            );
            assert.equal(
              await browser.evaluate("location.pathname"),
              "/mercado",
            );
          } finally {
            service.search = originalSearch;
          }
          await browser.evaluate(
            "document.querySelector('#emprendimientos [role=alert] button').click()",
          );
          await browser.wait(
            "!document.querySelector('#emprendimientos [role=alert]') && document.querySelector('#emprendimientos').innerText.includes('No encontramos emprendimientos')",
            "reintento finalizado sin el error anterior",
          );
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('No encontramos emprendimientos')",
            ),
          );
        },
      );
      await t.test(
        "loading visible y cancelación evita resultados de una búsqueda anterior",
        async () => {
          const waiting = new Promise((resolve) => {
            release = resolve;
          });
          let olderStarted = false;
          let finishOlder;
          const olderDone = new Promise((resolve) => {
            finishOlder = resolve;
          });
          service.search = async (filters) => {
            if (filters.nombre === "Alfarería") {
              olderStarted = true;
              await waiting;
              try {
                return await originalSearch(filters);
              } finally {
                finishOlder();
              }
            }
            return originalSearch(filters);
          };
          try {
            await browser.fill("#store-name", "Alfarería");
            await browser.evaluate(
              "document.querySelector('form[role=search]').requestSubmit()",
            );
            await browser.wait(
              "document.querySelector('#emprendimientos').getAttribute('aria-busy') === 'true'",
              "loading",
            );
            await until(
              () => olderStarted,
              "solicitud anterior recibida por NestJS",
            );
            await search("Mercado Nicoya");
            assert.deepEqual(await titles(), ["Mercado Nicoya"]);
            release();
            await olderDone;
            // A fresh read after the old query completed must still show the newer filter.
            await browser.wait(
              "document.querySelector('#store-name').value === 'Mercado Nicoya'",
              "búsqueda vigente",
            );
            assert.deepEqual(await titles(), ["Mercado Nicoya"]);
          } finally {
            release();
            release = undefined;
            service.search = originalSearch;
          }
        },
      );

      await search("");
      await sort("nombre-ASC");
      const evidence = join(tmpdir(), "chorotega-marketplace-evidence");
      await mkdir(evidence, { recursive: true });
      for (const width of [320, 390, 768, 1280, 1440])
        await t.test(
          `responsive ${width}px, recursos originales y enlaces existentes`,
          async () => {
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 960,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await browser.evaluate("document.fonts.ready");
            await browser.wait(
              "Array.from(document.images).every(image => image.complete && image.naturalWidth > 0)",
              "recursos cargados",
            );
            const geometry = await browser.evaluate(
              `(() => { const card=document.querySelector('[data-store-id]'); return { width: innerWidth, scroll: document.documentElement.scrollWidth, cards: document.querySelectorAll('[data-store-id]').length, font: getComputedStyle(document.querySelector('h1')).fontFamily, background: getComputedStyle(document.querySelector('main').parentElement).backgroundColor, columns: getComputedStyle(card.parentElement).gridTemplateColumns, missing: Array.from(document.images).filter(image => !image.complete || !image.naturalWidth).length, privateImage: Array.from(document.images).some(image => image.src.includes('local-crafts')), links: Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href')) }; })()`,
            );
            assert.ok(geometry.scroll <= width, JSON.stringify(geometry));
            assert.equal(geometry.cards, 6);
            assert.equal(geometry.missing, 0);
            assert.equal(geometry.privateImage, false);
            assert.ok(geometry.font.includes("LandingSerif"));
            assert.equal(geometry.background, "rgb(247, 243, 234)");
            assert.ok(
              geometry.links.every(
                (href) =>
                  /^\/tiendas\/\d+$/.test(href) ||
                  [
                    "/",
                    "/mercado",
                    "/pedidos",
                    "/pedidos/nuevo",
                    "/registro",
                    "/emprendedores",
                    "#emprendimientos",
                  ].includes(href),
              ),
            );
            if (width === 1440)
              assert.equal(geometry.columns.split(" ").length, 3);
            const metrics = await browser.call("Page.getLayoutMetrics");
            const capture = await browser.call("Page.captureScreenshot", {
              format: "png",
              captureBeyondViewport: true,
              clip: {
                x: 0,
                y: 0,
                width,
                height: metrics.cssContentSize.height,
                scale: 1,
              },
            });
            await writeFile(
              join(evidence, `mercado-${width}.png`),
              Buffer.from(capture.data, "base64"),
            );
            await writeFile(
              join(evidence, `mercado-${width}.json`),
              JSON.stringify(geometry, null, 2),
            );
          },
        );
      await t.test(
        "cliente vuelve a explorar desde el menú de Mis pedidos",
        async () => {
          await browser.navigate(`${origin}/pedidos`);
          await browser.wait(
            "!!document.querySelector('.account-trigger') && !document.querySelector('.session-notice')",
            "cuenta cliente",
          );
          await click(".account-trigger");
          await click('.account-dropdown a[href="/mercado"]');
          await settled();
          assert.equal(await browser.evaluate("location.pathname"), "/mercado");
        },
      );
      await t.test(
        "JWT inválido y vencido: 401, cookie eliminada y redirección a login",
        async () => {
          const expired = await context.app
            .get(JwtService)
            .signAsync(
              { sub: accounts.CLIENTE.idUsuario, rol: "CLIENTE" },
              { expiresIn: -1 },
            );
          for (const value of ["invalid-local-test-token", expired]) {
            await sessionCookie(value);
            const response = await browser.evaluate(
              "fetch('/api/stores').then(async r => ({status: r.status, body: await r.json()}))",
            );
            assert.equal(response.status, 401);
            assert.equal(response.body.content, undefined);
            await browser.navigate(`${origin}/mercado`);
            await browser.wait(
              "location.pathname === '/login' && !!document.querySelector('#correo')",
              "sesión inválida en login",
            );
            const cookies = await browser.call("Network.getCookies", {
              urls: [origin],
            });
            assert.equal(
              cookies.cookies.some(
                (cookie) => cookie.name === "chorotega_session",
              ),
              false,
            );
          }
        },
      );
      await t.test(
        "sesión vencida durante consulta redirige sin mostrar resultados privados",
        async () => {
          await login();
          await users.update(accounts.CLIENTE.idUsuario, {
            estado: "INACTIVO",
          });
          try {
            await browser.fill("#store-name", "Alfarería");
            await browser.evaluate(
              "document.querySelector('form[role=search]').requestSubmit()",
            );
            await browser.wait(
              "location.pathname === '/login' && !!document.querySelector('#correo')",
              "cuenta revocada",
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelectorAll('[data-store-id]').length",
              ),
              0,
            );
          } finally {
            await users.update(accounts.CLIENTE.idUsuario, {
              estado: "ACTIVO",
            });
          }
        },
      );
      await t.test(
        "otros roles leen el mercado sin acción de compra; logout sigue funcionando",
        async () => {
          for (const role of ["ADMIN", "EMPRENDEDOR", "REPARTIDOR"]) {
            await login(role);
            assert.equal((await titles()).length, 6);
            assert.equal(
              await browser.evaluate(
                "document.querySelectorAll('[data-store-id] a[href=\"/pedidos/nuevo\"]').length",
              ),
              0,
            );
          }
          await click(".account-trigger");
          await click(".account-logout");
          await browser.wait(
            "location.pathname === '/login' && !!document.querySelector('#correo')",
            "logout",
          );
        },
      );
      t.diagnostic(`Capturas con datos exclusivos de pruebas: ${evidence}`);
    } finally {
      release?.();
      await browser?.close();
      if (next && next.exitCode === null) {
        next.kill();
        await new Promise((resolve) => {
          next.once("exit", resolve);
          setTimeout(resolve, 5000).unref();
        });
      }
      await context?.close();
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  },
);
