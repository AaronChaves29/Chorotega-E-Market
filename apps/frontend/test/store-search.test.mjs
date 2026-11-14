import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const originalFetch = global.fetch;
let session = "local-test-session";
function load(file) {
  const filename = resolve(root, file);
  const exports = {};
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const localRequire = createRequire(filename);
  new Function("require", "exports", "module", code)(
    (id) => {
      if (id === "server-only") return {};
      if (id === "next/headers")
        return {
          cookies: async () => ({
            get: () => (session ? { value: session } : undefined),
          }),
        };
      if (id === "@/lib/server-api")
        return { getApiUrl: () => "http://127.0.0.1:3999/api/v1" };
      if (id.startsWith("@/")) return load(`${id.slice(2)}.ts`);
      return localRequire(id);
    },
    exports,
    { exports },
  );
  return exports;
}
const { storeSearchParams, isStorePage } = load("lib/store-search.ts");
const request = (query = "") => ({
  nextUrl: new URL(`http://localhost/api/stores?${query}`),
});
afterEach(() => {
  global.fetch = originalFetch;
  session = "local-test-session";
});

test("preserva defaults del formulario de pedidos y fija tiendas activas", () => {
  assert.deepEqual(
    Object.fromEntries(storeSearchParams(new URLSearchParams())),
    {
      page: "0",
      size: "20",
      estado: "ACTIVA",
      sortBy: "nombre",
      sortDirection: "ASC",
    },
  );
});
test("busca nombres literales sin interpolar parámetros y admite orden compatible", () => {
  const input = new URLSearchParams({
    nombre: "  Taller 100%_ & Nicoya  ",
    page: "2",
    size: "6",
    sortBy: "idTienda",
    sortDirection: "DESC",
  });
  const parsed = storeSearchParams(input);
  assert.equal(parsed.get("nombre"), "Taller 100%_ & Nicoya");
  assert.equal(parsed.get("page"), "2");
  assert.equal(parsed.get("size"), "6");
  assert.equal(parsed.get("sortBy"), "idTienda");
  assert.equal(parsed.get("sortDirection"), "DESC");
  assert.equal(
    new URLSearchParams(parsed.toString()).get("nombre"),
    "Taller 100%_ & Nicoya",
  );
});
test("whitelist ignora parámetros que podrían alterar estado, propietario o SQL", () => {
  const parsed = storeSearchParams(
    new URLSearchParams("estado=INACTIVA&idEmprendedor=99&sql=DROP&page=0"),
  );
  assert.equal(parsed.get("estado"), "ACTIVA");
  assert.equal(parsed.has("idEmprendedor"), false);
  assert.equal(parsed.has("sql"), false);
});
test("rechaza páginas, tamaños, nombres, duplicados y columnas de orden inválidos", async (t) => {
  for (const query of [
    "page=-1",
    "page=1.2",
    "page=1e2",
    "page=abc",
    "page=9007199254740991&size=100",
    "size=0",
    "size=101",
    "size=2.5",
    "sortBy=claveHash",
    "sortBy=nombre%3BDROP",
    "sortDirection=asc",
    "sortDirection=invalid",
    "page=0&page=1",
    "nombre=a&nombre=b",
    `nombre=${"a".repeat(151)}`,
  ]) {
    await t.test(query.slice(0, 60), async () => {
      global.fetch = () =>
        assert.fail("No debe enviar una query inválida al backend");
      const response = await load("app/api/stores/route.ts").GET(
        request(query),
      );
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});
test("intermediario autentica y combina filtros, ordenamiento y paginación", async () => {
  global.fetch = async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, "http://127.0.0.1:3999");
    assert.equal(target.pathname, "/api/v1/stores");
    assert.deepEqual(Object.fromEntries(target.searchParams), {
      page: "1",
      size: "6",
      estado: "ACTIVA",
      sortBy: "nombre",
      sortDirection: "DESC",
      nombre: "Alfarería",
    });
    assert.equal(
      options.headers.get("Authorization"),
      "Bearer local-test-session",
    );
    assert.equal(options.cache, "no-store");
    return Response.json({
      content: [],
      page: 1,
      size: 6,
      totalElements: 0,
      totalPages: 0,
    });
  };
  const response = await load("app/api/stores/route.ts").GET(
    request("nombre=Alfarer%C3%ADa&page=1&size=6&sortDirection=DESC"),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("sesión ausente o rechazada produce 401 y limpia cookie sin filtrar credenciales", async () => {
  session = undefined;
  global.fetch = () => assert.fail("No debe consultar sin cookie");
  let response = await load("app/api/stores/route.ts").GET(request());
  assert.equal(response.status, 401);
  session = "local-test-session";
  global.fetch = async () =>
    Response.json({ token: session, sql: "private" }, { status: 401 });
  response = await load("app/api/stores/route.ts").GET(request());
  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie"), /chorotega_session=;/);
  assert.doesNotMatch(await response.text(), /local-test-session|private/);
});
test("fallos HTTP y de conexión conservan sesión y ocultan errores internos", async () => {
  for (const status of [403, 500, 503]) {
    global.fetch = async () =>
      Response.json({ detail: "private-sql" }, { status });
    const response = await load("app/api/stores/route.ts").GET(request());
    assert.equal(response.status, status);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await response.text(), /private-sql/);
  }
  global.fetch = async () => {
    throw new Error("private-network");
  };
  const response = await load("app/api/stores/route.ts").GET(request());
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private-network/);
});
test("valida páginas vacías y datos reales antes de renderizar; rechaza contratos rotos", () => {
  const page = {
    content: [],
    page: 0,
    size: 6,
    totalElements: 0,
    totalPages: 0,
  };
  assert.equal(isStorePage(page), true);
  const store = {
    idTienda: 1,
    nombre: "<script>texto</script>",
    descripcion: null,
    direccion: "Nicoya",
    estado: "ACTIVA",
  };
  assert.equal(
    isStorePage({ ...page, content: [store], totalElements: 1, totalPages: 1 }),
    true,
  );
  for (const invalid of [
    null,
    [],
    { ...page, size: 0 },
    { ...page, totalPages: 3 },
    { ...page, content: [{}] },
    { ...page, content: [{ ...store, estado: "INACTIVA" }] },
  ])
    assert.equal(isStorePage(invalid), false);
});
