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
const { ProductsService } = backend(
  "./src/modules/products/products.service.ts",
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
const evidence = "/private/tmp/chorotega-phase7-product-evidence";

test(
  "Gestión de productos: Chrome → Next → Nest → PostgreSQL temporal",
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
      const users = ds.getRepository(User),
        stores = ds.getRepository(Store),
        products = ds.getRepository(Product),
        categories = ds.getRepository(Category);
      const accounts = {},
        tokens = {};
      for (const [key, rol] of Object.entries({
        owner: "EMPRENDEDOR",
        other: "EMPRENDEDOR",
        CLIENTE: "CLIENTE",
        ADMIN: "ADMIN",
        REPARTIDOR: "REPARTIDOR",
      })) {
        accounts[key] = await users.save({
          authId: randomUUID(),
          nombre: "Persona",
          apellido: "Temporal",
          correo: `${key}@example.test`,
          rol,
          estado: "ACTIVO",
          claveHash: await bcrypt.hash(password, 4),
        });
        const response = await fetch(`${apiOrigin}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correo: accounts[key].correo,
            clave: password,
          }),
        });
        assert.equal(response.status, 201);
        tokens[key] = (await response.json()).token;
      }
      const own = await stores.save({
        idEmprendedor: accounts.owner.idUsuario,
        nombre: "Tienda de prueba",
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
      const active = await categories.save({
        nombre: "Categoría de prueba",
        estado: "ACTIVA",
      });
      const alternative = await categories.save({
        nombre: "Segunda categoría",
        estado: "ACTIVA",
      });
      const retired = await categories.save({
        nombre: "Categoría inactiva",
        estado: "INACTIVA",
      });
      const items = [];
      for (let i = 0; i < 8; i++)
        items.push(
          await products.save({
            idTienda: own.idTienda,
            idCategoria: i === 1 ? retired.idCategoria : active.idCategoria,
            nombre:
              i === 7 ? "Literal %_\\ especial" : `Producto temporal ${i + 1}`,
            descripcion: "Descripción sintética",
            precio: "1500.25",
            cantidadDisponible: i === 2 ? 0 : 10,
            estado: ["ACTIVO", "INACTIVO", "AGOTADO"][i % 3],
          }),
        );
      const second = await products.save({
        idTienda: inactive.idTienda,
        idCategoria: active.idCategoria,
        nombre: "Producto de tienda inactiva",
        precio: "10.00",
        cantidadDisponible: 0,
        estado: "INACTIVO",
      });
      const other = await products.save({
        idTienda: foreign.idTienda,
        idCategoria: active.idCategoria,
        nombre: "Producto ajeno",
        precio: "10.00",
        cantidadDisponible: 10,
      });
      const neighborhood = await ds.getRepository(Neighborhood).save({
        nombre: "Barrio temporal",
        tarifaEnvio: "0.00",
        estado: "ACTIVO",
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

      const root = (id = own.idTienda) => `/mi-negocio/tiendas/${id}/productos`;
      const path = (id = own.idTienda) => `/api${root(id)}`;
      const detail = (id = items[0].idProducto, store = own.idTienda) =>
        `${path(store)}/${id}`;
      const edit = (id = items[0].idProducto, store = own.idTienda) =>
        `${root(store)}/${id}/editar`;
      const select = (field, value) =>
        browser.evaluate(
          `(() => {const e=document.querySelector('#product-${field}');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
      const ready = async (url) => {
        await navigate(url, "#product-nombre");
        const name = await browser.evaluate(
          "document.querySelector('#product-nombre').value",
        );
        await browser.fill("#product-nombre", name + " ");
        await browser.wait(
          `document.querySelector('#product-nombre').value===${JSON.stringify(name + " ")}`,
          "campo controlado",
        );
        await browser.fill("#product-nombre", name);
      };
      const submit = () =>
        browser.evaluate(
          "document.querySelector('form[aria-label$=producto]').requestSubmit()",
        );
      const saved = () =>
        browser.wait(
          "document.body.innerText.includes('Cambios guardados correctamente')",
          "guardado",
        );
      const current = (id = items[0].idProducto) =>
        products.findOneByOrFail({ idProducto: id });
      const backendRequest = async (
        route,
        body,
        role = "owner",
        method = "PATCH",
      ) => {
        const response = await fetch(`${apiOrigin}/api/v1${route}`, {
          method,
          headers: {
            Authorization: `Bearer ${tokens[role]}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        return { status: response.status, data: await response.json() };
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
      const buttonText = (text) =>
        browser.evaluate(
          `Array.from(document.querySelectorAll('button')).find(e=>e.textContent===${JSON.stringify(text)}).click()`,
        );
      await mkdir(evidence, { recursive: true });

      await t.test("sin sesión: BFFs 401 y páginas protegidas", async () => {
        for (const url of [path(), detail(), "/api/mi-negocio/categorias"])
          assert.equal((await fetch(origin + url)).status, 401);
        assert.equal(
          (await fetch(origin + root(), { redirect: "manual" })).status,
          307,
        );
      });
      for (const role of ["CLIENTE", "ADMIN", "REPARTIDOR"])
        await t.test(`${role}: GET/POST/PATCH y categorías 403`, async () => {
          await login(role);
          for (const url of [path(), detail(), "/api/mi-negocio/categorias"])
            assert.equal((await bff(url)).status, 403);
          assert.equal((await bff(path(), {}, "POST")).status, 403);
          assert.equal(
            (await bff(detail(), { version: 1, nombre: "Prohibido" })).status,
            403,
          );
          await browser.navigate(origin + root());
          await browser.wait(
            "location.pathname==='/cuenta' && !!document.querySelector('.account-trigger')",
            "rol rechazado",
          );
        });
      await login("owner");
      await t.test(
        "navegación, listado real con tres estados, categorías y precio",
        async () => {
          await navigate("/mi-negocio/tiendas", "[data-managed-store]");
          assert.ok(
            await browser.evaluate(
              `!!document.querySelector('a[href="${root()}"]')`,
            ),
          );
          await navigate(root(), "[data-managed-product]");
          const result = await bff(path());
          assert.equal(result.status, 200);
          assert.equal(result.cache, "no-store");
          assert.equal(result.data.totalElements, 8);
          assert.equal(result.data.content.length, 6);
          assert.deepEqual(
            [...new Set(result.data.content.map((p) => p.estado))].sort(),
            ["ACTIVO", "AGOTADO", "INACTIVO"],
          );
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('Categoría inactiva')",
            ),
          );
          assert.equal(
            (await bff(path(inactive.idTienda))).data.content[0].idProducto,
            second.idProducto,
          );
        },
      );
      await t.test(
        "propiedad, tienda fija y filtros no manipulables",
        async () => {
          for (const url of [
            path(foreign.idTienda),
            path(2147483647),
            detail(other.idProducto),
            detail(second.idProducto),
          ])
            assert.equal((await bff(url)).status, 404);
          assert.equal(
            (await bff(path(foreign.idTienda), {}, "POST")).status,
            404,
          );
          assert.equal(
            (await bff(detail(other.idProducto), { version: 1, nombre: "No" }))
              .status,
            404,
          );
          assert.equal(
            (await bff(path() + "?idTienda=" + foreign.idTienda)).status,
            400,
          );
          assert.equal(
            (await bff(path(), { idTienda: foreign.idTienda }, "POST")).status,
            400,
          );
          assert.equal(
            (await bff(detail(), { version: 1, idTienda: inactive.idTienda }))
              .status,
            400,
          );
          assert.equal(
            (await bff("/api/mi-negocio/tiendas/no/productos")).status,
            400,
          );
          const cross = await bff(
            detail(items[0].idProducto, inactive.idTienda),
          );
          assert.equal(cross.status, 404);
        },
      );
      await t.test(
        "paginación real y búsqueda literal reinicia página",
        async () => {
          await navigate(root(), "[data-managed-product]");
          await buttonText("Siguiente");
          await browser.wait(
            "document.body.innerText.includes('Página 2 de 2') && document.querySelectorAll('[data-managed-product]').length===2",
            "segunda página",
          );
          await browser.fill("#business-product-search", "%_\\");
          await browser.evaluate(
            "document.querySelector('form[role=search]').requestSubmit()",
          );
          await browser.wait(
            "document.body.innerText.includes('1 productos') && document.querySelectorAll('[data-managed-product]').length===1",
            "literal filtrado",
          );
          assert.ok(
            await browser.evaluate(
              "document.body.innerText.includes('Página 1 de 1')",
            ),
          );
          await browser.fill("#business-product-search", "sin coincidencias");
          await browser.evaluate(
            "document.querySelector('form[role=search]').requestSubmit()",
          );
          await browser.wait(
            "document.body.innerText.includes('No hay productos para mostrar')",
            "vacío real",
          );
        },
      );
      await t.test(
        "formulario inválido: errores por campo y ninguna escritura",
        async () => {
          const before = await products.count();
          await ready(root() + "/nuevo");
          await browser.fill("#product-nombre", "Prueba inválida");
          await browser.fill("#product-precio", "1.234");
          await browser.fill("#product-cantidadDisponible", "-1");
          await submit();
          await browser.wait(
            "document.querySelector('#product-precio')?.getAttribute('aria-invalid')==='true'",
            "errores visibles",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#product-cantidadDisponible').getAttribute('aria-invalid')",
            ),
            "true",
          );
          assert.equal(await products.count(), before);
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#product-nombre').value",
            ),
            "Prueba inválida",
          );
        },
      );
      await t.test(
        "categorías activas nuevas, inexistente rechazada y origen externo bloqueado",
        async () => {
          const payload = {
            nombre: "Categoría inválida",
            idCategoria: retired.idCategoria,
            precio: 10,
            cantidadDisponible: 0,
            estado: "ACTIVO",
          };
          assert.equal((await bff(path(), payload, "POST")).status, 400);
          assert.equal(
            (await bff(path(), { ...payload, idCategoria: 2147483647 }, "POST"))
              .status,
            404,
          );
          const response = await fetch(origin + path(), {
            method: "POST",
            headers: {
              Cookie: (
                await browser.call("Network.getCookies", { urls: [origin] })
              ).cookies
                .filter((c) => c.name === "chorotega_session")
                .map((c) => `${c.name}=${c.value}`)
                .join(";"),
              "Content-Type": "application/json",
              Origin: "https://external.invalid",
            },
            body: JSON.stringify({
              ...payload,
              idCategoria: active.idCategoria,
            }),
          });
          assert.equal(response.status, 403);
        },
      );
      await t.test(
        "creación real exacta, 201/Location y doble submit bloqueado",
        async () => {
          await ready(root() + "/nuevo");
          await browser.fill("#product-nombre", "Producto creado desde Chrome");
          await select("idCategoria", active.idCategoria);
          await browser.fill("#product-precio", "1250,35");
          await browser.fill("#product-cantidadDisponible", "4");
          await select("estado", "AGOTADO");
          const service = context.app.get(ProductsService),
            original = service.create.bind(service);
          let calls = 0,
            release;
          const gate = new Promise((r) => {
            release = r;
          });
          service.create = async (...args) => {
            calls++;
            await gate;
            return original(...args);
          };
          try {
            await submit();
            await until(() => calls === 1, "POST alcanzó Nest");
            await submit();
            assert.equal(calls, 1);
            release();
            await browser.wait(
              "!!document.querySelector('[data-product-created]')",
              "creado real",
            );
            const created = await products.findOneByOrFail({
              nombre: "Producto creado desde Chrome",
            });
            assert.equal(created.precio, "1250.35");
            assert.equal(created.cantidadDisponible, 4);
            assert.equal(created.estado, "AGOTADO");
            assert.equal(created.idTienda, own.idTienda);
          } finally {
            release();
            service.create = original;
          }
          const response = await bff(
            path(),
            {
              nombre: "BFF 201",
              idCategoria: active.idCategoria,
              precio: 0.01,
              cantidadDisponible: 0,
              estado: "INACTIVO",
            },
            "POST",
          );
          assert.equal(response.status, 201);
          assert.equal(
            (
              await products.findOneByOrFail({
                idProducto: response.data.idProducto,
              })
            ).precio,
            "0.01",
          );
        },
      );
      await t.test(
        "PATCH parcial, null elimina descripción e inactiva asignada se conserva",
        async () => {
          await ready(edit(items[1].idProducto));
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#product-idCategoria').value",
            ),
            String(retired.idCategoria),
          );
          await browser.evaluate(
            "window.phase7Fetch=window.fetch;window.phase7Bodies=[];window.fetch=async(...args)=>{if(args[1]?.method==='PATCH')window.phase7Bodies.push(JSON.parse(args[1].body));return window.phase7Fetch(...args)}",
          );
          try {
            await browser.fill("#product-descripcion", "");
            await browser.fill("#product-precio", "99,99");
            await submit();
            await saved();
            const bodies = await browser.evaluate("window.phase7Bodies");
            assert.equal(bodies.length, 1);
            assert.deepEqual(bodies[0], {
              descripcion: null,
              precio: 99.99,
              version: 1,
            });
            const value = await current(items[1].idProducto);
            assert.equal(value.descripcion, null);
            assert.equal(value.idCategoria, retired.idCategoria);
            assert.equal(value.precio, "99.99");
            assert.equal(value.estado, "INACTIVO");
            assert.equal(value.version, 2);
            await submit();
            await browser.wait(
              "document.body.innerText.includes('No hay cambios para guardar')",
              "sin PATCH vacío",
            );
            assert.equal(
              (await browser.evaluate("window.phase7Bodies")).length,
              1,
            );
          } finally {
            await browser.evaluate(
              "window.fetch=window.phase7Fetch;delete window.phase7Fetch;delete window.phase7Bodies",
            );
          }
          await ready(edit(items[1].idProducto));
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#product-descripcion').value",
            ),
            "",
          );
          await select("idCategoria", alternative.idCategoria);
          await submit();
          await saved();
          assert.equal(
            (await current(items[1].idProducto)).idCategoria,
            alternative.idCategoria,
          );
        },
      );
      await t.test(
        "editar existencias y estado en una tienda propia inactiva",
        async () => {
          await ready(edit(second.idProducto, inactive.idTienda));
          assert.equal(
            await browser.evaluate(
              "!!document.querySelector('[name=idTienda]')",
            ),
            false,
          );
          await browser.fill("#product-cantidadDisponible", "7");
          await select("estado", "ACTIVO");
          await submit();
          await saved();
          let value = await current(second.idProducto);
          assert.equal(value.cantidadDisponible, 7);
          assert.equal(value.estado, "ACTIVO");
          assert.equal(value.version, 2);
          await browser.fill("#product-cantidadDisponible", "0");
          await select("estado", "AGOTADO");
          await submit();
          await saved();
          await until(
            async () => (await current(second.idProducto)).version === 3,
            "segunda actualización persistida",
          );
          value = await current(second.idProducto);
          assert.equal(value.cantidadDisponible, 0);
          assert.equal(value.estado, "AGOTADO");
          await ready(edit(second.idProducto, inactive.idTienda));
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#product-cantidadDisponible').value",
            ),
            "0",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#product-estado').value",
            ),
            "AGOTADO",
          );
        },
      );
      await t.test(
        "tienda con más de 100 productos: detalle por ID sin recorrer páginas",
        async () => {
          const many = await products.save(
            Array.from({ length: 150 }, (_, i) => ({
              idTienda: inactive.idTienda,
              idCategoria: active.idCategoria,
              nombre: `Producto numeroso ${i + 1}`,
              precio: "10.00",
              cantidadDisponible: 0,
              estado: "AGOTADO",
            })),
          );
          const target = many.at(-1),
            reads = [];
          const observe = (req) => {
            if (req.method === "GET" && req.url?.startsWith("/api/v1/products"))
              reads.push(req.url);
          };
          const server = context.app.getHttpServer();
          server.on("request", observe);
          try {
            await ready(edit(target.idProducto, inactive.idTienda));
            assert.equal(
              await browser.evaluate(
                "document.querySelector('#product-nombre').value",
              ),
              target.nombre,
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelector('#product-estado').value",
              ),
              "AGOTADO",
            );
            assert.deepEqual(reads, [`/api/v1/products/${target.idProducto}`]);
          } finally {
            server.off("request", observe);
          }
        },
      );
      await t.test(
        "409 real conserva versión y campos; consulta no reescribe y recarga explícita",
        async () => {
          await ready(edit());
          await browser.fill("#product-nombre", "Cambio local pendiente");
          const response = await backendRequest(
            `/products/${items[0].idProducto}`,
            {
              version: 1,
              nombre: "Cambio de otra sesión",
              cantidadDisponible: 12,
            },
          );
          assert.equal(response.status, 200);
          await submit();
          await browser.wait(
            "document.body.innerText.includes('Este producto cambió desde que lo abriste')",
            "409 real",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#product-nombre').value",
            ),
            "Cambio local pendiente",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('[data-product-version]').dataset.productVersion",
            ),
            "1",
          );
          assert.equal((await current()).nombre, "Cambio de otra sesión");
          await buttonText("Consultar versión vigente");
          await browser.wait(
            `!!document.querySelector('[data-current-version="2"]')`,
            "consulta de solo lectura",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#product-nombre').value",
            ),
            "Cambio local pendiente",
          );
          assert.equal(
            await browser.evaluate(
              "document.querySelector('[data-product-version]').dataset.productVersion",
            ),
            "1",
          );
          assert.equal((await current()).version, 2);
          await capture("conflicto-version.png");
          await buttonText("Descartar mis cambios y cargar versión vigente");
          await browser.wait(
            "document.querySelector('[data-product-version]')?.dataset.productVersion==='2'",
            "recarga explícita",
          );
          await browser.fill(
            "#product-nombre",
            "Edición sobre versión vigente",
          );
          await submit();
          await saved();
          assert.equal((await current()).version, 3);
        },
      );
      await t.test(
        "compra y stock desde Chrome concurrentes: PostgreSQL conserva ambas reglas",
        async () => {
          const target = items[3];
          await ready(edit(target.idProducto));
          await browser.fill("#product-cantidadDisponible", "100");
          await browser.evaluate(
            "window.phase7Fetch=window.fetch;window.phase7Status=null;window.fetch=async(...args)=>{const r=await window.phase7Fetch(...args);if(args[1]?.method==='PATCH')window.phase7Status=r.status;return r}",
          );
          const lock = ds.createQueryRunner();
          await lock.connect();
          await lock.startTransaction();
          let purchase;
          try {
            await lock.query(
              "SELECT id_producto FROM producto WHERE id_producto=$1 FOR UPDATE",
              [target.idProducto],
            );
            purchase = backendRequest(
              "/orders",
              {
                idBarrio: neighborhood.idBarrio,
                direccionEntrega: "Dirección sintética",
                items: [{ idProducto: target.idProducto, cantidad: 2 }],
              },
              "CLIENTE",
              "POST",
            );
            await submit();
            await until(
              async () => {
                const [row] = await ds.query(
                  "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%producto%'",
                );
                return row.n >= 2;
              },
              "compra y edición esperando la misma fila",
              10000,
            );
            await lock.commitTransaction();
            const bought = await purchase;
            assert.equal(bought.status, 201);
            await browser.wait(
              "window.phase7Status!==null",
              "respuesta PATCH concurrente",
            );
            const status = await browser.evaluate("window.phase7Status");
            const value = await current(target.idProducto);
            assert.ok([200, 409].includes(status));
            assert.equal(value.cantidadDisponible, status === 409 ? 8 : 98);
            assert.equal(value.version, status === 409 ? 2 : 3);
            assert.equal(value.estado, "ACTIVO");
            t.diagnostic(
              `Compra concurrente: POST 201, PATCH ${status}, stock ${value.cantidadDisponible}, versión ${value.version}`,
            );
          } finally {
            if (lock.isTransactionActive) await lock.rollbackTransaction();
            await lock.release();
            await purchase;
            await browser.evaluate(
              "window.fetch=window.phase7Fetch;delete window.phase7Fetch;delete window.phase7Status",
            );
          }
        },
      );
      await t.test(
        "creación ambigua guardada: conserva formulario y no repite automáticamente",
        async () => {
          await ready(root() + "/nuevo");
          await browser.fill("#product-nombre", "Creación ambigua temporal");
          await select("idCategoria", active.idCategoria);
          await browser.fill("#product-precio", "18.10");
          const service = context.app.get(ProductsService),
            original = service.create.bind(service);
          let calls = 0;
          service.create = async (...args) => {
            calls++;
            await original(...args);
            throw new Error("SYNTHETIC_PRIVATE_FAILURE");
          };
          try {
            await submit();
            await browser.wait(
              "document.body.innerText.includes('No pudimos confirmar si el producto se creó')",
              "ambigüedad visible",
            );
            await submit();
            assert.equal(calls, 1);
            assert.equal(
              await products.countBy({ nombre: "Creación ambigua temporal" }),
              1,
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelector('#product-nombre').value",
              ),
              "Creación ambigua temporal",
            );
            assert.equal(
              await browser.evaluate(
                "document.body.innerText.includes('SYNTHETIC_PRIVATE_FAILURE')",
              ),
              false,
            );
            await buttonText("Ya revisé el listado; habilitar otro intento");
            assert.equal(calls, 1);
            assert.ok(
              await browser.evaluate(
                "document.body.innerText.includes('No hay idempotencia distribuida')",
              ),
            );
          } finally {
            service.create = original;
          }
        },
      );
      await t.test(
        "error de lectura y reintento sin datos falsos",
        async () => {
          await navigate(root(), "[data-managed-product]");
          await browser.evaluate(
            "window.phase7Fetch=window.fetch;window.fetch=(...args)=>String(args[0]).includes('/productos?')?Promise.reject(new Error('synthetic-network')):window.phase7Fetch(...args)",
          );
          try {
            await buttonText("Siguiente");
            await browser.wait(
              "!!document.querySelector('[data-products-error]')",
              "red interrumpida",
            );
          } finally {
            await browser.evaluate(
              "window.fetch=window.phase7Fetch;delete window.phase7Fetch",
            );
          }
          await buttonText("Reintentar");
          await browser.wait(
            "!!document.querySelector('[data-managed-product]')",
            "recuperación",
          );
        },
      );
      for (const width of [320, 390, 768, 1280, 1440])
        await t.test(
          `responsive ${width}px: listado y ambos formularios`,
          async () => {
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 900,
              deviceScaleFactor: 1,
              mobile: width < 768,
            });
            for (const [name, url, selector] of [
              ["productos", root(), "[data-managed-product]"],
              ["nuevo", root() + "/nuevo", "#product-nombre"],
              ["editar", edit(), "#product-nombre"],
            ]) {
              await navigate(url, selector);
              assert.ok(
                await browser.evaluate(
                  "document.documentElement.scrollWidth<=innerWidth",
                ),
                `${name} sin overflow ${width}`,
              );
              if ([320, 1440].includes(width))
                await capture(`${name}-${width}.png`);
            }
          },
        );
      await t.test(
        "sesión inválida y vencida: 401 y página sin productos privados",
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
            await browser.navigate(origin + root());
            await browser.wait(
              "location.pathname==='/login' && !!document.querySelector('#correo')",
              "sesión vencida",
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelectorAll('[data-managed-product]').length",
              ),
              0,
            );
          }
        },
      );
      t.diagnostic(`Capturas sintéticas: ${evidence}`);
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
