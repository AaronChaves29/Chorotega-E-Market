import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { NextRequest } from "next/server.js";
const root = resolve(import.meta.dirname, ".."),
  originalFetch = global.fetch;
let session = true,
  role = "EMPRENDEDOR",
  calls = [];
function load(file) {
  const filename = resolve(root, file),
    local = createRequire(filename),
    exports = {};
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", "module", code)(
    (id) => {
      if (id === "server-only") return {};
      if (id === "next/headers")
        return {
          cookies: async () => ({
            get: () => (session ? { value: "opaque-local-test" } : undefined),
          }),
        };
      if (id === "@/lib/server-api")
        return { getApiUrl: () => "http://127.0.0.1:3999/api/v1" };
      if (id.startsWith("@/") || id.startsWith(".")) {
        const p = id.startsWith("@/")
          ? resolve(root, id.slice(2))
          : resolve(dirname(filename), id);
        return load(p + (existsSync(p + ".ts") ? ".ts" : ".tsx"));
      }
      return local(id);
    },
    exports,
    { exports },
  );
  return exports;
}
const pure = load("lib/managed-orders.ts");
const list = load("app/api/mi-negocio/tiendas/[id]/pedidos/route.ts");
const detail = load(
  "app/api/mi-negocio/tiendas/[id]/pedidos/[pedidoId]/route.ts",
);
const prepare = load(
  "app/api/mi-negocio/tiendas/[id]/pedidos/[pedidoId]/preparar/route.ts",
);
const store = {
  idTienda: 7,
  idEmprendedor: 42,
  nombre: "Tienda propia",
  estado: "INACTIVA",
  descripcion: null,
  direccion: "Dirección comercial",
  telefono: null,
  horario: null,
  instagramUrl: null,
  facebookUrl: null,
  whatsappComercial: null,
  fechaCreacion: "2026-01-01",
};
const order = {
  idPedido: 11,
  idCliente: 13,
  idTienda: 7,
  idBarrio: 1,
  estado: "CONFIRMADO",
  fechaCreacion: "2026-11-17T06:00:00.000Z",
  direccionEntrega: "Dirección sintética",
  subtotal: "30.75",
  tarifaEnvio: "1.00",
  total: "31.75",
  items: [
    {
      idDetalle: 1,
      idProducto: 2,
      cantidad: 3,
      precioUnitario: "10.25",
      subtotal: "30.75",
    },
  ],
};
const context = (id = "7", pedidoId = "11") => ({
  params: Promise.resolve({ id, pedidoId }),
});
const request = (method = "GET", body, query = "", headers = {}) =>
  new NextRequest("http://localhost/api/mi-negocio/tiendas/7/pedidos" + query, {
    method,
    headers: {
      Origin: "http://localhost",
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = (query = "", id = "7") =>
  list.GET(request("GET", undefined, query), context(id));
const read = (id = "11", store = "7", query = "") =>
  detail.GET(request("GET", undefined, query), context(store, id));
const patch = (body = {}, headers = {}, id = "11", store = "7", query = "") =>
  prepare.PATCH(request("PATCH", body, query, headers), context(store, id));
const page = (rows, which = 0, size = 6, total = rows.length) => ({
  content: rows,
  page: which,
  size,
  totalElements: total,
  totalPages: Math.ceil(total / size),
});
function setup(custom, current = order) {
  calls = [];
  global.fetch = async (url, options) => {
    const u = new URL(url),
      method = options.method,
      body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({
      path: u.pathname,
      query: u.searchParams.toString(),
      method,
      body,
      cache: options.cache,
    });
    if (u.pathname.endsWith("/auth/me"))
      return Response.json({
        idUsuario: 42,
        nombre: "Persona",
        apellido: "Prueba",
        correo: "owner@example.test",
        rol: role,
      });
    if (u.pathname === "/api/v1/stores/7") return Response.json(store);
    if (custom) {
      const response = await custom(u, options, body);
      if (response) return response;
    }
    if (u.pathname === "/api/v1/orders" && method === "GET")
      return Response.json(
        page(
          [current],
          Number(u.searchParams.get("page")),
          Number(u.searchParams.get("size")),
        ),
      );
    if (u.pathname === "/api/v1/orders/11" && method === "GET")
      return Response.json(current);
    if (u.pathname === "/api/v1/orders/11/prepare" && method === "PATCH")
      return Response.json({ ...current, estado: "PREPARANDO" });
    return Response.json({ detail: "private-missing" }, { status: 404 });
  };
}
afterEach(() => {
  global.fetch = originalFetch;
  session = true;
  role = "EMPRENDEDOR";
});
test("proyección explícita conserva importes históricos y excluye identidad personal", () => {
  const projected = pure.projectManagedOrder({
    ...order,
    cliente: { claveHash: "private" },
    token: "private",
  });
  assert.equal(projected.unidades, 3);
  assert.equal(projected.lineas, 1);
  assert.equal(projected.total, "31.75");
  assert.equal(projected.idCliente, undefined);
  assert.equal(projected.idBarrio, undefined);
  assert.equal(projected.cliente, undefined);
  const summary = pure.orderSummary(projected);
  assert.equal(summary.direccionEntrega, undefined);
  assert.equal(summary.items, undefined);
  assert.equal(summary.total, "31.75");
  for (const value of [
    { ...order, idPedido: 0 },
    { ...order, estado: "NUEVO" },
    { ...order, total: 31.75 },
    { ...order, total: "1.001" },
    { ...order, fechaCreacion: "invalid" },
    { ...order, items: [{ ...order.items[0], cantidad: -1 }] },
    { ...order, items: [order.items[0], order.items[0]] },
  ])
    assert.equal(pure.projectManagedOrder(value), null);
});
test("estados reales y pedidos sin detalles no inventan unidades", async (t) => {
  for (const estado of pure.orderStates)
    await t.test(estado, () =>
      assert.equal(
        pure.projectManagedOrder({ ...order, estado }).estado,
        estado,
      ),
    );
  assert.equal(
    pure.projectManagedOrder({
      ...order,
      items: [],
      subtotal: "0.00",
      tarifaEnvio: "0.00",
      total: "0.00",
    }).unidades,
    0,
  );
});
test("filtros permitidos, estado válido y orden fijo", () => {
  const params = pure.managedOrderParams(
    new URLSearchParams("page=2&size=6&estado=PREPARANDO"),
  );
  assert.equal(params.get("estado"), "PREPARANDO");
  assert.equal(params.get("sortBy"), "fechaCreacion");
  assert.equal(params.get("sortDirection"), "DESC");
  for (const query of [
    "idTienda=8",
    "idCliente=13",
    "idEmprendedor=42",
    "estado=INVALID",
    "page=-1",
    "size=101",
    "page=2147483648",
    "page=0&page=1",
    "sortBy=total",
  ])
    assert.equal(pure.managedOrderParams(new URLSearchParams(query)), null);
});
test("sin JWT no hay llamadas; roles no autorizados no consultan recursos", async (t) => {
  setup();
  session = false;
  assert.equal((await get()).status, 401);
  assert.equal((await read()).status, 401);
  assert.equal((await patch()).status, 401);
  assert.equal(calls.length, 0);
  session = true;
  for (const current of ["ADMIN", "CLIENTE", "REPARTIDOR"])
    await t.test(current, async () => {
      role = current;
      setup();
      assert.equal((await get()).status, 403);
      assert.equal((await read()).status, 403);
      assert.equal((await patch()).status, 403);
      assert.ok(calls.every((c) => c.path.endsWith("/auth/me")));
    });
});
test("listado impone tienda propia inactiva, conserva historial y cuenta en SQL", async () => {
  setup();
  const response = await get("?page=0&size=6&estado=CONFIRMADO");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.equal(data.store.estado, "INACTIVA");
  assert.equal(data.totalElements, 1);
  assert.equal(data.content[0].unidades, 3);
  assert.equal(data.content[0].idCliente, undefined);
  assert.equal(data.content[0].direccionEntrega, undefined);
  const call = calls.find((c) => c.path.endsWith("/orders")),
    q = new URLSearchParams(call.query);
  assert.equal(q.get("idTienda"), "7");
  assert.equal(q.get("estado"), "CONFIRMADO");
  assert.equal(q.has("idCliente"), false);
  assert.ok(calls.every((c) => c.cache === "no-store"));
});
test("parámetros/IDs manipulados no llegan a consultas de pedidos", async () => {
  setup();
  for (const q of [
    "?idTienda=8",
    "?idCliente=13",
    "?estado=CONFIRMADO&estado=CANCELADO",
    "?size=0",
    "?owner=42",
  ])
    assert.equal((await get(q)).status, 400);
  assert.equal((await read("invalid")).status, 400);
  assert.equal((await read("0")).status, 400);
  assert.equal((await read("11", "7", "?idTienda=8")).status, 400);
  assert.equal((await patch({}, {}, "0")).status, 400);
  assert.equal((await get("", "no")).status, 400);
  assert.equal(
    calls.some((c) => c.path.includes("/orders")),
    false,
  );
});
test("tienda ajena se rechaza antes de consultar pedido", async () => {
  setup((u) =>
    u.pathname.includes("/orders")
      ? (() => {
          throw new Error("No consultar");
        })()
      : undefined,
  );
  const previous = global.fetch;
  global.fetch = (url, opts) =>
    String(url).endsWith("/stores/7")
      ? Promise.resolve(Response.json({ ...store, idEmprendedor: 99 }))
      : previous(url, opts);
  for (const r of [await get(), await read(), await patch()])
    assert.equal(r.status, 404);
  assert.equal(
    calls.some((c) => c.path.includes("/orders")),
    false,
  );
});
test("GET por ID verifica tienda antes de devolver y PATCH no escribe otro negocio", async () => {
  setup(undefined, {
    ...order,
    idTienda: 8,
    direccionEntrega: "Dirección ajena privada",
  });
  for (const r of [await read(), await patch()]) {
    assert.equal(r.status, 404);
    assert.doesNotMatch(await r.text(), /Dirección ajena|31.75|idCliente/);
  }
  assert.equal(
    calls.some((c) => c.method === "PATCH"),
    false,
  );
  setup();
  const response = await read();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.order.direccionEntrega, order.direccionEntrega);
  assert.equal(data.order.idCliente, undefined);
  assert.deepEqual(
    calls.map((c) => c.path),
    ["/api/v1/auth/me", "/api/v1/stores/7", "/api/v1/orders/11"],
  );
});
test("listado con alcance o metadatos inconsistentes se rechaza sin datos", async () => {
  for (const body of [
    page([{ ...order, idTienda: 8 }]),
    { ...page([order]), totalPages: 99 },
  ]) {
    setup((u) =>
      u.pathname === "/api/v1/orders" ? Response.json(body) : undefined,
    );
    const r = await get();
    assert.equal(r.status, 502);
    assert.doesNotMatch(await r.text(), /Dirección|idPedido|31.75/);
  }
});
test("preparar exige objeto vacío, origen y JSON; no acepta estado ni propietario", async () => {
  setup();
  assert.equal(pure.emptyPrepareBody({}), true);
  for (const body of [
    null,
    [],
    "",
    { estado: "PREPARANDO" },
    { idTienda: 8 },
    { version: 1 },
  ])
    assert.equal((await patch(body)).status, 400);
  for (const headers of [
    { Origin: "null" },
    { Origin: "" },
    { Origin: "https://external.invalid" },
    { "Content-Type": "text/plain" },
  ])
    assert.equal((await patch({}, headers)).status, 403);
  assert.equal(
    (await patch({}, {}, "11", "7", "?estado=PREPARANDO")).status,
    400,
  );
  assert.equal(
    calls.some((c) => c.method === "PATCH"),
    false,
  );
});
test("PATCH reenvía solo {} y devuelve respuesta confirmada proyectada", async () => {
  setup();
  const response = await patch();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.order.estado, "PREPARANDO");
  assert.equal(data.order.subtotal, order.subtotal);
  assert.equal(data.order.items[0].precioUnitario, "10.25");
  assert.equal(data.order.idCliente, undefined);
  assert.deepEqual(
    calls.find((c) => c.method === "PATCH"),
    {
      path: "/api/v1/orders/11/prepare",
      query: "",
      method: "PATCH",
      body: {},
      cache: "no-store",
    },
  );
});
test("el BFF no duplica la decisión de transición del dominio", async (t) => {
  for (const estado of [
    "PENDIENTE",
    "PREPARANDO",
    "EN_CAMINO",
    "ENTREGADO",
    "CANCELADO",
  ])
    await t.test(estado, async () => {
      setup(
        (u, opts) =>
          opts.method === "PATCH"
            ? Response.json({ detail: "private" }, { status: 409 })
            : undefined,
        { ...order, estado },
      );
      const r = await patch();
      assert.equal(r.status, 409);
      assert.equal(calls.filter((c) => c.method === "PATCH").length, 1);
      assert.doesNotMatch(await r.text(), /private/);
    });
});
test("400/401/403/404/409/500 conservan código sin filtrar mensajes privados", async (t) => {
  for (const status of [400, 401, 403, 404, 409, 500])
    await t.test(String(status), async () => {
      setup((u, opts) =>
        opts.method === "PATCH"
          ? Response.json({ detail: "private SQL password" }, { status })
          : undefined,
      );
      const r = await patch();
      assert.equal(r.status, status);
      assert.doesNotMatch(await r.text(), /private|SQL|password/);
      if (status === 401)
        assert.match(r.headers.get("set-cookie"), /chorotega_session/);
    });
});
test("red/timeout y éxito contradictorio no se presentan como confirmación", async () => {
  setup((u, opts) => {
    if (opts.method === "PATCH") throw new TypeError("private-network");
  });
  let r = await patch();
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /private-network/);
  for (const value of [
    { ...order, estado: "CONFIRMADO" },
    { ...order, estado: "PREPARANDO", idTienda: 8 },
    { ...order, estado: "PREPARANDO", idPedido: 99 },
  ]) {
    setup((u, opts) =>
      opts.method === "PATCH" ? Response.json(value) : undefined,
    );
    r = await patch();
    assert.equal(r.status, 502);
  }
});
