import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const originalFetch = global.fetch;
let session = "local-detail-test";
function load(file) {
  const filename = resolve(root, file);
  const localRequire = createRequire(filename),
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
const { positiveId, storeProductParams, isStoreProductPage, productPrice } =
  load("lib/store-detail.ts");
const store = {
  idTienda: 7,
  nombre: "Tienda temporal",
  descripcion: null,
  direccion: "Nicoya",
  telefono: null,
  horario: null,
  estado: "ACTIVA",
};
const product = {
  idProducto: 1,
  idTienda: 7,
  nombre: "Producto temporal",
  descripcion: null,
  precio: "11000.05",
  cantidadDisponible: 3,
  estado: "ACTIVO",
};
const page = {
  content: [product],
  page: 0,
  size: 6,
  totalElements: 1,
  totalPages: 1,
};
const context = (id = "7") => ({ params: Promise.resolve({ id }) });
const request = (query = "") => ({
  nextUrl: new URL(`http://localhost/api/stores/7/products?${query}`),
});
const detail = () => load("app/api/stores/[id]/route.ts").GET;
const products = () => load("app/api/stores/[id]/products/route.ts").GET;
afterEach(() => {
  global.fetch = originalFetch;
  session = "local-detail-test";
});

test("ID positivo normalizado dentro del rango PostgreSQL", async (t) => {
  assert.equal(positiveId("007"), 7);
  assert.equal(positiveId("2147483647"), 2147483647);
  for (const id of ["0", "-1", "1.5", "1e2", "abc", "", "2147483648", "7/../8"])
    await t.test(`rechaza ${id}`, async () => {
      global.fetch = () => assert.fail("No debe llamar al backend");
      assert.equal((await detail()(request(), context(id))).status, 400);
      assert.equal((await products()(request(), context(id))).status, 400);
    });
});
test("consulta individual autentica en servidor y solo publica campos de la vista", async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:3999/api/v1/stores/7");
    assert.equal(
      options.headers.get("Authorization"),
      "Bearer local-detail-test",
    );
    assert.equal(options.cache, "no-store");
    return Response.json({
      ...store,
      authId: "never-forward",
      claveHash: "never-forward",
      emprendedor: { private: true },
    });
  };
  const response = await detail()(request(), context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), store);
});
test("tienda inexistente o inactiva produce 404 y no consulta productos", async () => {
  for (const inactive of [true, false]) {
    global.fetch = async (url) => {
      assert.ok(url.endsWith("/stores/7"));
      return Response.json(inactive ? { ...store, estado: "INACTIVA" } : {}, {
        status: inactive ? 200 : 404,
      });
    };
    assert.equal((await detail()(request(), context())).status, 404);
    assert.equal((await products()(request(), context())).status, 404);
  }
});
test("sin sesión o JWT rechazado: 401, cookie eliminada y sin datos privados", async () => {
  for (const missing of [true, false]) {
    session = missing ? undefined : "local-detail-test";
    global.fetch = async () => {
      assert.equal(missing, false);
      return Response.json({ token: "never-forward" }, { status: 401 });
    };
    for (const handler of [detail(), products()]) {
      const response = await handler(request(), context());
      assert.equal(response.status, 401);
      assert.match(response.headers.get("set-cookie"), /chorotega_session=;/);
      assert.doesNotMatch(
        await response.text(),
        /never-forward|local-detail-test/,
      );
    }
  }
});
test("errores del backend o red no filtran SQL, detalles ni eliminan sesión válida", async () => {
  for (const status of [400, 403, 500, 503]) {
    global.fetch = async () =>
      Response.json(
        { detail: "private-sql", stack: "private-stack" },
        { status },
      );
    const response = await detail()(request(), context());
    assert.equal(response.status, status);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.doesNotMatch(await response.text(), /private-/);
  }
  global.fetch = async () => {
    throw new Error("private-network");
  };
  assert.equal((await detail()(request(), context())).status, 502);
});
test("defaults propios del detalle incluyen activos sin stock y no alteran /api/products", () => {
  assert.deepEqual(
    Object.fromEntries(storeProductParams(new URLSearchParams(), 7)),
    {
      idTienda: "7",
      page: "0",
      size: "6",
      estado: "ACTIVO",
      sortBy: "nombre",
      sortDirection: "ASC",
    },
  );
  const parsed = storeProductParams(
    new URLSearchParams(
      "page=1&size=3&sortBy=precio&sortDirection=DESC&soloDisponibles=true",
    ),
    7,
  );
  assert.equal(parsed.get("disponible"), "true");
  assert.equal(parsed.get("sortBy"), "precio");
  assert.equal(parsed.get("page"), "1");
});
test("rechaza filtros inexistentes, cambios de tienda y ordenamiento inseguro", async (t) => {
  for (const query of [
    "idTienda=8",
    "estado=INACTIVO",
    "desconocido=jarra",
    "sortBy=claveHash",
    "sortDirection=DROP",
    "soloDisponibles=yes",
    "page=-1",
    "page=1.5",
    "page=9007199254740991&size=100",
    "size=0",
    "size=101",
    "page=0&page=1",
    "sortBy=nombre&sortBy=precio",
  ])
    await t.test(query, async () => {
      global.fetch = () => assert.fail("No debe llamar al backend");
      assert.equal((await products()(request(query), context())).status, 400);
    });
});
test("productos parametrizados por tienda, paginación y precio, sin extras internos", async () => {
  global.fetch = async (url, options) => {
    assert.equal(
      options.headers.get("Authorization"),
      "Bearer local-detail-test",
    );
    if (url.endsWith("/stores/7")) return Response.json(store);
    const query = new URL(url).searchParams;
    assert.equal(query.get("idTienda"), "7");
    assert.equal(query.get("sortBy"), "precio");
    assert.equal(query.get("sortDirection"), "DESC");
    assert.equal(query.get("estado"), "ACTIVO");
    assert.equal(query.get("disponible"), "true");
    return Response.json({
      ...page,
      secret: "never-forward",
      content: [
        { ...product, tienda: { private: true }, token: "never-forward" },
      ],
    });
  };
  const response = await products()(
    request("sortBy=precio&sortDirection=DESC&soloDisponibles=true"),
    context(),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), page);
});
test("respuesta vacía válida y contrato o tienda contradictorios fallan de forma segura", async () => {
  let body = { content: [], page: 0, size: 6, totalElements: 0, totalPages: 0 };
  global.fetch = async (url) =>
    Response.json(url.endsWith("/stores/7") ? store : body);
  assert.equal((await products()(request(), context())).status, 200);
  for (const invalid of [
    { ...page, content: [{ ...product, idTienda: 8 }] },
    { ...page, size: 20 },
    { ...page, page: 1 },
    { ...page, totalPages: 3 },
    { ...page, content: [{ ...product, precio: 100 }] },
    { ...page, content: [{ ...product, estado: "INACTIVO" }] },
  ]) {
    body = invalid;
    assert.equal((await products()(request(), context())).status, 502);
  }
  global.fetch = async () => Response.json({ ...store, idTienda: 8 });
  assert.equal((await detail()(request(), context())).status, 502);
});
test("401 al consultar productos y 500 no exponen errores ni identidad", async () => {
  for (const status of [401, 500]) {
    global.fetch = async (url) =>
      Response.json(
        url.endsWith("/stores/7") ? store : { token: "never-forward" },
        { status: url.endsWith("/stores/7") ? 200 : status },
      );
    const response = await products()(request(), context());
    assert.equal(response.status, status);
    assert.equal(response.headers.has("set-cookie"), status === 401);
    assert.doesNotMatch(await response.text(), /never-forward/);
  }
});
test("precios string conservan céntimos y stock se valida sin inferencias visuales", () => {
  for (const value of ["1.05", "11000.05", "99999999.99"])
    assert.equal(
      productPrice(value),
      new Intl.NumberFormat("es-CR", {
        style: "currency",
        currency: "CRC",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value)),
    );
  assert.ok(
    isStoreProductPage(
      { ...page, content: [{ ...product, cantidadDisponible: 0 }] },
      7,
    ),
  );
  assert.equal(
    isStoreProductPage(
      { ...page, content: [{ ...product, cantidadDisponible: -1 }] },
      7,
    ),
    false,
  );
});

test("nombre y fecha se transmiten sin perder el ámbito, y se rechazan duplicados o longitudes excesivas", () => {
  const query = storeProductParams(
    new URLSearchParams({
      nombre: "  CAFÉ 100%_\\  ",
      sortBy: "fechaPublicacion",
      sortDirection: "DESC",
    }),
    7,
  );
  assert.equal(query.get("nombre"), "CAFÉ 100%_\\");
  assert.equal(query.get("sortBy"), "fechaPublicacion");
  assert.equal(query.get("idTienda"), "7");
  assert.equal(query.get("estado"), "ACTIVO");
  for (const input of ["nombre=a&nombre=b", "nombre=" + "a".repeat(151)])
    assert.equal(storeProductParams(new URLSearchParams(input), 7), null);
});

test("fallo de red al consultar productos conserva la sesión y oculta detalles", async () => {
  global.fetch = async (url) => {
    if (url.endsWith("/stores/7")) return Response.json(store);
    throw new Error("private-network-connection");
  };
  const response = await products()(request("nombre=Café"), context());
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.doesNotMatch(await response.text(), /private-network/);
});
