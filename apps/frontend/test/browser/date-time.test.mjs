import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chrome, freePort, until } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../..");
const backend = createRequire(resolve(frontend, "../backend/package.json"));
backend("ts-node").register({
  project: resolve(frontend, "../backend/tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backend("./test/support/create-http-test-app.ts");
const { StoresModule } = backend("./src/modules/stores/stores.module.ts");
const { OrdersHttpModule } = backend(
  "./src/modules/orders/orders-http.module.ts",
);
const { DeliveriesModule } = backend(
  "./src/modules/deliveries/deliveries.module.ts",
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
const { JwtService } = backend("@nestjs/jwt");
const instants = ["2026-11-19T05:59:00.000Z", "2026-11-19T06:00:00.000Z"];
const expected = ["18 nov 2026, 11:59 p. m.", "19 nov 2026, 12:00 a. m."];
const normalized = (value) => value.replaceAll("\u00a0", " ");

test(
  "Fechas reales: Chrome → Next → Nest → PostgreSQL, tres zonas del navegador",
  { timeout: 180000 },
  async (t) => {
    let context, next, browser;
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    try {
      context = await createHttpTestApp([
        StoresModule,
        OrdersHttpModule,
        DeliveriesModule,
      ]);
      await context.app.listen(0, "127.0.0.1");
      const apiOrigin = await context.app.getUrl(),
        ds = context.database.dataSource;
      const accounts = {},
        tokens = {};
      for (const rol of ["CLIENTE", "EMPRENDEDOR", "REPARTIDOR"]) {
        accounts[rol] = await ds.getRepository(User).save({
          authId: randomUUID(),
          nombre: "Persona",
          apellido: "Sintética",
          correo: `${rol.toLowerCase()}@example.test`,
          rol,
          estado: "ACTIVO",
        });
        tokens[rol] = context.app.get(JwtService).sign({
          sub: accounts[rol].correo,
          idUsuario: accounts[rol].idUsuario,
          rol,
        });
      }
      const store = await ds.getRepository(Store).save({
        idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
        nombre: "Negocio temporal",
        direccion: "Dirección sintética",
        estado: "ACTIVA",
      });
      const barrio = await ds
        .getRepository(Neighborhood)
        .save({ nombre: "Barrio temporal", tarifaEnvio: "0.00" });
      const courier = await ds.getRepository(Courier).save({
        idUsuario: accounts.REPARTIDOR.idUsuario,
        medioTransporte: "MOTO",
        disponibilidad: "DISPONIBLE",
      });
      const orders = [],
        deliveries = [];
      for (const iso of instants) {
        const order = await ds.getRepository(Order).save({
          idCliente: accounts.CLIENTE.idUsuario,
          idTienda: store.idTienda,
          idBarrio: barrio.idBarrio,
          fechaCreacion: new Date(iso),
          estado: "ENTREGADO",
          direccionEntrega: "Dirección exclusivamente sintética",
          subtotal: "0.00",
          tarifaEnvio: "0.00",
          total: "0.00",
        });
        orders.push(order);
        deliveries.push(
          await ds.getRepository(Delivery).save({
            idPedido: order.idPedido,
            idRepartidor: courier.idRepartidor,
            estado: "ENTREGADA",
            fechaAsignacion: new Date(iso),
            fechaEntrega: new Date("2026-11-19T06:02:00.000Z"),
          }),
        );
      }
      // Assert the existing serialization, not just a synthetic formatter input.
      await t.test(
        "persistencia y API conservan instantes de creación, asignación y entrega",
        async () => {
          for (let i = 0; i < orders.length; i++) {
            const response = await fetch(
              `${apiOrigin}/api/v1/orders/${orders[i].idPedido}`,
              { headers: { Authorization: `Bearer ${tokens.CLIENTE}` } },
            );
            assert.equal(response.status, 200);
            assert.equal((await response.json()).fechaCreacion, instants[i]);
            const delivery = await fetch(
              `${apiOrigin}/api/v1/deliveries/${deliveries[i].idEntrega}`,
              { headers: { Authorization: `Bearer ${tokens.REPARTIDOR}` } },
            );
            assert.equal(delivery.status, 200);
            const data = await delivery.json();
            assert.equal(data.fechaAsignacion, instants[i]);
            assert.equal(data.fechaEntrega, "2026-11-19T06:02:00.000Z");
          }
        },
      );
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
            API_URL: `${apiOrigin}/api/v1`,
          },
          stdio: "ignore",
        },
      );
      await until(
        async () => {
          if (next.exitCode !== null)
            throw new Error("Next terminó antes de las pruebas de fechas");
          try {
            return (await fetch(`${origin}/login`)).ok;
          } catch {
            return false;
          }
        },
        "Next disponible",
        30000,
      );
      browser = await chrome();
      const navigate = async (path, selector) => {
        await browser.navigate(origin + path);
        await browser.wait(
          `location.pathname===${JSON.stringify(path)} && !!document.querySelector(${JSON.stringify(selector)})`,
          path,
        );
      };
      for (const zone of ["UTC", "America/Costa_Rica", "Asia/Tokyo"])
        await t.test(
          `historial, emprendedor y repartidor en ${zone}`,
          async () => {
            await browser.call("Emulation.setTimezoneOverride", {
              timezoneId: zone,
            });
            assert.equal(
              await browser.evaluate(
                "Intl.DateTimeFormat().resolvedOptions().timeZone",
              ),
              zone,
            );
            const session = async (rol) => {
              const result = await browser.call("Network.setCookie", {
                name: "chorotega_session",
                value: tokens[rol],
                url: origin,
                httpOnly: true,
                sameSite: "Lax",
              });
              assert.equal(result.success, true);
            };
            await session("CLIENTE");
            await navigate("/pedidos", ".order-card");
            for (let i = 0; i < orders.length; i++) {
              const text = await browser.evaluate(
                `Array.from(document.querySelectorAll('.order-card')).find(e=>e.querySelector('h2').textContent.trim()==='Pedido #${orders[i].idPedido}').querySelector('.order-detail dd').textContent.trim()`,
              );
              assert.equal(normalized(text), expected[i]);
            }
            await session("EMPRENDEDOR");
            await navigate(
              `/mi-negocio/tiendas/${store.idTienda}/pedidos`,
              "[data-managed-order]",
            );
            for (let i = 0; i < orders.length; i++) {
              const listed = await browser.evaluate(
                `document.querySelector('[data-managed-order="${orders[i].idPedido}"] time').textContent`,
              );
              assert.equal(normalized(listed), expected[i]);
            }
            for (let i = 0; i < orders.length; i++) {
              await navigate(
                `/mi-negocio/tiendas/${store.idTienda}/pedidos/${orders[i].idPedido}`,
                "[data-order-detail]",
              );
              const time = await browser.evaluate(
                "({iso:document.querySelector('[data-order-detail] time').dateTime,text:document.querySelector('[data-order-detail] time').textContent})",
              );
              assert.equal(time.iso, instants[i]);
              assert.equal(normalized(time.text), expected[i]);
            }
            await session("REPARTIDOR");
            await navigate("/mis-entregas", "[data-delivery]");
            for (let i = 0; i < deliveries.length; i++) {
              const time = await browser.evaluate(
                `document.querySelector('[data-delivery="${deliveries[i].idEntrega}"] time').textContent`,
              );
              assert.equal(normalized(time), expected[i]);
            }
            for (let i = 0; i < deliveries.length; i++) {
              await navigate(
                `/mis-entregas/${deliveries[i].idEntrega}`,
                "[data-delivery-detail]",
              );
              const times = await browser.evaluate(
                "Array.from(document.querySelectorAll('[data-delivery-detail] time')).map(e=>({iso:e.dateTime,text:e.textContent}))",
              );
              assert.equal(times[0].iso, instants[i]);
              assert.equal(normalized(times[0].text), expected[i]);
              assert.equal(times[1].iso, "2026-11-19T06:02:00.000Z");
              assert.equal(
                normalized(times[1].text),
                "19 nov 2026, 12:02 a. m.",
              );
            }
          },
        );
      await t.test(
        "las lecturas no modificaron las fechas persistidas",
        async () => {
          for (let i = 0; i < orders.length; i++) {
            assert.equal(
              (
                await ds
                  .getRepository(Order)
                  .findOneByOrFail({ idPedido: orders[i].idPedido })
              ).fechaCreacion.toISOString(),
              instants[i],
            );
            const d = await ds
              .getRepository(Delivery)
              .findOneByOrFail({ idEntrega: deliveries[i].idEntrega });
            assert.equal(d.fechaAsignacion.toISOString(), instants[i]);
            assert.equal(
              d.fechaEntrega.toISOString(),
              "2026-11-19T06:02:00.000Z",
            );
          }
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
          if (previousSecret === undefined) delete process.env.JWT_SECRET;
          else process.env.JWT_SECRET = previousSecret;
        }
      }
    }
  },
);
