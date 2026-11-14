import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { chrome, freePort, until } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../..");

test(
  "Landing y navegación: Chrome + Next.js con API sintética local, sin bases de datos",
  { timeout: 180000 },
  async (t) => {
    let next, browser;
    let currentRole = "CLIENTE";
    let profileStatus = 200;
    const apiCalls = [];
    const backend = createServer(async (request, response) => {
      apiCalls.push(request.url);
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/api/v1/auth/login") {
        let raw = "";
        for await (const chunk of request) raw += chunk;
        const input = JSON.parse(raw);
        if (input.clave !== "local-browser-fixture") {
          response
            .writeHead(401)
            .end(JSON.stringify({ detail: "Credenciales inválidas" }));
          return;
        }
        response.writeHead(201).end(
          JSON.stringify({
            token: "synthetic-session",
            tipo: "Bearer",
            expiraEnSegundos: 3600,
          }),
        );
        return;
      }
      if (request.url === "/api/v1/auth/me") {
        response.writeHead(profileStatus).end(
          JSON.stringify(
            profileStatus === 200
              ? {
                  idUsuario: 1,
                  nombre: "Cuenta",
                  apellido: "Local",
                  correo: "local@example.test",
                  rol: currentRole,
                }
              : { detail: "Perfil no disponible" },
          ),
        );
        return;
      }
      if (request.url?.startsWith("/api/v1/orders?")) {
        response.end(
          JSON.stringify({
            content: [],
            page: 0,
            size: 10,
            totalElements: 0,
            totalPages: 0,
          }),
        );
        return;
      }
      response.writeHead(404).end("{}");
    });
    try {
      await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
      const port = await freePort();
      // Next normaliza request.url a localhost en su servidor local. Usar el mismo
      // hostname evita cruzar hosts al seguir el redirect absoluto del handler.
      const origin = `http://localhost:${port}`;
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
            API_URL: `http://127.0.0.1:${backend.address().port}/api/v1`,
            NODE_ENV: "production",
          },
          stdio: "ignore",
        },
      );
      await until(
        async () => {
          if (next.exitCode !== null) throw new Error("Next.js no inició");
          return fetch(origin)
            .then((r) => r.ok)
            .catch(() => false);
        },
        "Next.js listo",
        30000,
      );
      browser = await chrome();
      const ready = async (path) =>
        browser.wait(
          `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`,
          path,
        );
      const evidence = join(tmpdir(), "chorotega-landing-evidence");
      await mkdir(evidence, { recursive: true });

      for (const width of [320, 390, 768, 1280, 1440]) {
        await t.test(
          `landing pública a ${width}px: assets, enlaces y ausencia de llamadas privadas`,
          async () => {
            const before = apiCalls.length;
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 960,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await browser.navigate(origin);
            await ready("/");
            // Carga también las imágenes diferidas bajo el fold antes de la captura completa.
            await browser.evaluate(
              "Array.from(document.images).forEach(i => { i.loading = 'eager'; })",
            );
            await browser.wait(
              "!!document.querySelector('#landing-title') && Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)",
              "landing e imágenes listas",
            );
            await browser.evaluate("document.fonts.ready.then(() => true)");
            const result = await browser.evaluate(`(() => {
          const root = document.documentElement;
          const images = Array.from(document.images).map(i => ({path: i.getAttribute('src'), width: i.getBoundingClientRect().width, height: i.getBoundingClientRect().height, natural: i.naturalWidth, naturalHeight: i.naturalHeight, fit: getComputedStyle(i).objectFit}));
          return {overflow: root.scrollWidth > innerWidth, sections: document.querySelectorAll('[data-figma-section]').length, headings: document.querySelectorAll('h1').length,
            privateRequests: performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname.startsWith('/api/')).length,
            badLinks: Array.from(document.querySelectorAll('a')).filter(a => { const r=a.getBoundingClientRect(); return r.width<=0 || r.height<=0 || r.left<0 || r.right>innerWidth; }).map(a=>a.textContent), images,
            font: getComputedStyle(document.querySelector('h1')).fontFamily, fontsLoaded: document.fonts.check('16px LandingSerif') && document.fonts.check('16px LandingInter') && document.fonts.check('16px LandingWork')};
        })()`);
            assert.equal(result.overflow, false);
            assert.equal(result.sections, 9);
            assert.equal(result.headings, 1);
            assert.equal(result.privateRequests, 0);
            assert.equal(apiCalls.length, before);
            // El enlace de salto está fuera de pantalla hasta recibir foco.
            assert.deepEqual(
              result.badLinks.filter((text) => text !== "Saltar al contenido"),
              [],
            );
            assert.match(result.font, /LandingSerif/);
            assert.equal(result.fontsLoaded, true);
            for (const image of result.images) {
              assert(image.natural > 0 && image.width > 0 && image.height > 0);
              if (image.fit === "fill")
                assert(
                  Math.abs(
                    image.width / image.height -
                      image.natural / image.naturalHeight,
                  ) < 0.01,
                  `Imagen deformada: ${image.path}`,
                );
            }
            const screenshot = await browser.call("Page.captureScreenshot", {
              format: "png",
              captureBeyondViewport: true,
            });
            await writeFile(
              join(evidence, `landing-${width}.png`),
              Buffer.from(screenshot.data, "base64"),
            );
            await writeFile(
              join(evidence, `landing-${width}.json`),
              JSON.stringify(result, null, 2),
            );
          },
        );
      }

      await t.test(
        "CTAs abren login y los tres formularios existentes sin consultar el catálogo",
        async () => {
          await browser.call("Emulation.setDeviceMetricsOverride", {
            width: 1280,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
          });
          for (const [path, selector] of [
            ["/login", "#correo"],
            ["/registro", ".account-type-list"],
            ["/registro/cliente", "form"],
            ["/registro/emprendedor", "#entrepreneur-negocio"],
            ["/registro/repartidor", "#courier-transporte"],
          ]) {
            const before = apiCalls.length;
            await browser.navigate(origin);
            await ready("/");
            await browser.evaluate(
              `document.querySelector('a[href="${path}"]').click()`,
            );
            await ready(path);
            await browser.wait(
              `!!document.querySelector('${selector}')`,
              "formulario visible",
            );
            assert.equal(apiCalls.length, before);
          }
        },
      );

      for (const role of ["CLIENTE", "EMPRENDEDOR", "REPARTIDOR", "ADMIN"]) {
        await t.test(
          `login y recuperación ${role}: destino vigente, cookie HttpOnly y logout`,
          async () => {
            currentRole = role;
            profileStatus = 200;
            await browser.call("Network.clearBrowserCookies");
            await browser.navigate(`${origin}/login`);
            await ready("/login");
            await browser.fill("#correo", "local@example.test");
            await browser.fill("#clave", "incorrecta");
            await browser.evaluate(
              "document.querySelector('form').requestSubmit()",
            );
            await browser.wait(
              "!!document.querySelector('.login-error')",
              "error de login visible",
            );
            await browser.fill("#clave", "local-browser-fixture");
            await browser.evaluate(
              "document.querySelector('form').requestSubmit()",
            );
            const path = role === "CLIENTE" ? "/pedidos" : "/cuenta";
            await ready(path);
            await browser.wait(
              "!!document.querySelector('.account-trigger') && !document.querySelector('.session-notice')",
              "cuenta visible",
            );
            const cookie = (
              await browser.call("Network.getCookies", { urls: [origin] })
            ).cookies.find((c) => c.name === "chorotega_session");
            assert.equal(cookie.httpOnly, true);
            assert.equal(cookie.sameSite, "Lax");
            await browser.navigate(`${origin}/api/auth/session`);
            await ready(path);
            await browser.wait(
              "!!document.querySelector('.account-trigger') && !document.querySelector('.session-notice')",
              "sesión recuperada",
            );
            await browser.evaluate(
              "document.querySelector('.account-trigger').click(); document.querySelector('.account-logout').click()",
            );
            await ready("/login");
            assert.equal(
              (
                await browser.call("Network.getCookies", { urls: [origin] })
              ).cookies.some((c) => c.name === "chorotega_session"),
              false,
            );
          },
        );
      }

      await t.test(
        "cambio de rol revalida mediante /acceso; la landing sigue pública con cookie",
        async () => {
          currentRole = "CLIENTE";
          await browser.call("Network.setCookie", {
            name: "chorotega_session",
            value: "synthetic-session",
            url: origin,
            httpOnly: true,
            path: "/",
          });
          await browser.navigate(`${origin}/pedidos`);
          await ready("/pedidos");
          await browser.wait(
            "!document.querySelector('.session-notice')",
            "sesión lista",
          );
          currentRole = "REPARTIDOR";
          await browser.evaluate("window.dispatchEvent(new Event('focus'))");
          await ready("/cuenta");
          const before = apiCalls.length;
          await browser.navigate(origin);
          await ready("/");
          assert.equal(apiCalls.length, before);
        },
      );

      await t.test(
        "sesión expirada y backend indisponible conservan sus destinos sin bucles",
        async () => {
          for (const status of [503, 401]) {
            profileStatus = status;
            await browser.navigate(`${origin}/api/auth/session`);
            await ready(status === 401 ? "/login" : "/cuenta");
            await browser.wait(
              status === 401
                ? "!!document.querySelector('#correo')"
                : "!!document.querySelector('.account-card[role=alert]')",
              "estado visible",
            );
            const hasCookie = (
              await browser.call("Network.getCookies", { urls: [origin] })
            ).cookies.some((c) => c.name === "chorotega_session");
            assert.equal(hasCookie, status !== 401);
          }
        },
      );
      console.log(`Capturas y geometría local: ${evidence}`);
    } finally {
      await browser?.close();
      if (next && next.exitCode === null) {
        next.kill();
        await new Promise((resolve) => {
          next.once("exit", resolve);
          setTimeout(resolve, 5000).unref();
        });
      }
      backend.closeAllConnections();
      await new Promise((resolve) => backend.close(resolve));
    }
  },
);
