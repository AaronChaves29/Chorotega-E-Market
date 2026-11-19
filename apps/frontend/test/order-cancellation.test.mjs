import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { NextRequest } from "next/server.js";
const root = resolve(import.meta.dirname, ".."),
  originalFetch = global.fetch;
let session = true,
  role = "CLIENTE",
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
  new Function("require", "exports", code)((id) => {
    if (id === "server-only") return {};
    if (id === "next/headers")
      return {
        cookies: async () => ({
          get: () => (session ? { value: "opaque-local" } : undefined),
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
  }, exports);
  return exports;
}
const patch = load("app/api/orders/[id]/cancel/route.ts").PATCH,
  get = load("app/api/orders/[id]/route.ts").GET;
const order = {
  idPedido: 7,
  idCliente: 3,
  idTienda: 1,
  estado: "CONFIRMADO",
  fechaCreacion: "2026-11-19T06:00:00.000Z",
  direccionEntrega: "Dirección sintética",
  subtotal: "10.00",
  tarifaEnvio: "1.00",
  total: "11.00",
  items: [],
};
function setup(custom) {
  calls = [];
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({
      path,
      method: options.method,
      body: options.body,
      cache: options.cache,
    });
    if (path.endsWith("/auth/me"))
      return Response.json({
        idUsuario: 3,
        nombre: "Persona",
        apellido: "Temporal",
        correo: "local@example.test",
        rol: role,
      });
    return (
      custom?.(path, options) ??
      Response.json(
        path.endsWith("/cancel") ? { ...order, estado: "CANCELADO" } : order,
      )
    );
  };
}
const context = (id) => ({ params: Promise.resolve({ id }) });
const send = (body = {}, headers = {}, id = "7", query = "") =>
  patch(
    new NextRequest(`http://localhost/api/orders/${id}/cancel${query}`, {
      method: "PATCH",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    context(id),
  );
const read = (id = "7") =>
  get(new NextRequest(`http://localhost/api/orders/${id}`), context(id));
afterEach(() => {
  global.fetch = originalFetch;
  session = true;
  role = "CLIENTE";
});
test("CLIENTE: usa identidad actual, reenvía solo {}, no-store y devuelve proyección sin JWT", async () => {
  setup();
  const r = await send();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const data = await r.json();
  assert.equal(data.order.estado, "CANCELADO");
  assert.equal(data.order.idCliente, undefined);
  assert.equal(data.order.total, order.total);
  assert.equal(calls.find((c) => c.method === "PATCH").body, "{}");
});
test("sin sesión y otros roles no acceden a pedidos", async () => {
  setup();
  session = false;
  assert.equal((await send()).status, 401);
  assert.equal(calls.length, 0);
  session = true;
  for (const rol of ["ADMIN", "EMPRENDEDOR", "REPARTIDOR"]) {
    role = rol;
    setup();
    assert.equal((await send()).status, 403);
    assert(calls.every((c) => c.path.endsWith("/auth/me")));
  }
});
test("origen, JSON, campos extra, parámetros e ID manipulados se rechazan antes de escribir", async () => {
  setup();
  for (const h of [
    { Origin: "null" },
    { Origin: "https://foreign.invalid" },
    { "Content-Type": "text/plain" },
  ])
    assert.equal((await send({}, h)).status, 403);
  for (const b of [{ idCliente: 9 }, { estado: "CANCELADO" }, [], null])
    assert.equal((await send(b)).status, 400);
  assert.equal((await send({}, {}, "0")).status, 400);
  assert.equal((await send({}, {}, "7", "?idCliente=9")).status, 400);
  assert(!calls.some((c) => c.method === "PATCH"));
});
test("pedido ajeno nunca llega al PATCH ni expone datos", async () => {
  setup(() => Response.json({ ...order, idCliente: 99 }));
  const r = await send();
  assert.equal(r.status, 404);
  assert(!calls.some((c) => c.method === "PATCH"));
  assert.doesNotMatch(await r.text(), /Dirección/);
});
test("lectura segura consulta estado real sin mutación y excluye identidad personal", async () => {
  setup(() => Response.json({ ...order, estado: "CANCELADO" }));
  const r = await read();
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.order.estado, "CANCELADO");
  assert.equal(data.order.idCliente, undefined);
  assert(calls.every((c) => c.method === "GET"));
});
for (const status of [400, 401, 403, 404, 409, 500])
  test(`HTTP ${status} no filtra mensajes privados ni reintenta`, async () => {
    setup((path, options) =>
      options.method === "PATCH"
        ? Response.json({ detail: "private SQL secret" }, { status })
        : undefined,
    );
    const r = await send();
    assert.equal(r.status, status === 500 ? 502 : status);
    assert.doesNotMatch(await r.text(), /private|SQL|secret/);
    assert.equal(calls.filter((c) => c.method === "PATCH").length, 1);
  });
test("respuesta perdida y éxito contradictorio no se presentan como confirmación", async () => {
  setup((path, options) => {
    if (options.method === "PATCH") throw new Error("private network");
  });
  assert.equal((await send()).status, 502);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 1);
  setup((path, options) =>
    options.method === "PATCH"
      ? Response.json({ ...order, estado: "CONFIRMADO" })
      : undefined,
  );
  assert.equal((await send()).status, 502);
});
