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
const { ProductsModule } = backendRequire(
  "./src/modules/products/products.module.ts",
);
const { OrdersHttpModule } = backendRequire(
  "./src/modules/orders/orders-http.module.ts",
);
const { NeighborhoodsModule } = backendRequire(
  "./src/modules/neighborhoods/neighborhoods.module.ts",
);
const { ProductsService } = backendRequire(
  "./src/modules/products/products.service.ts",
);
const { StoresService } = backendRequire(
  "./src/modules/stores/services/stores.service.ts",
);
const { User } = backendRequire("./src/modules/users/entities/user.entity.ts");
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
const { Order } = backendRequire(
  "./src/modules/orders/entities/order.entity.ts",
);
const { JwtService } = backendRequire("@nestjs/jwt");
const bcrypt = backendRequire("bcrypt");

test(
  "Detalle de tienda: Chrome → Next.js → NestJS → PostgreSQL temporal",
  { timeout: 240000 },
  async (t) => {
    let context, next, browser, release;
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const password = "Clave exclusiva de prueba 123!";
    try {
      context = await createHttpTestApp([
        AuthModule,
        StoresModule,
        ProductsModule,
        OrdersHttpModule,
        NeighborhoodsModule,
      ]);
      await context.app.listen(0, "127.0.0.1");
      const apiOrigin = await context.app.getUrl();
      const ds = context.database.dataSource;
      const users = ds.getRepository(User);
      const hash = await bcrypt.hash(password, 4);
      const accounts = {};
      for (const rol of ["CLIENTE", "EMPRENDEDOR", "REPARTIDOR", "ADMIN"])
        accounts[rol] = await users.save({
          authId: randomUUID(),
          nombre: "Persona",
          apellido: "Temporal",
          correo: `${rol.toLowerCase()}@example.test`,
          rol,
          estado: "ACTIVO",
          claveHash: hash,
        });
      const stores = ds.getRepository(Store);
      const shop = await stores.save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Taller de Nicoya",
        descripcion: "Creaciones locales · descripción de prueba temporal.",
        direccion: "Nicoya · dirección de prueba",
        telefono: "88888888",
        horario: "Lunes a viernes · horario de prueba",
        estado: "ACTIVA",
      });
      const empty = await stores.save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Tienda <script>texto</script>",
        direccion: "Nicoya",
        estado: "ACTIVA",
      });
      const inactive = await stores.save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Tienda inactiva",
        direccion: "Nicoya",
        estado: "INACTIVA",
      });
      const category = await ds
        .getRepository(Category)
        .save({ nombre: "Categoría temporal", estado: "ACTIVA" });
      const products = ds.getRepository(Product);
      const saved = [];
      const names = [
        "Aroma",
        "Barro",
        "Cerámica",
        "Diseño",
        "Estrella",
        "Flor",
        "Grano",
        "Hoja",
      ];
      const prices = [
        "10000.11",
        "2000.12",
        "90.99",
        "15000.00",
        "1.05",
        "543.21",
        "99999999.99",
        "2000.12",
      ];
      for (let i = 0; i < names.length; i++)
        saved.push(
          await products.save({
            idTienda: shop.idTienda,
            idCategoria: category.idCategoria,
            nombre: names[i],
            descripcion:
              i === 0
                ? "<img src=x onerror=alert(1)>"
                : i === 1
                  ? null
                  : "Producto de prueba temporal",
            precio: prices[i],
            cantidadDisponible: i === 0 ? 0 : 10,
            estado: "ACTIVO",
          }),
        );
      for (const estado of ["INACTIVO", "AGOTADO"])
        await products.save({
          idTienda: shop.idTienda,
          idCategoria: category.idCategoria,
          nombre: `Oculto ${estado}`,
          precio: "1.00",
          cantidadDisponible: 0,
          estado,
        });
      await products.save({
        idTienda: inactive.idTienda,
        idCategoria: category.idCategoria,
        nombre: "Otro negocio",
        precio: "1.00",
        cantidadDisponible: 10,
        estado: "ACTIVO",
      });
      const neighborhood = await ds.getRepository(Neighborhood).save({
        nombre: "Barrio temporal",
        tarifaEnvio: "500.00",
        estado: "ACTIVO",
      });
      const service = context.app.get(ProductsService);
      const originalSearch = service.search.bind(service);
      const storesService = context.app.get(StoresService);
      const originalFind = storesService.findById.bind(storesService);
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
          "!!document.querySelector('#shop-products[aria-busy=\"false\"]') && !document.querySelector('.session-notice')",
          "productos listos",
        );
      const openShop = async (id = shop.idTienda) => {
        await browser.navigate(`${origin}/tiendas/${id}`);
        await settled();
      };
      const titleList = () =>
        browser.evaluate(
          "Array.from(document.querySelectorAll('[data-product-id] h3'), e => e.textContent)",
        );
      const sort = async (value) => {
        await browser.evaluate(
          `(() => {const select=document.querySelector('#product-sort');select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
        await settled();
      };
      const login = async (role = "CLIENTE") => {
        // Reuse an already loaded login page; navigating to the same path can
        // otherwise match its old DOM before the new document replaces it.
        if (await browser.evaluate("location.pathname !== '/login'"))
          await browser.navigate(`${origin}/login`);
        await browser.wait(
          "location.pathname === '/login' && document.readyState === 'complete' && !!document.querySelector('#correo')",
          "login",
        );
        await browser.fill("#correo", accounts[role].correo);
        await browser.fill("#clave", password);
        await browser.evaluate(
          "document.querySelector('form').requestSubmit()",
        );
        await browser.wait(
          `location.pathname === '${role === "CLIENTE" ? "/mercado" : "/cuenta"}' && !!document.querySelector('.account-trigger') && !document.querySelector('.session-notice')`,
          "destino por rol",
        );
      };

      await t.test(
        "sin sesión: página protegida y ambos intermediarios devuelven 401",
        async () => {
          const response = await fetch(`${origin}/tiendas/${shop.idTienda}`, {
            redirect: "manual",
          });
          assert.equal(response.status, 307);
          assert.match(
            response.headers.get("location"),
            /\/api\/auth\/session/,
          );
          for (const path of [
            `/api/stores/${shop.idTienda}`,
            `/api/stores/${shop.idTienda}/products`,
          ]) {
            const api = await fetch(`${origin}${path}`);
            assert.equal(api.status, 401);
            assert.equal((await api.json()).content, undefined);
          }
          await browser.navigate(`${origin}/tiendas/${shop.idTienda}`);
          await browser.wait(
            "location.pathname === '/login' && !!document.querySelector('#correo')",
            "visitante en login",
          );
        },
      );
      await t.test(
        "CLIENTE entra al mercado y Ver tienda carga datos reales y encabezado compartido",
        async () => {
          await login();
          await browser.wait(
            `!!document.querySelector('[data-store-id="${shop.idTienda}"] a')`,
            "tarjeta real",
          );
          await click(`[data-store-id="${shop.idTienda}"] a`);
          await settled();
          assert.equal(
            await browser.evaluate("location.pathname"),
            `/tiendas/${shop.idTienda}`,
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#shop-title').textContent",
            ),
            shop.nombre,
          );
          const text = await browser.evaluate("document.body.innerText");
          for (const value of [
            shop.descripcion,
            shop.direccion,
            shop.telefono,
            shop.horario,
            "Sin fotografía de la tienda",
          ])
            assert.ok(text.includes(value), value);
          assert.equal(
            await browser.evaluate(
              "document.querySelector('section[aria-labelledby=\"shop-title\"] p').textContent",
            ),
            "Tienda activa",
          );
          assert.deepEqual(
            await browser.evaluate(
              "Array.from(document.querySelectorAll('nav[aria-label=\"Navegación del mercado\"] a'), a => a.getAttribute('href'))",
            ),
            ["/mercado"],
          );
          await click(".account-trigger");
          assert.equal(
            await browser.evaluate(
              "document.querySelector('.account-dropdown a[href=\"/pedidos\"]').textContent.trim()",
            ),
            "Mis pedidos",
          );
          await click(".account-trigger");
          assert.equal(
            await browser.evaluate(
              "document.cookie.includes('chorotega_session')",
            ),
            false,
          );
        },
      );
      assert.equal(
        await browser.evaluate("location.pathname"),
        `/tiendas/${shop.idTienda}`,
        "La preparación debe completar el login antes de verificar el catálogo",
      );
      await t.test(
        "productos de esa tienda, precio exacto, stock cero y XSS escapado",
        async () => {
          assert.deepEqual(await titleList(), names.slice(0, 6));
          const text = await browser.evaluate(
            "document.querySelector('#shop-products').innerText",
          );
          assert.ok(text.includes("8 productos"));
          assert.ok(!text.includes("Oculto") && !text.includes("Otro negocio"));
          assert.equal(
            await browser.evaluate(
              `document.querySelector('[data-product-id="${saved[0].idProducto}"] a') !== null`,
            ),
            false,
          );
          assert.ok(
            await browser.evaluate(
              `document.querySelector('[data-product-id="${saved[0].idProducto}"]').innerText.includes('Sin existencias')`,
            ),
          );
          assert.ok(
            await browser.evaluate(
              `document.querySelector('[data-product-id="${saved[1].idProducto}"]').innerText.includes('Sin descripción del producto')`,
            ),
          );
          assert.equal(
            await browser.evaluate("!!document.querySelector('[onerror]')"),
            false,
          );
          assert.ok(
            await browser.evaluate(
              `document.querySelector('[data-product-id="${saved[1].idProducto}"]').innerText.includes('2 000,12')`,
            ),
          );
        },
      );
      await t.test(
        "paginación SQL y regreso conservan ámbito por tienda",
        async () => {
          await click(
            'nav[aria-label="Páginas de productos"] button:last-child',
          );
          await settled();
          assert.deepEqual(await titleList(), names.slice(6));
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('Página 2 de 2')",
            ),
          );
          await click(
            'nav[aria-label="Páginas de productos"] button:first-child',
          );
          await settled();
          assert.deepEqual(await titleList(), names.slice(0, 6));
        },
      );
      await t.test(
        "orden por precio ASC/DESC, identificador y desempate reales",
        async () => {
          await sort("precio-ASC");
          assert.deepEqual(await titleList(), [
            "Estrella",
            "Cerámica",
            "Flor",
            "Barro",
            "Hoja",
            "Aroma",
          ]);
          await sort("precio-DESC");
          assert.deepEqual((await titleList()).slice(0, 4), [
            "Grano",
            "Diseño",
            "Aroma",
            "Hoja",
          ]);
          await sort("idProducto-DESC");
          assert.deepEqual(
            await titleList(),
            names.slice().reverse().slice(0, 6),
          );
          await sort("nombre-ASC");
        },
      );
      await t.test(
        "filtro de existencias se ejecuta en PostgreSQL y reinicia página",
        async () => {
          await click(
            'nav[aria-label="Páginas de productos"] button:last-child',
          );
          await settled();
          await click("#available-products");
          await settled();
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('7 productos') && document.body.innerText.includes('Página 1 de 2')",
            ),
          );
          assert.deepEqual(await titleList(), names.slice(1, 7));
          await click("#available-products");
          await settled();
          assert.deepEqual(await titleList(), names.slice(0, 6));
        },
      );
      await t.test(
        "tienda vacía, campos opcionales ausentes y texto HTML seguro",
        async () => {
          await openShop(empty.idTienda);
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('No hay productos para mostrar')",
            ),
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#shop-title').textContent",
            ),
            empty.nombre,
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelectorAll('script').length > 0 && !!document.querySelector('#shop-title script')",
            ),
            false,
          );
          const text = await browser.evaluate("document.body.innerText");
          assert.ok(!text.includes("Teléfono") && !text.includes("Horario"));
          await openShop();
        },
      );
      await t.test(
        "ID inválido 400, tienda inexistente/inactiva 404 y sin productos expuestos",
        async () => {
          for (const id of ["0", "-1", "abc", "2147483648"]) {
            assert.equal(
              await browser.evaluate(
                `fetch('/api/stores/${id}').then(r => r.status)`,
              ),
              400,
            );
            await browser.navigate(`${origin}/tiendas/${id}`);
            await browser.wait(
              "!!document.querySelector('[data-store-error=\"400\"]')",
              "identificador inválido visible",
            );
          }
          for (const id of [999999, inactive.idTienda]) {
            assert.equal(
              await browser.evaluate(
                `fetch('/api/stores/${id}').then(r => r.status)`,
              ),
              404,
            );
            assert.equal(
              await browser.evaluate(
                `fetch('/api/stores/${id}/products').then(r => r.status)`,
              ),
              404,
            );
            await browser.navigate(`${origin}/tiendas/${id}`);
            await browser.wait(
              "!!document.querySelector('[data-store-error=\"404\"]')",
              "tienda no disponible visible",
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelectorAll('[data-product-id]').length",
              ),
              0,
            );
          }
          await openShop();
        },
      );
      await t.test(
        "tienda desactivada durante la visita retira datos y productos",
        async () => {
          await stores.update(shop.idTienda, { estado: "INACTIVA" });
          try {
            await browser.evaluate(
              "(() => {const select=document.querySelector('#product-sort'); select.value='precio-DESC'; select.dispatchEvent(new Event('change',{bubbles:true}));})()",
            );
            await browser.wait(
              "!!document.querySelector('[data-store-error=\"404\"]')",
              "tienda desactivada",
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelector('#shop-title') === null && document.querySelectorAll('[data-product-id]').length === 0",
              ),
              true,
            );
          } finally {
            await stores.update(shop.idTienda, { estado: "ACTIVA" });
          }
          await openShop();
        },
      );
      await t.test(
        "no admite cambiar tienda o columnas por query y conserva defaults de compra",
        async () => {
          for (const query of [
            `idTienda=${inactive.idTienda}`,
            "sortBy=claveHash",
            "sortDirection=DROP",
            "nombre=Aroma",
            "soloDisponibles=yes",
          ])
            assert.equal(
              await browser.evaluate(
                `fetch('/api/stores/${shop.idTienda}/products?${query}').then(r => r.status)`,
              ),
              400,
            );
          const body = await browser.evaluate(
            `fetch('/api/products?idTienda=${shop.idTienda}').then(r => r.json())`,
          );
          assert.equal(body.size, 20);
          assert.equal(body.totalElements, 7);
          assert.ok(
            body.content.every(
              (product) =>
                product.estado === "ACTIVO" && product.cantidadDisponible > 0,
            ),
          );
        },
      );
      await t.test(
        "errores de tienda y productos seguros; reintento conserva sesión",
        async () => {
          try {
            storesService.findById = async () => {
              throw new Error("private-store-sql");
            };
            await browser.navigate(`${origin}/tiendas/${shop.idTienda}`);
            await browser.wait(
              "!!document.querySelector('[data-store-error]')",
              "error de tienda",
            );
            assert.equal(
              await browser.evaluate(
                "document.body.innerText.includes('private-store-sql')",
              ),
              false,
            );
          } finally {
            storesService.findById = originalFind;
          }
          await click("[data-store-error] button");
          await settled();
          try {
            service.search = async () => {
              throw new Error("private-product-sql");
            };
            await sort("precio-ASC");
            await browser.wait(
              "!!document.querySelector('#shop-products [role=alert]')",
              "error de productos",
            );
            assert.equal(
              await browser.evaluate(
                "document.body.innerText.includes('private-product-sql')",
              ),
              false,
            );
          } finally {
            service.search = originalSearch;
          }
          await click("#shop-products [role=alert] button");
          await browser.wait(
            "!!document.querySelector('[data-product-id]') && !document.querySelector('#shop-products [role=alert]')",
            "reintento real",
          );
          assert.equal(
            await browser.evaluate("location.pathname"),
            `/tiendas/${shop.idTienda}`,
          );
        },
      );
      await t.test(
        "carga y respuesta anterior cancelada no sobrescriben el orden vigente",
        async () => {
          await openShop();
          let started = false,
            finish;
          const done = new Promise((resolve) => {
            finish = resolve;
          });
          const waiting = new Promise((resolve) => {
            release = resolve;
          });
          service.search = async (query) => {
            if (query.sortBy === "precio" && query.sortDirection === "ASC") {
              started = true;
              await waiting;
              try {
                return await originalSearch(query);
              } finally {
                finish();
              }
            }
            return originalSearch(query);
          };
          try {
            await browser.evaluate(
              "(() => {const select=document.querySelector('#product-sort');select.value='precio-ASC';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
            );
            await browser.wait(
              "document.querySelector('#shop-products').getAttribute('aria-busy') === 'true'",
              "loading",
            );
            await until(() => started, "consulta antigua en NestJS");
            await sort("nombre-DESC");
            assert.deepEqual(
              await titleList(),
              names.slice().reverse().slice(0, 6),
            );
            release();
            await done;
            assert.deepEqual(
              await titleList(),
              names.slice().reverse().slice(0, 6),
            );
          } finally {
            release();
            release = undefined;
            service.search = originalSearch;
          }
          await sort("nombre-ASC");
        },
      );

      const evidence = join(tmpdir(), "chorotega-store-detail-evidence");
      await mkdir(evidence, { recursive: true });
      for (const width of [320, 390, 768, 1280, 1440])
        await t.test(
          `detalle responsive ${width}px, fuentes y placeholders identificados`,
          async () => {
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 1000,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await browser.evaluate("document.fonts.ready");
            await browser.wait(
              "Array.from(document.images).every(image => image.complete && image.naturalWidth > 0)",
              "recursos cargados",
            );
            const geometry = await browser.evaluate(
              `(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, columns: getComputedStyle(document.querySelector('[data-product-id]').parentElement).gridTemplateColumns, font: getComputedStyle(document.querySelector('#shop-title')).fontFamily, photoCenterDelta: (() => {const hero=document.querySelector('section[aria-labelledby=shop-title]').getBoundingClientRect();const photo=document.querySelector('section[aria-labelledby=shop-title] > div').getBoundingClientRect();return Math.abs((hero.left+hero.right-photo.left-photo.right)/2);})(), broken: Array.from(document.images).filter(image => !image.naturalWidth).length, unavailable: document.body.innerText.includes('Sin fotografía de la tienda') && document.body.innerText.includes('Sin fotografía del producto'), fakePhotos: Array.from(document.images).some(image => image.src.includes('local-crafts')) }))()`,
            );
            assert.ok(geometry.scroll <= width, JSON.stringify(geometry));
            assert.equal(geometry.broken, 0);
            assert.equal(geometry.fakePhotos, false);
            assert.equal(geometry.unavailable, true);
            assert.ok(geometry.font.includes("LandingSerif"));
            if (width <= 768)
              assert.ok(
                geometry.photoCenterDelta <= 1,
                "presentación sin fotografía centrada",
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
              join(evidence, `tienda-${width}.png`),
              Buffer.from(capture.data, "base64"),
            );
            await writeFile(
              join(evidence, `tienda-${width}.json`),
              JSON.stringify(geometry, null, 2),
            );
          },
        );
      await t.test(
        "volver al mercado mantiene navegación aprobada y compra real conserva stock y total",
        async () => {
          await click('nav[aria-label="Ubicación"] a');
          await browser.wait(
            "location.pathname === '/mercado' && !!document.querySelector('[data-store-id] a')",
            "volver al mercado",
          );
          await click(`[data-store-id="${shop.idTienda}"] a`);
          await settled();
          await click(`[data-product-id="${saved[1].idProducto}"] a`);
          await browser.wait(
            "location.pathname === '/pedidos/nuevo' && !!document.querySelector('input[name=store]') && !document.querySelector('.session-notice')",
            "formulario existente",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelectorAll('input[name=store]:checked').length",
            ),
            0,
          );
          await click(`input[name=store][value="${shop.idTienda}"]`);
          await browser.wait(
            "!!document.querySelector('.create-order-product-card input')",
            "productos de compra",
          );
          await browser.evaluate(
            `(() => {const input=Array.from(document.querySelectorAll('.create-order-product-card')).find(card=>card.querySelector('h3').textContent===${JSON.stringify(saved[1].nombre)}).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
          );
          await browser.wait(
            "document.querySelectorAll('#neighborhood option').length > 1",
            "barrios",
          );
          await browser.evaluate(
            `(() => {const select=document.querySelector('#neighborhood');select.value='${neighborhood.idBarrio}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
          );
          await browser.fill(
            "#delivery-address",
            "Dirección exclusiva de prueba local",
          );
          await browser.evaluate(
            "Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Confirmar pedido')).click()",
          );
          await browser.wait(
            "!!document.querySelector('[role=dialog]')",
            "pedido confirmado",
          );
          const orders = await ds.getRepository(Order).find();
          assert.equal(orders.length, 1);
          assert.equal(orders[0].idTienda, shop.idTienda);
          assert.equal(orders[0].total, "4500.24");
          assert.equal(
            (
              await products.findOneByOrFail({
                idProducto: saved[1].idProducto,
              })
            ).cantidadDisponible,
            8,
          );
          await browser.evaluate(
            "document.querySelector('[role=dialog] button').click()",
          );
          await browser.wait(
            "location.pathname === '/pedidos' && !!document.querySelector('.order-card')",
            "pedido visible",
          );
        },
      );
      await t.test(
        "JWT inválido o vencido y sesión revocada no exponen detalle",
        async () => {
          const expired = await context.app
            .get(JwtService)
            .signAsync(
              { sub: accounts.CLIENTE.idUsuario, rol: "CLIENTE" },
              { expiresIn: -1 },
            );
          for (const token of ["invalid-local-token", expired]) {
            await browser.call("Network.setCookie", {
              name: "chorotega_session",
              value: token,
              url: origin,
              httpOnly: true,
              sameSite: "Lax",
            });
            assert.equal(
              await browser.evaluate(
                `fetch('/api/stores/${shop.idTienda}').then(r => r.status)`,
              ),
              401,
            );
            await browser.navigate(`${origin}/tiendas/${shop.idTienda}`);
            await browser.wait(
              "location.pathname === '/login' && !!document.querySelector('#correo')",
              "sesión inválida",
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelectorAll('[data-product-id]').length",
              ),
              0,
            );
          }
          await login();
          await openShop();
          await users.update(accounts.CLIENTE.idUsuario, {
            estado: "INACTIVO",
          });
          try {
            await browser.evaluate(
              "(() => {const select=document.querySelector('#product-sort');select.value='precio-ASC';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
            );
            await browser.wait(
              "location.pathname === '/login' && !!document.querySelector('#correo')",
              "revocación durante consulta",
            );
          } finally {
            await users.update(accounts.CLIENTE.idUsuario, {
              estado: "ACTIVO",
            });
          }
        },
      );
      await t.test(
        "otros roles leen sin compra; dropdown y logout se conservan",
        async () => {
          for (const role of ["ADMIN", "EMPRENDEDOR", "REPARTIDOR"]) {
            await login(role);
            await openShop();
            assert.equal((await titleList()).length, 6);
            assert.equal(
              await browser.evaluate(
                "document.querySelectorAll('#shop-products a[href=\"/pedidos/nuevo\"]').length",
              ),
              0,
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelector('nav[aria-label=\"Navegación del mercado\"]').innerText.includes('Mis pedidos')",
              ),
              false,
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
      t.diagnostic(`Capturas exclusivas de pruebas: ${evidence}`);
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
