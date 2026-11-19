import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chrome, freePort, until, waitForLoginHydration } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../..");
const backend = createRequire(resolve(frontend, "../backend/package.json"));
backend("ts-node").register({
  project: resolve(frontend, "../backend/tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backend("./test/support/create-http-test-app.ts");
const { AuthModule } = backend("./src/auth/auth.module.ts");
const { StoresModule } = backend("./src/modules/stores/stores.module.ts");
const { ProductsModule } = backend("./src/modules/products/products.module.ts");
const { OrdersHttpModule } = backend(
  "./src/modules/orders/orders-http.module.ts",
);
const { NeighborhoodsModule } = backend(
  "./src/modules/neighborhoods/neighborhoods.module.ts",
);
const { User } = backend("./src/modules/users/entities/user.entity.ts");
const { Store } = backend("./src/modules/stores/entities/store.entity.ts");
const { Product } = backend(
  "./src/modules/products/entities/product.entity.ts",
);
const { Category } = backend(
  "./src/modules/categories/entities/category.entity.ts",
);
const { Order } = backend("./src/modules/orders/entities/order.entity.ts");
const { Neighborhood } = backend(
  "./src/modules/neighborhoods/entities/neighborhood.entity.ts",
);
const { ProductsService } = backend(
  "./src/modules/products/products.service.ts",
);
const bcrypt = backend("bcrypt");

test(
  "Carrito: Chrome → Next.js → NestJS → PostgreSQL temporal",
  { timeout: 240000 },
  async (t) => {
    let context, next, browser;
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const password = "Exclusiva de fixtures locales 123!";
    try {
      context = await createHttpTestApp([
        AuthModule,
        StoresModule,
        ProductsModule,
        OrdersHttpModule,
        NeighborhoodsModule,
      ]);
      await context.app.listen(0, "127.0.0.1");
      const api = await context.app.getUrl(),
        ds = context.database.dataSource;
      const users = ds.getRepository(User),
        hash = await bcrypt.hash(password, 4),
        accounts = {};
      for (const role of [
        "CLIENTE",
        "OTRO",
        "EMPRENDEDOR",
        "ADMIN",
        "REPARTIDOR",
      ])
        accounts[role] = await users.save({
          authId: randomUUID(),
          nombre: "Persona",
          apellido: "Temporal",
          correo: `${role.toLowerCase()}@example.test`,
          rol: role === "OTRO" ? "CLIENTE" : role,
          estado: "ACTIVO",
          claveHash: hash,
        });
      const stores = ds.getRepository(Store),
        products = ds.getRepository(Product);
      const shop = await stores.save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Taller local",
        direccion: "Nicoya",
        estado: "ACTIVA",
      });
      const other = await stores.save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Otra tienda",
        direccion: "Nicoya",
        estado: "ACTIVA",
      });
      const category = await ds
        .getRepository(Category)
        .save({ nombre: "Categoría temporal" });
      const p1 = await products.save({
        idTienda: shop.idTienda,
        idCategoria: category.idCategoria,
        nombre: "Pieza café",
        precio: "10.11",
        cantidadDisponible: 10,
        estado: "ACTIVO",
      });
      const p2 = await products.save({
        idTienda: shop.idTienda,
        idCategoria: category.idCategoria,
        nombre: "Cerámica",
        precio: "0.29",
        cantidadDisponible: 5,
        estado: "ACTIVO",
      });
      const zero = await products.save({
        idTienda: shop.idTienda,
        idCategoria: category.idCategoria,
        nombre: "Sin stock",
        precio: "1.00",
        cantidadDisponible: 0,
        estado: "ACTIVO",
      });
      const p3 = await products.save({
        idTienda: other.idTienda,
        idCategoria: category.idCategoria,
        nombre: "Otra pieza",
        precio: "20.01",
        cantidadDisponible: 5,
        estado: "ACTIVO",
      });
      const area = await ds.getRepository(Neighborhood).save({
        nombre: "Barrio temporal",
        tarifaEnvio: "500.05",
        estado: "ACTIVO",
      });
      const orders = ds.getRepository(Order),
        service = context.app.get(ProductsService),
        originalFind = service.findById.bind(service);
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
            NODE_ENV: "production",
            API_URL: `${api}/api/v1`,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let logs = "";
      for (const stream of [next.stdout, next.stderr])
        stream.on("data", (chunk) => {
          logs = (logs + chunk).slice(-4000);
        });
      await until(
        async () => {
          if (next.exitCode !== null) throw new Error(logs);
          return fetch(origin)
            .then((r) => r.ok)
            .catch(() => false);
        },
        "Next listo",
        30000,
      );
      browser = await chrome();
      const evaluate = (expression) => browser.evaluate(expression);
      const click = (selector) =>
        evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      const count = () =>
        evaluate("document.querySelector('[data-cart-count]')?.textContent");
      const go = async (path) => {
        await browser.navigate(`${origin}${path}`);
        await browser.wait(
          `location.pathname === ${JSON.stringify(path)} && document.readyState==='complete' && !document.querySelector('.session-notice')`,
          "página privada lista",
        );
      };
      const cartReady = () =>
        browser.wait(
          "!!document.querySelector('[data-cart-continue]:not(:disabled)') || document.body.innerText.includes('Tu carrito está vacío')",
          "carrito verificado",
        );
      const shopReady = async (id = shop.idTienda) => {
        await go(`/tiendas/${id}`);
        await browser.wait(
          "!!document.querySelector('[data-add-product]:not(:disabled)')",
          "productos y carrito listos",
        );
      };
      const add = async (product, quantity = "1") => {
        await browser.fill(
          `[data-product-id="${product.idProducto}"] input[type=number]`,
          quantity,
        );
        await click(`[data-add-product="${product.idProducto}"]`);
        await browser.wait(
          `document.querySelector('[data-product-id="${product.idProducto}"]').textContent.includes('Producto agregado')`,
          "producto agregado",
        );
      };
      const login = async (role = "CLIENTE") => {
        if (await evaluate("location.pathname !== '/login'"))
          await browser.navigate(`${origin}/login`);
        await browser.wait(
          "location.pathname==='/login' && document.readyState==='complete' && !!document.querySelector('#correo')",
          "login listo",
        );
        await waitForLoginHydration(browser);
        await browser.fill("#correo", accounts[role].correo);
        await browser.fill("#clave", password);
        await evaluate("document.querySelector('form').requestSubmit()");
        await browser.wait(
          `location.pathname==='${["CLIENTE", "OTRO"].includes(role) ? "/mercado" : "/cuenta"}' && !document.querySelector('.session-notice') && !!document.querySelector('.account-trigger')`,
          "identidad actual",
        );
        if (["CLIENTE", "OTRO"].includes(role))
          await browser.wait(
            "document.querySelector('[data-cart-count]')?.textContent === '0'",
            "carrito de sesión nueva",
          );
      };
      const reset = async () => {
        // This is the real logout endpoint/button, not an injected storage reset.
        await evaluate("document.querySelector('.account-trigger').click()");
        await click(".account-logout");
        await browser.wait(
          "location.pathname==='/login' && !!document.querySelector('#correo')",
          "logout",
        );
        await login();
      };
      const delivery = async () => {
        await browser.wait(
          "document.querySelectorAll('#neighborhood option').length>1",
          "barrios reales",
        );
        await evaluate(
          `(() => {const s=document.querySelector('#neighborhood');s.value='${area.idBarrio}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
        await browser.fill(
          "#delivery-address",
          "Dirección exclusiva de pruebas locales",
        );
        await browser.wait(
          "!!document.querySelector('[data-cart-continue]:not(:disabled)')",
          "confirmación habilitada",
        );
      };

      await t.test(
        "visitante: página protegida y revisión/sesión 401",
        async () => {
          for (const path of ["/carrito", "/carrito/confirmar"])
            assert.equal(
              (await fetch(`${origin}${path}`, { redirect: "manual" })).status,
              307,
            );
          assert.equal((await fetch(`${origin}/api/cart/session`)).status, 401);
          assert.equal(
            (
              await fetch(`${origin}/api/cart/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  idTienda: shop.idTienda,
                  items: [{ idProducto: p1.idProducto, cantidad: 1 }],
                }),
              })
            ).status,
            401,
          );
          await browser.navigate(`${origin}/carrito`);
          await browser.wait(
            "location.pathname==='/login' && !!document.querySelector('#correo')",
            "sin sesión en login",
          );
        },
      );
      await t.test(
        "CLIENTE: carrito vacío y cookie de aislamiento HttpOnly",
        async () => {
          await login();
          await go("/carrito");
          await cartReady();
          assert.ok(
            await evaluate(
              "document.body.innerText.includes('Tu carrito está vacío')",
            ),
          );
          assert.equal(
            await evaluate("document.cookie.includes('chorotega_')"),
            false,
          );
          const stored = await evaluate(
            "JSON.parse(sessionStorage.getItem('chorotega.cart.v1'))",
          );
          assert.match(stored.scope, /^[a-f0-9]{64}$/);
          assert.deepEqual(stored.items, []);
          assert.doesNotMatch(
            JSON.stringify(stored),
            /clave|correo|Bearer|eyJ/,
          );
        },
      );
      await t.test(
        "agrega varios productos, valida cantidades y nunca ofrece agotados",
        async () => {
          await shopReady();
          assert.equal(
            await evaluate(
              `!!document.querySelector('[data-add-product="${zero.idProducto}"]')`,
            ),
            false,
          );
          for (const invalid of ["0", "-1", "1.5", "11"]) {
            await browser.fill(
              `[data-product-id="${p1.idProducto}"] input`,
              invalid,
            );
            await click(`[data-add-product="${p1.idProducto}"]`);
            assert.equal(await count(), "0");
          }
          await add(p1, "2");
          await add(p2, "3");
          assert.equal(await count(), "5");
          await click('a[href="/carrito"]');
          await browser.wait("location.pathname==='/carrito'", "abrir carrito");
          await cartReady();
          assert.equal(
            await evaluate(
              "document.querySelectorAll('[data-cart-product]').length",
            ),
            2,
          );
          assert.ok(
            await evaluate("document.body.innerText.includes('21,09')"),
          );
        },
      );
      await t.test(
        "recarga, navegación, cantidades y eliminar conservan importes exactos",
        async () => {
          await browser.call("Page.reload");
          await cartReady();
          assert.equal(await count(), "5");
          await click(`[aria-label="Aumentar ${p1.nombre}"]`);
          assert.equal(await count(), "6");
          await click(`[aria-label="Disminuir ${p1.nombre}"]`);
          assert.equal(await count(), "5");
          await click(`[aria-label="Eliminar ${p2.nombre}"]`);
          await cartReady();
          assert.equal(await count(), "2");
          await shopReady();
          await add(p2, "3");
          await go("/carrito");
          await cartReady();
          assert.equal(await count(), "5");
        },
      );
      await t.test(
        "otra tienda: cancelar preserva y reemplazar requiere confirmación explícita",
        async () => {
          await shopReady(other.idTienda);
          await click(`[data-add-product="${p3.idProducto}"]`);
          await browser.wait(
            "!!document.querySelector('[aria-label=\"Cambiar emprendimiento\"]')",
            "decisión de tienda",
          );
          await evaluate(
            "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Conservar carrito').click()",
          );
          assert.equal(await count(), "5");
          await click(`[data-add-product="${p3.idProducto}"]`);
          await evaluate(
            "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Reemplazar carrito y agregar').click()",
          );
          assert.equal(await count(), "1");
          await go("/carrito");
          await cartReady();
          assert.equal(
            await evaluate(
              `!!document.querySelector('[data-cart-product="${p3.idProducto}"]')`,
            ),
            true,
          );
          await reset();
          await shopReady();
          await add(p1, "2");
          await add(p2, "3");
          await go("/carrito");
          await cartReady();
        },
      );
      await t.test(
        "precios y stock cambiados se muestran y bloquean hasta revisión",
        async () => {
          await products.update(p1.idProducto, {
            precio: "11.13",
            cantidadDisponible: 1,
          });
          await browser.call("Page.reload");
          await browser.wait(
            "document.body.innerText.includes('Revisá los cambios')",
            "cambio visible",
          );
          assert.equal(
            await evaluate(
              "document.querySelector('[data-cart-continue]').disabled",
            ),
            true,
          );
          assert.equal(await orders.count(), 0);
          await evaluate(
            "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Aplicar cambios de precio')).click()",
          );
          await cartReady();
          assert.equal(await count(), "4");
          assert.ok(
            await evaluate("document.body.innerText.includes('12,00')"),
          );
          await products.update(p1.idProducto, {
            precio: "10.11",
            cantidadDisponible: 10,
          });
          await reset();
          await shopReady();
          await add(p1, "2");
          await add(p2, "3");
          await go("/carrito");
          await cartReady();
        },
      );
      await t.test(
        "producto desactivado se retira solo después de aplicar cambios",
        async () => {
          await products.update(p2.idProducto, { estado: "INACTIVO" });
          await browser.call("Page.reload");
          await browser.wait(
            "document.body.innerText.includes('ya no está disponible')",
            "producto inactivo",
          );
          assert.equal(await count(), "5");
          await evaluate(
            "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Aplicar cambios de precio')).click()",
          );
          await cartReady();
          assert.equal(await count(), "2");
          await products.update(p2.idProducto, { estado: "ACTIVO" });
          await shopReady();
          await add(p2, "3");
          await go("/carrito");
          await cartReady();
        },
      );
      await t.test(
        "error de consulta seguro, reintento y tienda desactivada bloquean compra",
        async () => {
          try {
            service.findById = async () => {
              throw new Error("private-query-marker");
            };
            await browser.call("Page.reload");
            await browser.wait(
              "document.body.innerText.includes('No se pudo verificar la disponibilidad')",
              "error seguro",
            );
            assert.equal(
              await evaluate(
                "document.body.textContent.includes('private-query-marker')",
              ),
              false,
            );
          } finally {
            service.findById = originalFind;
          }
          await evaluate(
            "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Revisar disponibilidad').click()",
          );
          await cartReady();
          await stores.update(shop.idTienda, { estado: "INACTIVA" });
          await browser.call("Page.reload");
          await browser.wait(
            "document.body.innerText.includes('No se pudo verificar la disponibilidad')",
            "tienda inactiva",
          );
          assert.equal(
            await evaluate(
              "document.querySelector('[data-cart-continue]').disabled",
            ),
            true,
          );
          await stores.update(shop.idTienda, { estado: "ACTIVA" });
          await evaluate(
            "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Revisar disponibilidad').click()",
          );
          await cartReady();
        },
      );
      const evidence = join(tmpdir(), "chorotega-cart-evidence");
      await mkdir(evidence, { recursive: true });
      for (const width of [320, 390, 768, 1280, 1440])
        await t.test(
          `carrito responsive ${width}px sin overflow y datos reales`,
          async () => {
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 1000,
              deviceScaleFactor: 1,
              mobile: false,
            });
            const geometry = await evaluate(
              "({width:innerWidth,scroll:document.documentElement.scrollWidth,items:document.querySelectorAll('[data-cart-product]').length,broken:Array.from(document.images).filter(i=>!i.complete||!i.naturalWidth).length})",
            );
            assert.ok(geometry.scroll <= width, JSON.stringify(geometry));
            assert.equal(geometry.items, 2);
            assert.equal(geometry.broken, 0);
            const metrics = await browser.call("Page.getLayoutMetrics");
            const shot = await browser.call("Page.captureScreenshot", {
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
              join(evidence, `carrito-${width}.png`),
              Buffer.from(shot.data, "base64"),
            );
          },
        );
      await t.test(
        "confirmación recibe productos sin reselección y conserva dirección al detectar cambios",
        async () => {
          await click("[data-cart-continue]");
          await browser.wait(
            "location.pathname==='/carrito/confirmar' && !!document.querySelector('#delivery-address')",
            "confirmación",
          );
          assert.equal(
            await evaluate(
              "document.querySelectorAll('input[name=store]').length",
            ),
            0,
          );
          await delivery();
          await products.update(p1.idProducto, { precio: "10.12" });
          await click("[data-cart-continue]");
          await browser.wait(
            "document.body.innerText.includes('Revisá los cambios')",
            "revisión antes del POST",
          );
          assert.equal(await orders.count(), 0);
          assert.equal(
            await evaluate("document.querySelector('#delivery-address').value"),
            "Dirección exclusiva de pruebas locales",
          );
          await evaluate(
            "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Aplicar cambios de precio')).click()",
          );
          await browser.wait(
            "!!document.querySelector('[data-cart-continue]:not(:disabled)')",
            "cambios revisados",
          );
        },
      );
      await t.test(
        "doble clic crea un solo pedido real, total exacto y descuento de inventario",
        async () => {
          await evaluate(
            "window.checkoutFetch=window.fetch;window.postCount=0;window.fetch=(url,options)=>{if(url==='/api/orders'&&options?.method==='POST')window.postCount++;return window.checkoutFetch(url,options);}",
          );
          try {
            await evaluate(
              "(()=>{const b=document.querySelector('[data-cart-continue]');b.click();b.click();})()",
            );
            await browser.wait(
              "document.body.innerText.includes('¡Tu pedido se creó con éxito!')",
              "confirmación inequívoca",
            );
            assert.equal(await evaluate("window.postCount"), 1);
            const created = await orders.find();
            assert.equal(created.length, 1);
            assert.equal(created[0].total, "521.16");
            assert.equal(
              (await products.findOneByOrFail({ idProducto: p1.idProducto }))
                .cantidadDisponible,
              8,
            );
            assert.equal(
              (await products.findOneByOrFail({ idProducto: p2.idProducto }))
                .cantidadDisponible,
              2,
            );
            assert.equal(await count(), "0");
          } finally {
            await evaluate(
              "window.fetch=window.checkoutFetch;delete window.checkoutFetch;delete window.postCount",
            );
          }
          await browser.call("Page.reload");
          await browser.wait(
            "document.body.innerText.includes('El carrito quedó vacío')",
            "recarga posterior",
          );
          assert.equal(await orders.count(), 1);
        },
      );
      await t.test(
        "respuesta perdida después del commit conserva carrito bloqueado y no duplica al recargar",
        async () => {
          await reset();
          await shopReady();
          await add(p1, "1");
          await go("/carrito/confirmar");
          await delivery();
          await evaluate(
            "window.checkoutFetch=window.fetch;window.checkoutResponseStatus=null;window.fetch=async(url,options)=>{const r=await window.checkoutFetch(url,options);if(url==='/api/orders'&&options?.method==='POST'){window.checkoutResponseStatus=r.status;throw new TypeError('Synthetic local response loss');}return r;}",
          );
          await click("[data-cart-continue]");
          await browser.wait(
            "document.body.innerText.includes('Resultado de compra pendiente')",
            "resultado ambiguo bloqueado",
          );
          // The pending heading also appears while the POST is still in flight.
          // Wait for the real creation response before asserting its committed rows.
          await browser.wait(
            "window.checkoutResponseStatus === 201",
            "POST real confirmado antes de simular la respuesta perdida",
          );
          assert.equal(await orders.count(), 2);
          assert.equal(await count(), "1");
          await browser.call("Page.reload");
          await browser.wait(
            "document.body.innerText.includes('Resultado de compra pendiente')",
            "recarga no reintenta",
          );
          assert.equal(await orders.count(), 2);
          assert.equal(
            await evaluate("!!document.querySelector('[data-cart-continue]')"),
            false,
          );
        },
      );
      await t.test(
        "logout, cambio de cuenta y nuevo login de la misma identidad no recuperan carrito anterior",
        async () => {
          await reset();
          await shopReady();
          await add(p1, "1");
          await evaluate("document.querySelector('.account-trigger').click()");
          await click(".account-logout");
          await browser.wait("location.pathname==='/login'", "sesión cerrada");
          assert.equal(
            await evaluate("sessionStorage.getItem('chorotega.cart.v1')"),
            null,
          );
          await login("OTRO");
          await go("/carrito");
          await cartReady();
          assert.equal(await count(), "0");
          await shopReady();
          await add(p1, "1");
          await evaluate(
            `fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(accounts.OTRO.correo)},clave:${JSON.stringify(password)}})}).then(r=>r.status)`,
          );
          await go("/carrito");
          await cartReady();
          assert.equal(await count(), "0");
        },
      );
      await t.test(
        "roles prohibidos no tienen carrito ni autorización BFF",
        async () => {
          for (const role of ["ADMIN", "EMPRENDEDOR", "REPARTIDOR"]) {
            await login(role);
            await browser.navigate(`${origin}/carrito`);
            await browser.wait(
              "location.pathname==='/cuenta' && !document.querySelector('.session-notice')",
              "rol rechazado",
            );
            assert.equal(
              await evaluate("fetch('/api/cart/session').then(r=>r.status)"),
              403,
            );
            assert.equal(
              await evaluate(
                `fetch('/api/cart/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idTienda:${shop.idTienda},items:[{idProducto:${p1.idProducto},cantidad:1}]})}).then(r=>r.status)`,
              ),
              403,
            );
          }
        },
      );
      await t.test(
        "sesión inválida no expone ni permite confirmar el carrito",
        async () => {
          await login();
          await shopReady();
          await add(p1, "1");
          await browser.call("Network.setCookie", {
            name: "chorotega_session",
            value: "invalid-local-token",
            url: origin,
            httpOnly: true,
            sameSite: "Lax",
          });
          await browser.navigate(`${origin}/carrito`);
          await browser.wait(
            "location.pathname==='/login' && !!document.querySelector('#correo')",
            "sesión vencida",
          );
          assert.equal(
            await evaluate(
              "document.querySelectorAll('[data-cart-product]').length",
            ),
            0,
          );
        },
      );
      t.diagnostic(`Capturas exclusivas de fixtures: ${evidence}`);
    } finally {
      try {
        await browser?.close();
      } finally {
        if (next && next.exitCode === null) {
          next.kill("SIGTERM");
          await new Promise((resolve) => next.once("exit", resolve));
        }
        try {
          await context?.close();
        } finally {
          if (oldSecret === undefined) delete process.env.JWT_SECRET;
          else process.env.JWT_SECRET = oldSecret;
        }
      }
    }
  },
);
