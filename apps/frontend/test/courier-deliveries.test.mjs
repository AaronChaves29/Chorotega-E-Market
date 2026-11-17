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
  role = "REPARTIDOR",
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
const pure = load("lib/courier-deliveries.ts"),
  list = load("app/api/mis-entregas/route.ts"),
  detail = load("app/api/mis-entregas/[id]/route.ts"),
  start = load("app/api/mis-entregas/[id]/iniciar/route.ts"),
  complete = load("app/api/mis-entregas/[id]/completar/route.ts");
const initial = {
  idEntrega: 7,
  idPedido: 9,
  idRepartidor: 11,
  estado: "ASIGNADA",
  fechaAsignacion: "2026-11-17T10:00:00.000Z",
  fechaEntrega: null,
};
const context = (id) => ({ params: Promise.resolve({ id: id ?? "7" }) });
const req = (method = "GET", body, query = "", headers = {}) =>
  new NextRequest("http://localhost/api/mis-entregas" + query, {
    method,
    headers: {
      Origin: "http://localhost",
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = (query) => list.GET(req("GET", undefined, query));
const read = (id = "7", query = "") =>
  detail.GET(req("GET", undefined, query), context(id));
const post = (action = start, body = {}, headers = {}, id = "7", query = "") =>
  action.POST(req("POST", body, query, headers), context(id));
const page = (
  content = [initial],
  p = 0,
  size = 6,
  total = content.length,
) => ({
  content,
  page: p,
  size,
  totalElements: total,
  totalPages: Math.ceil(total / size),
});
function setup(custom) {
  calls = [];
  global.fetch = async (url, options) => {
    const u = new URL(url);
    calls.push({
      path: u.pathname,
      query: u.searchParams.toString(),
      method: options.method,
      body: options.body ? JSON.parse(options.body) : undefined,
      cache: options.cache,
      bearer: options.headers.has("authorization"),
    });
    if (custom) {
      const r = await custom(u, options);
      if (r) return r;
    }
    if (u.pathname.endsWith("/auth/me"))
      return Response.json({
        idUsuario: 42,
        nombre: "Persona",
        apellido: "Temporal",
        correo: "courier@example.test",
        rol: role,
      });
    if (u.pathname === "/api/v1/deliveries")
      return Response.json(
        page(
          [initial],
          Number(u.searchParams.get("page")),
          Number(u.searchParams.get("size")),
        ),
      );
    if (u.pathname === "/api/v1/deliveries/7") return Response.json(initial);
    if (u.pathname.endsWith("/start"))
      return Response.json({ ...initial, estado: "EN_CAMINO" });
    if (u.pathname.endsWith("/complete"))
      return Response.json({
        ...initial,
        estado: "ENTREGADA",
        fechaEntrega: "2026-11-17T11:00:00.000Z",
      });
    return Response.json({ detail: "synthetic-private" }, { status: 404 });
  };
}
afterEach(() => {
  global.fetch = originalFetch;
  session = true;
  role = "REPARTIDOR";
});

test("proyección de entregas conserva solo seis campos autorizados", () => {
  const d = pure.projectCourierDelivery({
    ...initial,
    direccionEntrega: "synthetic-private",
    token: "synthetic-private",
    repartidor: { usuario: {} },
  });
  assert.deepEqual(d, initial);
  for (const v of [
    null,
    [],
    {},
    { ...initial, idEntrega: 0 },
    { ...initial, idPedido: "9" },
    { ...initial, idRepartidor: -1 },
    { ...initial, estado: "ENTREGADO" },
    { ...initial, fechaAsignacion: "2026-02-30T10:00:00.000Z" },
    { ...initial, fechaEntrega: "2026-11-17T11:00:00.000Z" },
    { ...initial, estado: "ENTREGADA" },
    {
      ...initial,
      estado: "ENTREGADA",
      fechaEntrega: "2026-11-17T09:00:00.000Z",
    },
  ])
    assert.equal(pure.projectCourierDelivery(v), null);
  assert.equal(
    pure.deliveryDate(initial.fechaAsignacion).includes("2026"),
    true,
  );
});
test("cuatro estados de entrega, sin mezclarlos con los estados del pedido", async (t) => {
  for (const estado of pure.deliveryStates)
    await t.test(estado, () =>
      assert.equal(
        pure.projectCourierDelivery({
          ...initial,
          estado,
          fechaEntrega:
            estado === "ENTREGADA" ? "2026-11-17T11:00:00.000Z" : null,
        }).estado,
        estado,
      ),
    );
});
test("sin cookie todos los BFF fallan sin consultar Nest; ADMIN y otros roles no acceden", async (t) => {
  setup();
  session = false;
  for (const call of [get, read, () => post(), () => post(complete)]) {
    const r = await call();
    assert.equal(r.status, 401);
    assert.match(r.headers.get("set-cookie"), /chorotega_session=/);
  }
  assert.equal(calls.length, 0);
  session = true;
  for (const rol of ["ADMIN", "CLIENTE", "EMPRENDEDOR"])
    await t.test(rol, async () => {
      setup();
      role = rol;
      for (const call of [get, read, () => post(), () => post(complete)])
        assert.equal((await call()).status, 403);
      assert(calls.every((c) => c.path === "/api/v1/auth/me"));
    });
});
test("listado impone orden y paginación sin aceptar una identidad de repartidor", async () => {
  setup();
  const r = await get("?page=0&size=1&estado=ASIGNADA");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const out = await r.json();
  assert.deepEqual(out.content, [initial]);
  assert.equal(out.size, 1);
  const c = calls.at(-1),
    q = new URLSearchParams(c.query);
  assert.equal(q.get("sortBy"), "fechaAsignacion");
  assert.equal(q.get("sortDirection"), "DESC");
  assert(!q.has("idRepartidor"));
  assert.equal(c.cache, "no-store");
  assert(calls.every((c) => c.bearer));
});
test("parámetros desconocidos o manipulados no llegan a entregas", async (t) => {
  for (const query of [
    "idRepartidor=11",
    "idUsuario=42",
    "idPedido=9",
    "sortBy=idEntrega",
    "estado=ENTREGADO",
    "estado=ASIGNADA&estado=EN_CAMINO",
    "page=-1",
    "page=1.1",
    "page=1e2",
    "page=2147483648",
    "size=0",
    "size=101",
    "size=a",
    "page=0&page=1",
  ])
    await t.test(query, async () => {
      setup();
      assert.equal((await get("?" + query)).status, 400);
      assert.equal(calls.length, 1);
    });
});
test("listados vacíos y sin registro asociado conservan conteos reales", async () => {
  setup((u) =>
    u.pathname === "/api/v1/deliveries" ? Response.json(page([])) : null,
  );
  assert.deepEqual((await (await get()).json()).content, []);
});
test("rechaza páginas contradictorias, filas inválidas y filtros incumplidos", async (t) => {
  for (const data of [
    page([initial], 1),
    page([initial], 0, 7),
    { ...page(), totalPages: 99 },
    { ...page(), totalElements: -1 },
    page([{ ...initial, estado: "CONFIRMADO" }]),
    page([initial, initial]),
    page([], 0, 6, 1),
    page([{ ...initial, estado: "CANCELADA" }]),
  ])
    await t.test(String(JSON.stringify(data).length), async () => {
      setup((u) =>
        u.pathname === "/api/v1/deliveries" ? Response.json(data) : null,
      );
      assert.equal((await get("?estado=ASIGNADA")).status, 502);
    });
});
test("detalle consulta directamente ID; entrega ajena o inexistente no filtra datos", async () => {
  setup();
  assert.deepEqual(await (await read()).json(), initial);
  assert.equal(calls.at(-1).path, "/api/v1/deliveries/7");
  setup((u) =>
    u.pathname.startsWith("/api/v1/deliveries/")
      ? Response.json(
          { token: "synthetic-private", detail: "SQL synthetic-private" },
          { status: 404 },
        )
      : null,
  );
  const r = await read("123");
  assert.equal(r.status, 404);
  assert(!JSON.stringify(await r.json()).includes("synthetic-private"));
});
test("IDs y queries de detalle/escritura se validan antes de consultar entregas", async (t) => {
  for (const id of ["0", "-1", "1e2", "1.2", "2147483648", "7/start", "7?x=1"])
    await t.test(id, async () => {
      setup();
      assert.equal((await read(id)).status, 400);
      assert.equal((await post(start, {}, {}, id)).status, 400);
      assert.equal(calls.length, 2);
    });
  setup();
  assert.equal((await read("7", "?estado=ASIGNADA")).status, 400);
  assert.equal((await post(start, {}, {}, "7", "?idRepartidor=1")).status, 400);
});
test("Origin y Content-Type son obligatorios en ambos POST", async (t) => {
  for (const headers of [
    { Origin: "null" },
    { Origin: "https://external.example" },
    { Origin: "" },
    { "Content-Type": "text/plain" },
    { "Content-Type": "" },
  ])
    await t.test(JSON.stringify(headers), async () => {
      setup();
      for (const action of [start, complete])
        assert.equal((await post(action, {}, headers)).status, 403);
      assert(calls.every((c) => c.path.endsWith("/auth/me")));
    });
});
test("solo cuerpo vacío; no se admiten estado, idRepartidor ni arrays", async (t) => {
  for (const body of [
    null,
    [],
    1,
    "",
    { estado: "ENTREGADA" },
    { idRepartidor: 11 },
    { x: null },
  ])
    await t.test(JSON.stringify(body), async () => {
      setup();
      for (const action of [start, complete])
        assert.equal((await post(action, body)).status, 400);
      assert(calls.every((c) => c.path.endsWith("/auth/me")));
    });
  setup();
  const malformed = new NextRequest(
    "http://localhost/api/mis-entregas/7/iniciar",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: "{",
    },
  );
  assert.equal((await start.POST(malformed, context())).status, 400);
});
test("iniciar y completar usan POST exacto sin prelectura ni campos arbitrarios", async () => {
  for (const [action, path, state] of [
    [start, "start", "EN_CAMINO"],
    [complete, "complete", "ENTREGADA"],
  ]) {
    setup();
    const r = await post(action);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).estado, state);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.at(-1).body, {});
    assert.equal(calls.at(-1).method, "POST");
    assert.equal(calls.at(-1).path, `/api/v1/deliveries/7/${path}`);
  }
});
test("conserva 400/401/403/404/409 y sanea fallos sin reintentar POST", async (t) => {
  for (const code of [400, 401, 403, 404, 409, 500, 502, 503, 504])
    await t.test(String(code), async () => {
      setup((u) =>
        u.pathname.includes("/deliveries")
          ? Response.json(
              { detail: "SQL synthetic-private", token: "synthetic-private" },
              { status: code },
            )
          : null,
      );
      const r = await post();
      assert.equal(r.status, [503, 504].includes(code) ? 502 : code);
      assert(!JSON.stringify(await r.json()).includes("synthetic-private"));
      assert.equal(calls.filter((c) => c.method === "POST").length, 1);
      assert.equal(r.headers.has("set-cookie"), code === 401);
    });
});
test("identidad inactiva/rol vigente y fallos de identidad se comprueban antes de entregas", async () => {
  setup((u) =>
    u.pathname.endsWith("/auth/me") ? Response.json({}, { status: 401 }) : null,
  );
  assert.equal((await get()).status, 401);
  assert.equal(calls.length, 1);
  setup((u) =>
    u.pathname.endsWith("/auth/me") ? Response.json({}, { status: 500 }) : null,
  );
  const r = await get();
  assert.equal(r.status, 502);
  assert(!r.headers.has("set-cookie"));
  assert.equal(calls.length, 1);
  setup();
  role = "CLIENTE";
  assert.equal((await post()).status, 403);
});
test("contratos incorrectos y red producen error seguro sin asumir confirmación", async (t) => {
  for (const action of [start, complete])
    await t.test(action === start ? "start" : "complete", async () => {
      for (const response of [
        Response.json(initial),
        Response.json({ ...initial, idEntrega: 8, estado: "EN_CAMINO" }),
        Response.json({ ...initial, estado: "ENTREGADA", fechaEntrega: null }),
        new Response("synthetic-private", { status: 200 }),
        Response.json(initial, { status: 201 }),
      ]) {
        setup((u) => (u.pathname.includes("/deliveries") ? response : null));
        const r = await post(action);
        assert.equal(r.status, 502);
        assert(!JSON.stringify(await r.json()).includes("synthetic-private"));
      }
    });
  setup((u) => {
    if (u.pathname.includes("/deliveries"))
      throw new TypeError("synthetic-private");
  });
  assert.equal((await read()).status, 502);
  assert.equal((await post()).status, 502);
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
});
