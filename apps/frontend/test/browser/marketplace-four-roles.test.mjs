import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { chrome, freePort, until, waitForLoginHydration } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../..");
const backend = createRequire(resolve(frontend, "../backend/package.json"));
backend("ts-node").register({
  project: resolve(frontend, "../backend/tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backend("./test/support/create-http-test-app.ts");
const { configureAdminViews } = backend("./src/admin/admin-views.ts");
const { AdminModule } = backend("./src/admin/admin.module.ts");
const { AuthModule } = backend("./src/auth/auth.module.ts");
const { OrdersHttpModule } = backend(
  "./src/modules/orders/orders-http.module.ts",
);
const { StoresModule } = backend("./src/modules/stores/stores.module.ts");
const { ProductsModule } = backend("./src/modules/products/products.module.ts");
const { NeighborhoodsModule } = backend(
  "./src/modules/neighborhoods/neighborhoods.module.ts",
);
const { DeliveriesModule } = backend(
  "./src/modules/deliveries/deliveries.module.ts",
);
const { JwtService } = backend("@nestjs/jwt");
const bcrypt = backend("bcrypt");

async function seed(source, password) {
  const accounts = {};
  const claveHash = await bcrypt.hash(password, 4);
  for (const [key, rol] of Object.entries({
    customer: "CLIENTE",
    owner: "EMPRENDEDOR",
    stranger: "EMPRENDEDOR",
    admin: "ADMIN",
    courier: "REPARTIDOR",
    otherCourier: "REPARTIDOR",
  })) {
    accounts[key] = await source.getRepository("User").save({
      authId: randomUUID(),
      nombre: key,
      apellido: "Sintético",
      correo: `${key.toLowerCase()}@example.test`,
      rol,
      estado: "ACTIVO",
      claveHash,
    });
  }
  const store = await source.getRepository("Store").save({
    idEmprendedor: accounts.owner.idUsuario,
    nombre: "Taller sintético",
    direccion: "Local de prueba",
    estado: "ACTIVA",
  });
  const category = await source.getRepository("Category").save({
    nombre: "Categoría sintética",
  });
  const product = await source.getRepository("Product").save({
    idTienda: store.idTienda,
    idCategoria: category.idCategoria,
    nombre: "Pieza sintética",
    precio: "10.25",
    cantidadDisponible: 10,
    estado: "ACTIVO",
  });
  const neighborhood = await source.getRepository("Neighborhood").save({
    nombre: "Barrio sintético",
    tarifaEnvio: "1.25",
    estado: "ACTIVO",
  });
  const couriers = source.getRepository("Courier");
  const courier = await couriers.save({
    idUsuario: accounts.courier.idUsuario,
    medioTransporte: "Bicicleta",
    disponibilidad: "DISPONIBLE",
  });
  await couriers.save({
    idUsuario: accounts.otherCourier.idUsuario,
    medioTransporte: "Bicicleta",
    disponibilidad: "DISPONIBLE",
  });
  return { accounts, store, product, neighborhood, courier };
}

test(
  "Marketplace integral con Chrome, Next.js, NestJS y PostgreSQL temporal",
  {
    timeout: 240000,
  },
  async (t) => {
    const previousSecret = process.env.JWT_SECRET;
    const secret = randomUUID();
    process.env.JWT_SECRET = secret;
    t.after(() => {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    });
    const context = await createHttpTestApp(
      [
        AuthModule,
        StoresModule,
        ProductsModule,
        OrdersHttpModule,
        NeighborhoodsModule,
        DeliveriesModule,
        AdminModule,
      ],
      configureAdminViews,
    );
    t.after(() => context.close());
    await context.app.listen(0, "127.0.0.1");
    const mvc = await context.app.getUrl();
    const api = `${mvc}/api/v1`;
    const source = context.database.dataSource;
    const password = randomUUID();
    const { accounts, store, product, neighborhood, courier } = await seed(
      source,
      password,
    );
    const address = "Dirección ficticia para prueba integral";
    const port = await freePort();
    const origin = `http://localhost:${port}`;
    const next = spawn(
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
          API_URL: api,
          NEXT_PUBLIC_API_URL: api,
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    const nextExit = once(next, "exit");
    nextExit.catch(() => {});
    t.after(async () => {
      next.kill();
      await nextExit;
    });
    await until(
      async () => {
        if (next.exitCode !== null)
          throw new Error("Next.js terminó antes de iniciar.");
        return fetch(origin)
          .then((r) => r.ok)
          .catch(() => false);
      },
      "Next.js local",
      30000,
    );
    const browser = await chrome();
    t.after(() => browser.close());
    const evidence = await mkdtemp(join(tmpdir(), "chorotega-four-roles-"));
    t.diagnostic(`Evidencia sintética: ${evidence}`);

    const evaluate = browser.evaluate;
    const exists = (selector) =>
      `!!document.querySelector(${JSON.stringify(selector)})`;
    const includes = (value) =>
      `document.body.innerText.includes(${JSON.stringify(value)})`;
    const click = async (selector) => {
      await browser.wait(exists(selector), selector);
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).click()`,
      );
    };
    const button = async (label) => {
      const match = `Array.from(document.querySelectorAll('button')).find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)})`;
      await browser.wait(`!!(${match})`, label);
      await evaluate(`(${match}).click()`);
    };
    const page = (path, condition) =>
      browser.wait(
        `location.pathname === ${JSON.stringify(path)} && (${condition})`,
        path,
      );
    const go = async (path, condition, base = origin) => {
      await browser.navigate(base + path);
      await page(path, condition);
    };
    const submit = (action) =>
      evaluate(
        `document.querySelector(${JSON.stringify(`form[action="${action}"]`)}).requestSubmit()`,
      );
    const login = async (key, landing) => {
      await go("/login", exists("#correo"));
      await waitForLoginHydration(browser);
      await browser.fill("#correo", accounts[key].correo);
      await browser.fill("#clave", password);
      await evaluate("document.querySelector('form').requestSubmit()");
      await browser.wait(
        `(location.pathname === ${JSON.stringify(landing)} && ${exists(".account-trigger")}) || ${exists(".login-error")}`,
        "inicio de sesión",
      );
      assert.equal(
        await evaluate("location.pathname"),
        landing,
        await evaluate("document.querySelector('.login-error')?.textContent"),
      );
    };
    const logout = async () => {
      await click(".account-trigger");
      await click(".account-logout");
      await page("/login", exists("#correo"));
    };
    const capture = async (name) => {
      for (const width of [390, 1280]) {
        await browser.call("Emulation.setDeviceMetricsOverride", {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: false,
        });
        assert.equal(await evaluate("innerWidth"), width);
        assert.ok(
          await evaluate("document.documentElement.scrollWidth <= innerWidth"),
          `${name} (${width}px)`,
        );
        const shot = await browser.call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        });
        await writeFile(
          join(evidence, `${name}-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
      }
    };
    const orders = source.getRepository("Order");
    const lines = source.getRepository("OrderDetail");
    const deliveries = source.getRepository("Delivery");
    const couriers = source.getRepository("Courier");
    const products = source.getRepository("Product");
    const snapshot = async () => ({
      orders: await orders.find({ order: { idPedido: "ASC" } }),
      lines: await lines.find(),
      deliveries: await deliveries.find({ order: { idEntrega: "ASC" } }),
      couriers: await couriers.find({ order: { idRepartidor: "ASC" } }),
      stock: await products.find(),
    });
    const unchanged = async (operation) => {
      const before = await snapshot();
      await operation();
      assert.deepEqual(await snapshot(), before);
    };
    const tokens = new Map();
    const token = async (key) => {
      if (!tokens.has(key)) {
        const response = await fetch(api + "/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correo: accounts[key].correo,
            clave: password,
          }),
        });
        assert.equal(response.status, 201);
        tokens.set(key, (await response.json()).token);
      }
      return tokens.get(key);
    };
    const reject = async (status, path, method, bearer, body) =>
      unchanged(async () => {
        const response = await fetch(api + path, {
          method,
          headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, status, `${method} ${path}`);
        assert.equal((await response.text()).includes(address), false);
      });

    await login("customer", "/mercado");
    const shopPath = `/tiendas/${store.idTienda}`;
    await click(`a[href="${shopPath}"]`);
    const add = `[data-add-product="${product.idProducto}"]:not(:disabled)`;
    await page(shopPath, exists(add));
    await browser.fill(
      `[data-product-id="${product.idProducto}"] input[type=number]`,
      "2",
    );
    await click(add);
    await browser.wait(includes("Producto agregado"), "producto agregado");
    await click('a[href="/carrito"]');
    await page(
      "/carrito",
      exists(`[data-cart-product="${product.idProducto}"]`),
    );
    assert.equal(
      await evaluate("document.querySelector('[data-cart-count]').textContent"),
      "2",
    );
    await browser.wait(includes("20,50"), "subtotal del carrito");
    const continueButton = "[data-cart-continue]:not(:disabled)";
    await click(continueButton);
    await page("/carrito/confirmar", exists("#delivery-address"));
    await browser.wait(
      "document.querySelectorAll('#neighborhood option').length > 1",
      "barrios cargados",
    );
    await evaluate(`(() => {
    const select = document.querySelector('#neighborhood');
    select.value = '${neighborhood.idBarrio}';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
    await browser.fill("#delivery-address", address);
    await page("/carrito/confirmar", exists(continueButton));
    await evaluate(
      `(() => { const button = document.querySelector('${continueButton}'); button.click(); button.click(); })()`,
    );
    await browser.wait(
      includes("¡Tu pedido se creó con éxito!"),
      "compra confirmada",
    );
    await capture("01-pedido-confirmado");
    assert.equal(await orders.count(), 1);
    const order = await orders.findOneByOrFail({
      idCliente: accounts.customer.idUsuario,
    });
    assert.deepEqual(
      [
        order.estado,
        order.subtotal,
        order.tarifaEnvio,
        order.total,
        order.idBarrio,
        order.direccionEntrega,
      ],
      ["CONFIRMADO", "20.50", "1.25", "21.75", neighborhood.idBarrio, address],
    );
    const items = await lines.findBy({ idPedido: order.idPedido });
    assert.deepEqual(
      items.map(({ idProducto, cantidad, precioUnitario, subtotal }) => ({
        idProducto,
        cantidad,
        precioUnitario,
        subtotal,
      })),
      [
        {
          idProducto: product.idProducto,
          cantidad: 2,
          precioUnitario: "10.25",
          subtotal: "20.50",
        },
      ],
    );
    assert.equal(
      (await products.findOneByOrFail({ idProducto: product.idProducto }))
        .cantidadDisponible,
      8,
    );
    const orderPath = `/orders/${order.idPedido}`;
    const assign = {
      idPedido: order.idPedido,
      idRepartidor: courier.idRepartidor,
    };
    await reject(403, "/deliveries", "POST", await token("customer"), assign);
    await reject(409, "/deliveries", "POST", await token("admin"), assign);
    const stranger = await token("stranger");
    await reject(404, orderPath, "GET", stranger);
    await reject(404, orderPath + "/prepare", "PATCH", stranger);
    await reject(401, orderPath + "/prepare", "PATCH", "invalid");
    const claims = new JwtService().decode(await token("owner"));
    delete claims.exp;
    delete claims.iat;
    const expired = new JwtService({ secret }).sign(claims, { expiresIn: -1 });
    await reject(401, orderPath + "/prepare", "PATCH", expired);

    await logout();
    await login("owner", "/cuenta");
    const managed = `/mi-negocio/tiendas/${store.idTienda}/pedidos`;
    await go("/mi-negocio/tiendas", exists(`a[href="${managed}"]`));
    await click(`a[href="${managed}"]`);
    const detail = `${managed}/${order.idPedido}`;
    await click(`a[href="${detail}"]`);
    await page(detail, includes("Comenzar preparación"));
    await button("Comenzar preparación");
    await button("Confirmar preparación");
    await browser.wait(includes("Preparando"), "pedido preparando");
    assert.equal(
      (await orders.findOneByOrFail({ idPedido: order.idPedido })).estado,
      "PREPARANDO",
    );
    await capture("02-pedido-preparando");
    await logout();

    await go("/admin/login", exists("#correo"), mvc);
    await browser.fill("#correo", accounts.admin.correo);
    await browser.fill("#clave", password);
    await submit("/admin/login");
    await page("/admin/products", exists('a[href="/admin/deliveries"]'));
    await click('nav a[href="/admin/deliveries"]');
    await click('a[href="/admin/deliveries/new"]');
    const assignmentForm = async () => {
      await page("/admin/deliveries/new", exists("#idPedido"));
      await browser.fill("#idPedido", String(order.idPedido));
      await evaluate(
        `document.querySelector('#idRepartidor').value = '${courier.idRepartidor}'`,
      );
      assert.equal(
        await evaluate("document.querySelector('#idRepartidor').value"),
        String(courier.idRepartidor),
      );
    };
    await assignmentForm();
    await unchanged(async () => {
      await evaluate(
        "document.querySelector('form[action=\"/admin/deliveries\"] input[name=_csrf]').value = 'invalid'",
      );
      await submit("/admin/deliveries");
      await page("/admin/deliveries", includes("403"));
    });
    await go("/admin/deliveries/new", exists("#idPedido"), mvc);
    await assignmentForm();
    await capture("03-formulario-asignacion");
    await submit("/admin/deliveries");
    await browser.wait(
      "location.pathname.startsWith('/admin/deliveries/') && " +
        includes("ASIGNADA"),
      "asignación MVC",
    );
    const delivery = await deliveries.findOneByOrFail({
      idPedido: order.idPedido,
    });
    assert.equal(delivery.estado, "ASIGNADA");
    assert.equal(delivery.idRepartidor, courier.idRepartidor);
    const availability = async () =>
      (await couriers.findOneByOrFail({ idRepartidor: courier.idRepartidor }))
        .disponibilidad;
    assert.equal(await availability(), "OCUPADO");
    await reject(409, "/deliveries", "POST", await token("admin"), assign);
    const deliveryPath = `/deliveries/${delivery.idEntrega}`;
    const courierToken = await token("courier");
    await reject(
      404,
      deliveryPath + "/destination",
      "GET",
      await token("otherCourier"),
    );
    await reject(400, "/deliveries/invalid/destination", "GET", courierToken);
    await reject(409, deliveryPath + "/complete", "POST", courierToken);

    await login("courier", "/cuenta");
    const courierDetail = `/mis-entregas/${delivery.idEntrega}`;
    await go("/mis-entregas", exists(`a[href="${courierDetail}"]`));
    await click(`a[href="${courierDetail}"]`);
    await page(courierDetail, includes("Iniciar entrega"));
    await capture("04-entrega-asignada");
    await browser.wait(
      `${includes(address)} && ${includes(neighborhood.nombre)}`,
      "destino autorizado",
    );
    await capture("05-destino-autorizado");
    await button("Iniciar entrega");
    await button("Confirmar inicio");
    await browser.wait(
      `${includes("En camino")} && ${includes(address)}`,
      "entrega en camino con destino",
    );
    assert.equal(
      (await deliveries.findOneByOrFail({ idEntrega: delivery.idEntrega }))
        .estado,
      "EN_CAMINO",
    );
    await capture("06-entrega-en-camino");
    await reject(409, deliveryPath + "/start", "POST", courierToken);
    await button("Completar entrega");
    await button("Confirmar entrega");
    await browser.wait(
      `${includes("Entregada")} && !${includes(address)}`,
      "entrega finalizada sin destino",
    );
    await capture("07-entrega-entregada");
    assert.equal(
      (await deliveries.findOneByOrFail({ idEntrega: delivery.idEntrega }))
        .estado,
      "ENTREGADA",
    );
    assert.equal(
      (await orders.findOneByOrFail({ idPedido: order.idPedido })).estado,
      "ENTREGADO",
    );
    assert.equal(await availability(), "DISPONIBLE");
    await reject(409, deliveryPath + "/complete", "POST", courierToken);
    await reject(404, deliveryPath + "/destination", "GET", courierToken);
    await unchanged(async () => {
      assert.deepEqual(
        await evaluate(`fetch('/api/mis-entregas/${delivery.idEntrega}/destino')
        .then(async response => ({
          status: response.status,
          exposesAddress: (await response.text()).includes(${JSON.stringify(address)}),
        }))`),
        { status: 404, exposesAddress: false },
      );
    });
    await logout();

    await login("customer", "/mercado");
    await go("/pedidos", exists(".order-card"));
    assert.deepEqual(
      await evaluate(`Array.from(document.querySelectorAll('.order-card')).map(card => ({
    title: card.querySelector('h2').textContent.trim(),
    state: card.querySelector('.orders-status').textContent.trim(),
    address: card.querySelector('.order-detail-address dd').textContent.trim(),
  }))`),
      [{ title: `Pedido #${order.idPedido}`, state: "Entregado", address }],
    );
    assert.equal(await orders.count(), 1);
    assert.equal(await deliveries.count(), 1);
    await capture("08-historial-cliente");
  },
);
