import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chrome, freePort, until } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../..");
const backend = resolve(frontend, "../backend");
const backendRequire = createRequire(resolve(backend, "package.json"));
backendRequire("ts-node").register({
  project: resolve(backend, "tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backendRequire(
  "./test/support/create-http-test-app.ts",
);
const { AuthModule } = backendRequire("./src/auth/auth.module.ts");
const { OrdersHttpModule } = backendRequire(
  "./src/modules/orders/orders-http.module.ts",
);
const { StoresModule } = backendRequire(
  "./src/modules/stores/stores.module.ts",
);
const { ProductsModule } = backendRequire(
  "./src/modules/products/products.module.ts",
);
const { NeighborhoodsModule } = backendRequire(
  "./src/modules/neighborhoods/neighborhoods.module.ts",
);
const { User } = backendRequire("./src/modules/users/entities/user.entity.ts");
const { Courier } = backendRequire("./src/modules/couriers/entities/courier.entity.ts");
const { Store } = backendRequire(
  "./src/modules/stores/entities/store.entity.ts",
);
const { Product } = backendRequire(
  "./src/modules/products/entities/product.entity.ts",
);
const { Category } = backendRequire(
  "./src/modules/categories/entities/category.entity.ts",
);
const { Neighborhood } = backendRequire(
  "./src/modules/neighborhoods/entities/neighborhood.entity.ts",
);
const { JwtService } = backendRequire("@nestjs/jwt");
const bcrypt = backendRequire("bcrypt");

test(
  "Cuenta y compra: Chrome → Next.js → NestJS → PostgreSQL temporal",
  { timeout: 240000 },
  async (t) => {
    let context, next, browser;
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const password = "Clave de prueba local 123!";
    try {
      context = await createHttpTestApp([
        AuthModule,
        OrdersHttpModule,
        StoresModule,
        ProductsModule,
        NeighborhoodsModule,
      ]);
      await context.app.listen(0, "127.0.0.1");
      const apiOrigin = await context.app.getUrl();
      const ds = context.database.dataSource;
      const users = ds.getRepository(User);
      const hash = await bcrypt.hash(password, 4);
      const accounts = {};
      for (const rol of ["ADMIN", "EMPRENDEDOR", "REPARTIDOR", "CLIENTE"])
        accounts[rol] = await users.save({
          authId: randomUUID(),
          nombre: rol === "CLIENTE" ? "Otra persona" : `Cuenta ${rol}`,
          apellido: "Prueba temporal",
          correo: `${rol.toLowerCase()}@example.test`,
          rol,
          estado: "ACTIVO",
          claveHash: hash,
        });
      const store = await ds.getRepository(Store).save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Tienda de prueba temporal",
        direccion: "Nicoya",
        estado: "ACTIVA",
      });
      const category = await ds
        .getRepository(Category)
        .save({ nombre: "Categoría temporal", estado: "ACTIVA" });
      const product = await ds.getRepository(Product).save({
        idTienda: store.idTienda,
        idCategoria: category.idCategoria,
        nombre: "Producto temporal",
        precio: "1000.00",
        cantidadDisponible: 50,
        estado: "ACTIVO",
      });
      const neighborhood = await ds.getRepository(Neighborhood).save({
        nombre: "Barrio temporal",
        tarifaEnvio: "500.00",
        estado: "ACTIVO",
      });
      const port = await freePort();
      const origin = `http://127.0.0.1:${port}`;
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
          windowsHide: true,
          env: {
            ...process.env,
            API_URL: `${apiOrigin}/api/v1`,
            NODE_ENV: "production",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      next.stdout.on("data", (chunk) => {
        logs = (logs + chunk).slice(-12000);
      });
      next.stderr.on("data", (chunk) => {
        logs = (logs + chunk).slice(-12000);
      });
      await until(
        async () => {
          try {
            return (await fetch(`${origin}/login`)).ok;
          } catch {
            if (next.exitCode !== null) throw new Error(logs);
            return false;
          }
        },
        "Next.js listo",
        30000,
      );
      browser = await chrome();
      const ready = async (path) => {
        await browser.wait(
          `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`,
          path,
        );
        if (path !== "/login" && !path.startsWith("/registro"))
          await browser.wait(
            `!!document.querySelector('.account-header') && !document.querySelector('.session-notice')`,
            "perfil visible",
          );
      };
      const click = (selector) =>
        browser.evaluate(
          `document.querySelector(${JSON.stringify(selector)}).click()`,
        );
      const login = async (correo) => {
        await browser.navigate(`${origin}/login`);
        await ready("/login");
        await browser.fill("#correo", correo);
        await browser.fill("#clave", password);
        await browser.evaluate(
          "document.querySelector('form').requestSubmit()",
        );
      };
      const logout = async () => {
        await click(".account-trigger");
        await click(".account-logout");
        await ready("/login");
      };

      await t.test("intermediarios reales rechazan consultas sin cookie", async () => {
        for (const path of ["/api/stores", "/api/products?idTienda=1", "/api/neighborhoods"]) {
          const response = await fetch(`${origin}${path}`);
          assert.equal(response.status, 401);
          assert.equal(response.headers.get("cache-control"), "no-store");
          const body = await response.json();
          assert.equal(body.token, undefined);
          assert.equal(body.content, undefined);
        }
      });

      await t.test(
        "registro real, confirmación, validación y login con nombre persistido",
        async () => {
          await browser.navigate(`${origin}/registro/cliente`);
          await ready("/registro/cliente");
          for (const [field, value] of Object.entries({
            nombre: "Ana María",
            apellido: "Prueba de registro",
            correo: "nueva@example.test",
            telefono: "88888888",
            clave: password,
            confirmacion: "no coincide",
          }))
            await browser.fill(`#registro-${field}`, value);
          await browser.evaluate(
            "document.querySelector('form').requestSubmit()",
          );
          await browser.wait(
            "document.body.innerText.includes('Las contraseñas no coinciden')",
            "confirmación requerida",
          );
          assert.equal(
            await users.countBy({ correo: "nueva@example.test" }),
            0,
          );
          await browser.fill("#registro-confirmacion", password);
          await browser.evaluate(
            "document.querySelector('form').requestSubmit()",
          );
          await browser.wait(
            "!!document.querySelector('.registration-success')",
            "registro exitoso",
          );
          const user = await users.findOneByOrFail({
            correo: "nueva@example.test",
          });
          assert.equal(user.rol, "CLIENTE");
          assert.ok(await bcrypt.compare(password, user.claveHash));
          await login("nueva@example.test");
          await ready("/pedidos");
          assert.equal(
            await browser.evaluate(
              "document.querySelector('.account-trigger-name').textContent",
            ),
            "Ana María Prueba de registro",
          );
          assert.equal(
            await browser.evaluate(
              "document.cookie.includes('chorotega_session')",
            ),
            false,
          );
        },
      );
      await t.test(
        "menú, Escape, teclado, clic fuera y página informativa sin solicitud falsa",
        async () => {
          await browser.call("Page.bringToFront");
          await browser.wait(
            "!document.querySelector('.session-notice')",
            "sesión lista para teclado",
          );
          await browser.evaluate(
            "document.querySelector('.account-trigger').focus()",
          );
          await browser.wait(
            "document.activeElement === document.querySelector('.account-trigger')",
            "foco del disparador",
          );
          await browser.call("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Enter",
            code: "Enter",
            windowsVirtualKeyCode: 13,
            text: "\r",
          });
          await browser.call("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Enter",
            code: "Enter",
            windowsVirtualKeyCode: 13,
          });
          await browser.wait(
            "document.querySelector('.account-trigger').getAttribute('aria-expanded') === 'true'",
            "menú abierto por teclado",
          );
          assert.match(
            await browser.evaluate(
              "document.querySelector('.account-identity').innerText",
            ),
            /nueva@example.test/,
          );
          await browser.call("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
          });
          await browser.call("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
          });
          assert.equal(
            await browser.evaluate("document.activeElement.textContent.trim()"),
            "Mis pedidos",
          );
          await browser.call("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
          });
          assert.ok(
            await browser.evaluate(
              "document.activeElement === document.querySelector('.account-trigger') && document.querySelector('.account-dropdown').hidden",
            ),
          );
          await click(".account-trigger");
          await browser.evaluate(
            "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))",
          );
          assert.ok(
            await browser.evaluate(
              "document.querySelector('.account-dropdown').hidden",
            ),
          );
          await click(".account-trigger");
          await click('a[href="/emprendedores"]');
          await ready("/emprendedores");
          assert.equal(
            await browser.evaluate(
              "document.querySelectorAll('.entrepreneur-benefits article').length",
            ),
            4,
          );
          assert.match(
            await browser.evaluate("document.body.innerText"),
            /Ya está disponible el registro/,
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('.entrepreneur-notice button')",
            ),
            null,
          );
        },
      );
      await t.test(
        "responsividad en seis anchos, nombres largos y zoom",
        async () => {
          const user = await users.findOneByOrFail({
            correo: "nueva@example.test",
          });
          await users.update(user.idUsuario, {
            nombre: "Nombre ".repeat(14).trim(),
            apellido: "Apellido ".repeat(11).trim(),
            correo: `${"correo".repeat(20)}@example.test`,
          });
          await browser.navigate(`${origin}/cuenta`);
          await ready("/cuenta");
          for (const width of [320, 375, 390, 600, 768, 1280]) {
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 900,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await click(".account-trigger");
            assert.ok(
              await browser.evaluate(
                "document.documentElement.scrollWidth <= innerWidth",
              ),
              `sin desbordamiento en ${width}`,
            );
            assert.ok(
              await browser.evaluate(
                "(() => {const r = document.querySelector('.account-dropdown').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;})()",
              ),
              `menú dentro de ${width}`,
            );
            await click(".account-trigger");
          }
          await browser.evaluate("document.body.style.zoom = '200%'");
          assert.ok(
            await browser.evaluate(
              "document.documentElement.scrollWidth <= innerWidth",
            ),
            "zoom sin desbordamiento",
          );
          await browser.evaluate("document.body.style.zoom = ''");
          await users.update(user.idUsuario, {
            nombre: "Ana María",
            apellido: "Prueba de registro",
            correo: "nueva@example.test",
          });
          await browser.navigate(`${origin}/pedidos/nuevo`);
          await ready("/pedidos/nuevo");
        },
      );
      await t.test(
        "compra real conserva catálogo, cantidades, resumen y diálogo de éxito",
        async () => {
          await browser.wait(
            "!!document.querySelector('input[name=store]')",
            "tiendas",
          );
          await click("input[name=store]");
          await browser.wait(
            "!!document.querySelector('.create-order-product-card input')",
            "productos",
          );
          await browser.fill(".create-order-product-card input", "2");
          await browser.wait(
            "!!document.querySelector('select option[value]') && document.querySelectorAll('select option').length > 1",
            "barrios",
          );
          await browser.evaluate(
            `(() => { const s = document.querySelector('select'); s.value = '${neighborhood.idBarrio}'; s.dispatchEvent(new Event('change', {bubbles: true})); })()`,
          );
          await browser.fill("textarea", "Dirección de prueba en Nicoya");
          assert.match(
            await browser.evaluate("document.body.innerText"),
            /Producto temporal/,
          );
          await browser.evaluate(
            "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Confirmar pedido')).click()",
          );
          await browser.wait(
            "!!document.querySelector('[role=dialog]')",
            "confirmación exitosa",
          );
          const { Order } = backendRequire(
            "./src/modules/orders/entities/order.entity.ts",
          );
          const orders = await ds.getRepository(Order).find();
          assert.equal(orders.length, 1);
          assert.equal(orders[0].total, "2500.00");
          assert.equal(
            (
              await ds
                .getRepository(Product)
                .findOneByOrFail({ idProducto: product.idProducto })
            ).cantidadDisponible,
            48,
          );
          await browser.evaluate(
            "document.querySelector('[role=dialog] button').click()",
          );
          await ready("/pedidos");
          await browser.wait(
            "!!document.querySelector('.order-card')",
            "pedido visible",
          );
        },
      );
      await t.test(
        "paginación real de pedidos y recuperación ante API indisponible",
        async () => {
          const statuses = await browser.evaluate(`(async () => {
            const statuses = [];
            for (let i = 0; i < 11; i++) {
              const response = await fetch('/api/orders', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ idBarrio: ${neighborhood.idBarrio}, direccionEntrega: 'Pedido temporal de paginación', items: [{idProducto: ${product.idProducto}, cantidad: 1}] }) });
              statuses.push(response.status);
            }
            return statuses;
          })()`);
          assert.deepEqual(statuses, Array(11).fill(201));
          await browser.navigate(`${origin}/pedidos`);
          await ready("/pedidos");
          await browser.wait(
            "document.querySelectorAll('.order-card').length === 10",
            "primera página de pedidos",
          );
          await browser.evaluate(
            "Array.from(document.querySelectorAll('.orders-page-button')).find(b => b.textContent.includes('Siguiente')).click()",
          );
          await browser.wait(
            "document.querySelectorAll('.order-card').length === 2 && document.querySelector('.orders-page-number').textContent.includes('Página 2')",
            "segunda página de pedidos",
          );
          const { AuthService } = backendRequire("./src/auth/auth.service.ts");
          const auth = context.app.get(AuthService);
          const original = auth.profile;
          try {
            auth.profile = async () => {
              throw new Error("Fallo controlado de prueba");
            };
            await browser.navigate(`${origin}/cuenta`);
            await browser.wait(
              "document.body.innerText.includes('No pudimos consultar tu cuenta')",
              "error de perfil comprensible",
            );
            assert.equal(
              await browser.evaluate(
                "!!document.querySelector('.account-header')",
              ),
              false,
            );
            assert.ok(
              (
                await browser.call("Network.getCookies", { urls: [origin] })
              ).cookies.some((c) => c.name === "chorotega_session"),
            );
          } finally {
            auth.profile = original;
          }
          await click(".account-action");
          await ready("/cuenta");
        },
      );
      await t.test(
        "logout, otra cuenta e historial no conservan identidad ni pedidos",
        async () => {
          await logout();
          await login(accounts.CLIENTE.correo);
          await ready("/pedidos");
          await browser.wait(
            "document.body.innerText.includes('Todavía no tenés pedidos')",
            "cuenta sin pedidos ajenos",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('.account-trigger-name').textContent",
            ),
            "Otra persona Prueba temporal",
          );
          await logout();
          await browser.evaluate("history.back()");
          await browser.wait(
            "location.pathname === '/login' && !document.querySelector('.account-header')",
            "historial protegido",
          );
        },
      );
      await t.test(
        "roles no compradores van a cuenta y no pueden abrir creación",
        async () => {
          for (const role of ["ADMIN", "EMPRENDEDOR", "REPARTIDOR"]) {
            await login(accounts[role].correo);
            await ready("/cuenta");
            await click(".account-trigger");
            assert.equal(
              await browser.evaluate(
                "Array.from(document.querySelectorAll('.account-dropdown a')).some(a => /Mis productos|Mi tienda|Mis entregas|Mis pedidos/.test(a.textContent))",
              ),
              false,
            );
            if (role === "ADMIN")
              assert.equal(
                await browser.evaluate(
                  "Array.from(document.querySelectorAll('.account-dropdown a')).find(a => a.textContent.includes('Panel administrativo')).href",
                ),
                `${apiOrigin}/admin/login`,
              );
            await browser.navigate(`${origin}/pedidos/nuevo`);
            await ready("/cuenta");
            await logout();
          }
        },
      );
      await t.test(
        "rol vigente y cookie expirada o inválida se revalidan",
        async () => {
          await login(accounts.CLIENTE.correo);
          await ready("/pedidos");
          await users.update(accounts.CLIENTE.idUsuario, { rol: "REPARTIDOR" });
          await browser.navigate(`${origin}/`);
          await ready("/cuenta");
          const expired = await context.app.get(JwtService).signAsync(
            {
              sub: accounts.CLIENTE.correo,
              idUsuario: accounts.CLIENTE.idUsuario,
              rol: "CLIENTE",
            },
            { expiresIn: -1 },
          );
          for (const value of [expired, "invalid-jwt"]) {
            await browser.call("Network.setCookie", {
              name: "chorotega_session",
              value,
              url: origin,
              httpOnly: true,
              path: "/",
            });
            await browser.navigate(`${origin}/cuenta`);
            await ready("/login");
            assert.equal(
              (
                await browser.call("Network.getCookies", { urls: [origin] })
              ).cookies.some((c) => c.name === "chorotega_session"),
              false,
            );
          }
        },
      );
      await t.test("registro emprendedor real: seleccion, validaciones, persistencia, perfil y logout", async () => {
        await browser.navigate(`${origin}/registro`);
        await ready("/registro");
        assert.ok(await browser.evaluate("!!document.querySelector('a[href=\"/registro/emprendedor\"]')"));
        await click('a[href="/registro/emprendedor"]');
        await ready("/registro/emprendedor");
        await browser.wait("!!document.querySelector('#entrepreneur-negocio')", "formulario de negocio");
        await browser.wait("Array.from(document.querySelectorAll('.entrepreneur-story img')).every(img => img.complete && img.naturalWidth > 0)", "recursos locales de Figma cargados");
        for (const width of [320, 390, 768, 1280]) {
          await browser.call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
          assert.ok(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"), `registro sin desbordamiento en ${width}`);
        }
        const metrics = await browser.call("Page.getLayoutMetrics");
        const capture = await browser.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1280, height: metrics.cssContentSize.height, scale: 1 } });
        const screenshot = resolve(tmpdir(), "chorotega-entrepreneur-registration.png");
        await writeFile(screenshot, Buffer.from(capture.data, "base64"));
        t.diagnostic(`Registro de negocio, captura sin datos personales: ${screenshot}`);
        const fields = { negocio: "Ceramica de Ana", nombre: "Ana", apellido: "Persona", correo: "emprendedora-nueva@example.test", clave: password, confirmacion: "no coincide", direccion: "Nicoya, local de prueba", descripcion: "Artesanias", telefono: "+506 8888-8888", horario: "Lunes a viernes" };
        for (const [field, value] of Object.entries(fields)) await browser.fill(`#entrepreneur-${field}`, value);
        await click('button[aria-label="Mostrar contraseña"]');
        assert.equal(await browser.evaluate("document.querySelector('#entrepreneur-clave').type"), "text");
        await browser.evaluate("document.querySelector('form').requestSubmit()");
        await browser.wait("document.body.innerText.includes('Las contraseñas no coinciden')", "confirmacion de negocio rechazada");
        assert.equal(await users.countBy({ correo: fields.correo }), 0);
        await browser.fill("#entrepreneur-confirmacion", password);
        await browser.fill("#entrepreneur-telefono", "abc");
        await browser.evaluate("document.querySelector('form').requestSubmit()");
        await browser.wait("document.body.innerText.includes('entre 8 y 15')", "telefono validado");
        await browser.fill("#entrepreneur-telefono", fields.telefono);
        // Backend error remains an error in the form, never a success screen.
        await browser.fill("#entrepreneur-correo", accounts.EMPRENDEDOR.correo);
        await browser.evaluate("document.querySelector('form').requestSubmit()");
        await browser.wait("document.body.innerText.includes('Ya existe una cuenta')", "duplicado visible");
        assert.equal(await browser.evaluate("!!document.querySelector('.registration-success')"), false);
        await browser.fill("#entrepreneur-correo", fields.correo);
        await browser.evaluate("document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit()");
        await browser.wait("!!document.querySelector('.registration-success')", "registro de negocio confirmado");
        const entrepreneur = await users.findOneByOrFail({ correo: fields.correo });
        assert.equal(entrepreneur.rol, "EMPRENDEDOR");
        assert.ok(await bcrypt.compare(password, entrepreneur.claveHash));
        const stores = await ds.getRepository(Store).findBy({ idEmprendedor: entrepreneur.idUsuario });
        assert.equal(stores.length, 1);
        assert.equal(stores[0].nombre, fields.negocio);
        assert.equal(stores[0].direccion, fields.direccion);
        await click('.registration-success a[href="/login"]');
        await ready("/login");
        await login(fields.correo);
        await ready("/cuenta");
        assert.ok(await browser.evaluate("document.body.innerText.includes('Emprendedor') && document.body.innerText.includes('Ana Persona')"));
        assert.equal(await browser.evaluate("document.cookie.includes('chorotega_session')"), false);
        await logout();
      });
      await t.test("registro repartidor real: transporte, errores, persistencia, perfil y logout", async () => {
        await browser.navigate(`${origin}/registro`);
        await ready("/registro");
        await click('a[href="/registro/repartidor"]');
        await ready("/registro/repartidor");
        await browser.wait("!!document.querySelector('#courier-nombre')", "formulario de repartidor");
        assert.ok(await browser.evaluate("document.querySelector('.registration-kicker').innerText.includes('REPARTIDOR')"));
        await browser.wait("Array.from(document.querySelectorAll('.entrepreneur-story img')).every(img => img.complete && img.naturalWidth > 0)", "imagenes de registro cargadas");
        for (const width of [320,390,768,1280]) {
          await browser.call("Emulation.setDeviceMetricsOverride", {width,height:900,deviceScaleFactor:1,mobile:false});
          assert.ok(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"), `sin desbordamiento a ${width}`);
        }
        const metrics = await browser.call("Page.getLayoutMetrics");
        const capture = await browser.call("Page.captureScreenshot", {format:"png",captureBeyondViewport:true,clip:{x:0,y:0,width:1280,height:metrics.cssContentSize.height,scale:1}});
        const screenshot=resolve(tmpdir(),"chorotega-courier-registration.png");
        await writeFile(screenshot,Buffer.from(capture.data,"base64"));
        t.diagnostic(`Registro de repartidor, captura sin datos personales: ${screenshot}`);
        const fields={nombre:"Luis",apellido:"Persona",correo:"nuevo-courier@example.test",clave:password,confirmacion:"no coincide",telefono:"+506 8888-8888"};
        for (const [key,value] of Object.entries(fields)) await browser.fill(`#courier-${key}`,value);
        await browser.evaluate("const select=document.querySelector('#courier-transporte'); select.value='Bicicleta'; select.dispatchEvent(new Event('change',{bubbles:true}))");
        await click('button[aria-label="Mostrar contraseña"]');
        assert.equal(await browser.evaluate("document.querySelector('#courier-clave').type"),"text");
        await browser.evaluate("document.querySelector('form').requestSubmit()");
        await browser.wait("document.body.innerText.includes('Las contraseñas no coinciden')","confirmacion requerida");
        assert.equal(await users.countBy({correo:fields.correo}),0);
        await browser.fill("#courier-confirmacion",password);
        await browser.fill("#courier-telefono","123");
        await browser.evaluate("document.querySelector('form').requestSubmit()");
        await browser.wait("!!document.querySelector('.registration-error') && document.querySelector('.registration-error').innerText.includes('entre 8 y 15')","telefono validado");
        await browser.fill("#courier-telefono",fields.telefono);
        await browser.fill("#courier-correo",accounts.REPARTIDOR.correo);
        await browser.evaluate("document.querySelector('form').requestSubmit()");
        await browser.wait("document.body.innerText.includes('Ya existe una cuenta')","duplicado visible");
        assert.equal(await browser.evaluate("!!document.querySelector('.registration-success')"),false);
        await browser.fill("#courier-correo",fields.correo);
        await browser.evaluate("document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit()");
        await browser.wait("!!document.querySelector('.registration-success')","registro confirmado");
        const user=await users.findOneByOrFail({correo:fields.correo});
        assert.equal(user.rol,"REPARTIDOR"); assert.ok(await bcrypt.compare(password,user.claveHash));
        const profiles=await ds.getRepository(Courier).findBy({idUsuario:user.idUsuario});
        assert.equal(profiles.length,1);assert.equal(profiles[0].medioTransporte,"Bicicleta");assert.equal(profiles[0].disponibilidad,"DISPONIBLE");
        await click('.registration-success a[href="/login"]');await ready("/login");await login(fields.correo);await ready("/cuenta");
        assert.ok(await browser.evaluate("document.body.innerText.includes('Repartidor') && document.body.innerText.includes('Luis Persona') && document.body.innerText.includes('nuevo-courier@example.test')"));
        assert.equal(await browser.evaluate("document.cookie.includes('chorotega_session')"),false);
        await logout();
      });
    } finally {
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
