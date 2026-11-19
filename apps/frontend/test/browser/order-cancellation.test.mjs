import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chrome, freePort, until } from "./support.mjs";
const frontend = resolve(import.meta.dirname, "../.."),
  backend = createRequire(resolve(frontend, "../backend/package.json"));
backend("ts-node").register({
  project: resolve(frontend, "../backend/tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backend("./test/support/create-http-test-app.ts");
const { OrdersHttpModule } = backend(
  "./src/modules/orders/orders-http.module.ts",
);
const { User } = backend("./src/modules/users/entities/user.entity.ts");
const { Store } = backend("./src/modules/stores/entities/store.entity.ts");
const { Category } = backend(
  "./src/modules/categories/entities/category.entity.ts",
);
const { Product } = backend(
  "./src/modules/products/entities/product.entity.ts",
);
const { Neighborhood } = backend(
  "./src/modules/neighborhoods/entities/neighborhood.entity.ts",
);
const { Order } = backend("./src/modules/orders/entities/order.entity.ts");
const { JwtService } = backend("@nestjs/jwt");
test(
  "Cancelación CLIENTE: Chrome → Next → Nest → PostgreSQL temporal",
  { timeout: 180000 },
  async (t) => {
    let context, next, browser;
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    try {
      context = await createHttpTestApp([OrdersHttpModule]);
      await context.app.listen(0, "127.0.0.1");
      const api = await context.app.getUrl(),
        ds = context.database.dataSource,
        users = {},
        tokens = {};
      for (const rol of ["CLIENTE", "EMPRENDEDOR"]) {
        users[rol] = await ds.getRepository(User).save({
          authId: randomUUID(),
          nombre: "Persona",
          apellido: "Sintética",
          correo: `${randomUUID()}@example.test`,
          rol,
          estado: "ACTIVO",
        });
        tokens[rol] = context.app.get(JwtService).sign({
          sub: users[rol].correo,
          idUsuario: users[rol].idUsuario,
          rol,
        });
      }
      const store = await ds.getRepository(Store).save({
        idEmprendedor: users.EMPRENDEDOR.idUsuario,
        nombre: "Negocio temporal",
        direccion: "Prueba",
      });
      const category = await ds
        .getRepository(Category)
        .save({ nombre: "Temporal" });
      const product = await ds.getRepository(Product).save({
        idTienda: store.idTienda,
        idCategoria: category.idCategoria,
        nombre: "Temporal",
        precio: "10.25",
        cantidadDisponible: 20,
      });
      const barrio = await ds
        .getRepository(Neighborhood)
        .save({ nombre: "Temporal", tarifaEnvio: "1.25" });
      const orders = [];
      for (let i = 0; i < 3; i++) {
        const r = await fetch(`${api}/api/v1/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.CLIENTE}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            idBarrio: barrio.idBarrio,
            direccionEntrega: "Dirección de prueba sintética",
            items: [{ idProducto: product.idProducto, cantidad: 2 }],
          }),
        });
        assert.equal(r.status, 201);
        orders.push(await r.json());
      }
      const prepared = await fetch(
        `${api}/api/v1/orders/${orders[2].idPedido}/prepare`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${tokens.EMPRENDEDOR}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      assert.equal(prepared.status, 200);
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
          stdio: "ignore",
        },
      );
      await until(
        async () => {
          if (next.exitCode !== null) throw new Error("Next terminó");
          try {
            return (await fetch(origin + "/login")).ok;
          } catch {
            return false;
          }
        },
        "Next listo",
        30000,
      );
      browser = await chrome();
      await browser.call("Network.setCookie", {
        name: "chorotega_session",
        value: tokens.CLIENTE,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      });
      await browser.navigate(origin + "/pedidos");
      await browser.wait(
        "document.querySelectorAll('.order-card').length===3",
        "historial real",
      );
      const section = (id) => `[data-order-cancellation="${id}"]`;
      const clickText = async (id, text) =>
        browser.evaluate(
          `Array.from(document.querySelector(${JSON.stringify(section(id))}).querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)}).click()`,
        );
      const state = async (id) =>
        (await ds.getRepository(Order).findOneByOrFail({ idPedido: id }))
          .estado;
      const stock = async () =>
        (
          await ds
            .getRepository(Product)
            .findOneByOrFail({ idProducto: product.idProducto })
        ).cantidadDisponible;
      await t.test(
        "solo se ofrece cancelar los pedidos potencialmente elegibles",
        async () => {
          assert.equal(
            await browser.evaluate(
              `document.querySelector(${JSON.stringify(section(orders[2].idPedido))}).querySelectorAll('button').length`,
            ),
            0,
          );
          assert.equal(await stock(), 14);
        },
      );
      await t.test("volver desde confirmación no escribe", async () => {
        await clickText(orders[0].idPedido, "Cancelar pedido");
        await browser.wait(
          "!!document.querySelector('section[aria-label^=\"Confirmar cancelación\"]')",
          "confirmación explícita",
        );
        await clickText(orders[0].idPedido, "Volver");
        assert.equal(await state(orders[0].idPedido), "CONFIRMADO");
        assert.equal(await stock(), 14);
      });
      await t.test(
        "doble clic emite una sola cancelación y actualiza el historial",
        async () => {
          await browser.evaluate(
            "window.originalCancelFetch=window.fetch;window.cancelWrites=0;window.fetch=async(...args)=>{if(args[1]?.method==='PATCH' && String(args[0]).endsWith('/cancel'))window.cancelWrites++;return window.originalCancelFetch(...args)}",
          );
          await clickText(orders[0].idPedido, "Cancelar pedido");
          await browser.wait(
            "!!document.querySelector('section[aria-label^=\"Confirmar cancelación\"]')",
            "confirmación",
          );
          await browser.evaluate(
            `(()=>{const b=Array.from(document.querySelector(${JSON.stringify(section(orders[0].idPedido))}).querySelectorAll('button')).find(b=>b.textContent==='Confirmar cancelación');b.click();b.click()})()`,
          );
          await browser.wait(
            `Array.from(document.querySelectorAll('.order-card')).find(e=>e.querySelector('h2').textContent.trim()==='Pedido #${orders[0].idPedido}').querySelector('.orders-status').textContent.trim()==='Cancelado'`,
            "cancelación confirmada",
          );
          assert.equal(await browser.evaluate("window.cancelWrites"), 1);
          assert.equal(await state(orders[0].idPedido), "CANCELADO");
          assert.equal(await stock(), 16);
          await browser.evaluate(
            "window.fetch=window.originalCancelFetch;delete window.originalCancelFetch",
          );
        },
      );
      await t.test(
        "respuesta perdida: no reenvía; consulta GET recupera CANCELADO sin restaurar otra vez",
        async () => {
          await browser.evaluate(
            "window.originalCancelFetch=window.fetch;window.cancelWrites=0;window.fetch=async(...args)=>{if(args[1]?.method==='PATCH' && String(args[0]).endsWith('/cancel')){window.cancelWrites++;await window.originalCancelFetch(...args);throw new TypeError('synthetic lost response')}return window.originalCancelFetch(...args)}",
          );
          await clickText(orders[1].idPedido, "Cancelar pedido");
          await browser.wait(
            "!!document.querySelector('section[aria-label^=\"Confirmar cancelación\"]')",
            "confirmación",
          );
          await clickText(orders[1].idPedido, "Confirmar cancelación");
          await browser.wait(
            `document.querySelector(${JSON.stringify(section(orders[1].idPedido))}).textContent.includes('Consultar estado del pedido')`,
            "respuesta ambigua",
          );
          assert.equal(await state(orders[1].idPedido), "CANCELADO");
          assert.equal(await stock(), 18);
          assert.equal(await browser.evaluate("window.cancelWrites"), 1);
          await clickText(orders[1].idPedido, "Consultar estado del pedido");
          await browser.wait(
            `Array.from(document.querySelectorAll('.order-card')).find(e=>e.querySelector('h2').textContent.trim()==='Pedido #${orders[1].idPedido}').querySelector('.orders-status').textContent.trim()==='Cancelado'`,
            "estado recuperado por lectura",
          );
          assert.equal(await browser.evaluate("window.cancelWrites"), 1);
          assert.equal(await stock(), 18);
          await browser.evaluate(
            "window.fetch=window.originalCancelFetch;delete window.originalCancelFetch",
          );
        },
      );
      await t.test(
        "409 si el emprendedor prepara durante la confirmación; reconsulta sin restaurar",
        async () => {
          const purchase = await fetch(`${api}/api/v1/orders`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokens.CLIENTE}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              idBarrio: barrio.idBarrio,
              direccionEntrega: "Dirección sintética",
              items: [{ idProducto: product.idProducto, cantidad: 2 }],
            }),
          });
          assert.equal(purchase.status, 201);
          const current = await purchase.json();
          await browser.navigate(origin + "/pedidos");
          await browser.wait(
            `!!document.querySelector('[data-order-cancellation="${current.idPedido}"]')`,
            "nuevo pedido",
          );
          await clickText(current.idPedido, "Cancelar pedido");
          await browser.wait(
            "!!document.querySelector('section[aria-label^=\"Confirmar cancelación\"]')",
            "confirmación antes de preparar",
          );
          const r = await fetch(
            `${api}/api/v1/orders/${current.idPedido}/prepare`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${tokens.EMPRENDEDOR}`,
                "Content-Type": "application/json",
              },
              body: "{}",
            },
          );
          assert.equal(r.status, 200);
          await clickText(current.idPedido, "Confirmar cancelación");
          await browser.wait(
            `document.querySelector('[data-order-cancellation="${current.idPedido}"]').textContent.includes('El pedido cambió')`,
            "conflicto visible",
          );
          assert.equal(await state(current.idPedido), "PREPARANDO");
          assert.equal(await stock(), 16);
          await clickText(current.idPedido, "Consultar estado del pedido");
          await browser.wait(
            `Array.from(document.querySelectorAll('.order-card')).find(e=>e.querySelector('h2').textContent.trim()==='Pedido #${current.idPedido}').querySelector('.orders-status').textContent.trim()==='Preparando'`,
            "estado real preparado",
          );
          assert.equal(await stock(), 16);
        },
      );
    } finally {
      try {
        await browser?.close();
      } finally {
        if (next && next.exitCode === null) {
          next.kill();
          await new Promise((resolve) => next.once("exit", resolve));
        }
        try {
          await context?.close();
        } finally {
          if (previous === undefined) delete process.env.JWT_SECRET;
          else process.env.JWT_SECRET = previous;
        }
      }
    }
  },
);
