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
const pure = load("lib/managed-products.ts");
const list = load("app/api/mi-negocio/tiendas/[id]/productos/route.ts");
const detail = load(
  "app/api/mi-negocio/tiendas/[id]/productos/[productoId]/route.ts",
);
const categories = load("app/api/mi-negocio/categorias/route.ts");
const store = {
  idTienda: 7,
  idEmprendedor: 42,
  nombre: "Negocio local",
  descripcion: null,
  direccion: "Prueba",
  telefono: null,
  horario: null,
  instagramUrl: null,
  facebookUrl: null,
  whatsappComercial: null,
  estado: "INACTIVA",
  fechaCreacion: "2026-01-01",
};
const product = {
  idProducto: 11,
  idTienda: 7,
  idCategoria: 3,
  version: 1,
  nombre: "Producto de prueba",
  descripcion: null,
  precio: "1500.00",
  cantidadDisponible: 5,
  estado: "ACTIVO",
  fechaPublicacion: "2026-01-01",
};
const category = {
  idCategoria: 3,
  nombre: "Categoría local",
  descripcion: null,
  estado: "ACTIVA",
};
const body = {
  nombre: "Nuevo",
  descripcion: null,
  idCategoria: 3,
  precio: 12.99,
  cantidadDisponible: 0,
  estado: "AGOTADO",
};
const context = (id = "7", productoId = "11") => ({
  params: Promise.resolve({ id, productoId }),
});
const request = (method = "GET", data, query = "", headers = {}) =>
  new NextRequest(
    "http://localhost/api/mi-negocio/tiendas/7/productos" + query,
    {
      method,
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    },
  );
const get = (query = "", id = "7") =>
  list.GET(request("GET", undefined, query), context(id));
const read = (id = "11", store = "7") =>
  detail.GET(request(), context(store, id));
const post = (data = body, headers = {}) =>
  list.POST(request("POST", data, "", headers), context());
const patch = (data, headers = {}) =>
  detail.PATCH(request("PATCH", data, "", headers), context());
const page = (rows, which = 0, size = 6, total = rows.length) => ({
  content: rows,
  page: which,
  size,
  totalElements: total,
  totalPages: Math.ceil(total / size),
});
function setup(custom, current = product) {
  calls = [];
  global.fetch = async (url, options) => {
    const u = new URL(url),
      method = options.method,
      sent = options.body ? JSON.parse(options.body) : undefined;
    calls.push({
      path: u.pathname,
      query: u.searchParams.toString(),
      method,
      body: sent,
      cache: options.cache,
    });
    if (u.pathname.endsWith("/auth/me"))
      return Response.json({
        idUsuario: 42,
        nombre: "Persona",
        apellido: "Temporal",
        correo: "owner@example.test",
        rol: role,
      });
    if (u.pathname.endsWith("/stores/7")) return Response.json(store);
    if (custom) {
      const response = await custom(u, options, sent);
      if (response) return response;
    }
    if (u.pathname === "/api/v1/products" && method === "GET")
      return Response.json(
        page(
          [current],
          Number(u.searchParams.get("page")),
          Number(u.searchParams.get("size")),
        ),
      );
    if (/^\/api\/v1\/products\/[0-9]+$/.test(u.pathname) && method === "GET")
      return Number(u.pathname.split("/").at(-1)) === current.idProducto
        ? Response.json(current)
        : Response.json({ detail: "private-not-found" }, { status: 404 });
    if (u.pathname === "/api/v1/products" && method === "POST")
      return Response.json(
        { ...current, ...sent, precio: sent.precio.toFixed(2) },
        { status: 201 },
      );
    if (u.pathname === "/api/v1/products/11" && method === "PATCH")
      return Response.json({
        ...current,
        ...sent,
        version: sent.version + 1,
        precio:
          sent.precio === undefined ? current.precio : sent.precio.toFixed(2),
      });
    if (u.pathname === "/api/v1/categories")
      return Response.json(page([category], 0, 100));
    if (u.pathname === "/api/v1/categories/3") return Response.json(category);
    throw new Error("Unexpected local API route");
  };
}
afterEach(() => {
  global.fetch = originalFetch;
  session = true;
  role = "EMPRENDEDOR";
});

test("precio textual y centavos son exactos antes del DTO numérico", async (t) => {
  for (const [input, expected] of [
    ["0.01", 1n],
    ["0,10", 10n],
    ["1.15", 115n],
    ["1500", 150000n],
    ["99999999.99", 9999999999n],
  ])
    await t.test(input, () => {
      const r = pure.priceInput(input);
      assert.equal(r.cents, expected);
      assert.equal(BigInt(r.number.toFixed(2).replace(".", "")), expected);
    });
  for (const input of [
    "0",
    "-1",
    "1.001",
    "1,001",
    "1e3",
    "Infinity",
    "NaN",
    "100000000.00",
    "1.500,00",
    "",
    "1 000",
    "+1",
    "0.001",
  ])
    assert.equal(pure.priceInput(input), null);
});
test("formulario PATCH conserva versión original y omite campos equivalentes", () => {
  const values = pure.productFormValues(product);
  assert.equal(
    pure.productFormBody({ ...values, precio: "1500" }, product).changed,
    false,
  );
  const r = pure.productFormBody(
    { ...values, descripcion: "Descripción", cantidadDisponible: "0" },
    product,
  );
  assert.deepEqual(r.body, {
    descripcion: "Descripción",
    cantidadDisponible: 0,
    version: 1,
  });
  assert.deepEqual(r.errors, {});
  assert.deepEqual(
    pure.productFormBody(
      {
        ...pure.productFormValues({ ...product, descripcion: "Anterior" }),
        descripcion: "",
      },
      { ...product, descripcion: "Anterior" },
    ).body,
    { descripcion: null, version: 1 },
  );
  assert.ok(
    pure.productFormBody({ ...values, precio: "1.001" }, product).errors.precio,
  );
});
test("validación no permite traslados, versión ausente ni PATCH vacío", () => {
  for (const field of [
    "idTienda",
    "idProducto",
    "idEmprendedor",
    "fechaPublicacion",
    "claveHash",
  ])
    assert.ok(pure.validateProductBody({ ...body, [field]: 9 }, false).form);
  assert.ok(pure.validateProductBody({ ...body, version: 1 }, false).form);
  assert.ok(pure.validateProductBody({ nombre: "Cambio" }, true).version);
  assert.ok(pure.validateProductBody({ version: 1 }, true).form);
  for (const version of [0, -1, 1.1, null, "1", 2147483648])
    assert.ok(
      pure.validateProductBody({ version, nombre: "Cambio" }, true).version,
    );
  for (const qty of [-1, 1.1, null, "2", 2147483648])
    assert.ok(
      pure.validateProductBody({ ...body, cantidadDisponible: qty }, false)
        .cantidadDisponible,
    );
  for (const price of [-1, 0, null, "1", NaN, Infinity, 1.001, 100000000])
    assert.ok(
      pure.validateProductBody({ ...body, precio: price }, false).precio,
    );
  assert.deepEqual(
    pure.validateProductBody({ version: 1, descripcion: null }, true),
    {},
  );
  assert.ok(
    pure.validateProductBody({ ...body, nombre: " ".repeat(2) }, false).nombre,
  );
  assert.ok(
    pure.validateProductBody({ ...body, nombre: "x".repeat(151) }, false)
      .nombre,
  );
  assert.ok(
    pure.validateProductBody({ ...body, descripcion: "x".repeat(501) }, false)
      .descripcion,
  );
});
test("sin JWT o con rol prohibido no se consulta ningún producto", async (t) => {
  setup();
  session = false;
  assert.equal((await get()).status, 401);
  assert.equal((await post()).status, 401);
  assert.equal(calls.length, 0);
  session = true;
  for (const current of ["CLIENTE", "ADMIN", "REPARTIDOR"])
    await t.test(current, async () => {
      role = current;
      setup();
      assert.equal((await get()).status, 403);
      assert.equal((await post()).status, 403);
      assert.equal((await read()).status, 403);
      assert.equal((await patch({ version: 1, nombre: "N" })).status, 403);
      assert.equal((await categories.GET(request())).status, 403);
      assert.ok(calls.every((c) => c.path.endsWith("/auth/me")));
    });
});
test("tienda propia inactiva y los tres estados se conservan en listado paginado", async () => {
  setup((u) =>
    u.pathname === "/api/v1/products"
      ? Response.json(
          page(
            [
              product,
              { ...product, idProducto: 12, estado: "INACTIVO" },
              {
                ...product,
                idProducto: 13,
                estado: "AGOTADO",
                cantidadDisponible: 0,
              },
            ],
            0,
            6,
          ),
        )
      : undefined,
  );
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    (await response.json()).content.map((p) => p.estado),
    ["ACTIVO", "INACTIVO", "AGOTADO"],
  );
  const query = new URLSearchParams(
    calls.find((c) => c.path.endsWith("/products")).query,
  );
  assert.equal(query.get("idTienda"), "7");
  assert.equal(query.has("estado"), false);
  assert.equal(query.has("disponible"), false);
  assert.ok(calls.every((c) => c.cache === "no-store"));
});
test("nombre literal se codifica y no admite filtros de tienda o estado", async () => {
  setup();
  for (const q of [
    "?idTienda=8",
    "?estado=ACTIVO",
    "?disponible=true",
    "?page=0&page=1",
    "?nombre=" + "x".repeat(151),
  ])
    assert.equal((await get(q)).status, 400);
  const term = "100%_\\local";
  assert.equal((await get("?nombre=" + encodeURIComponent(term))).status, 200);
  assert.equal(
    new URLSearchParams(
      calls.find((c) => c.path.endsWith("/products")).query,
    ).get("nombre"),
    term,
  );
});
test("detalle autentica, verifica tienda y consulta ID sin devolver un producto ajeno", async () => {
  setup((u) =>
    u.pathname === "/api/v1/products/123"
      ? Response.json({
          ...product,
          idProducto: 123,
          idTienda: 99,
          nombre: "Nombre ajeno privado",
        })
      : undefined,
  );
  const response = await read("123");
  assert.equal(response.status, 404);
  assert.doesNotMatch(
    await response.text(),
    /Nombre ajeno privado|idTienda|precio/,
  );
  assert.deepEqual(
    calls.map((c) => c.path),
    ["/api/v1/auth/me", "/api/v1/stores/7", "/api/v1/products/123"],
  );
  assert.ok(calls.every((c) => c.method === "GET" && c.cache === "no-store"));
  setup((u) =>
    u.pathname === "/api/v1/products/11"
      ? Response.json({
          ...product,
          idTienda: 99,
          nombre: "Nombre ajeno privado",
        })
      : undefined,
  );
  const rejected = await patch({ version: 1, nombre: "No permitido" });
  assert.equal(rejected.status, 404);
  assert.equal(
    calls.some((c) => c.method === "PATCH"),
    false,
  );
  assert.doesNotMatch(await rejected.text(), /Nombre ajeno privado/);
});
test("detalle de una tienda con más de 100 productos usa una única lectura por ID", async () => {
  const catalog = Array.from({ length: 10001 }, (_, i) => ({
    ...product,
    idProducto: i + 1,
  }));
  setup((u, options) => {
    if (
      options.method === "GET" &&
      /^\/api\/v1\/products\/[0-9]+$/.test(u.pathname)
    ) {
      const selected = catalog.find(
        (p) => p.idProducto === Number(u.pathname.split("/").at(-1)),
      );
      return selected
        ? Response.json(selected)
        : Response.json({}, { status: 404 });
    }
    if (u.pathname === "/api/v1/products")
      throw new Error("El detalle no debe recorrer el catálogo");
  });
  const r = await read("10001");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).product.idProducto, 10001);
  assert.deepEqual(
    calls.filter((c) => c.path.includes("/products")).map((c) => c.path),
    ["/api/v1/products/10001"],
  );
});
test("detalle mantiene ACTIVO, INACTIVO y AGOTADO sin filtrar disponibilidad", async (t) => {
  for (const estado of ["ACTIVO", "INACTIVO", "AGOTADO"])
    await t.test(estado, async () => {
      setup(undefined, { ...product, estado, cantidadDisponible: 0 });
      const response = await read();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        store,
        product: { ...product, estado, cantidadDisponible: 0 },
      });
    });
});
test("detalle inexistente, mal formado o de otro ID no expone respuesta interna", async () => {
  setup();
  const absent = await read("404");
  assert.equal(absent.status, 404);
  assert.doesNotMatch(await absent.text(), /private-not-found/);
  for (const data of [
    { ...product, idProducto: 99 },
    { ...product, version: null },
  ]) {
    setup((u) =>
      u.pathname === "/api/v1/products/11"
        ? Response.json({ ...data, secret: "private" })
        : undefined,
    );
    const response = await read();
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private|Producto de prueba/);
  }
});
test("tienda ajena devuelve 404 antes de consultar productos o categorías", async () => {
  setup();
  global.fetch = async (url) => {
    calls.push({ path: new URL(url).pathname });
    return String(url).endsWith("/auth/me")
      ? Response.json({
          idUsuario: 42,
          nombre: "P",
          apellido: "T",
          correo: "p@example.test",
          rol: "EMPRENDEDOR",
        })
      : Response.json({ ...store, idEmprendedor: 99 });
  };
  for (const r of [
    await get(),
    await post(),
    await read(),
    await patch({ version: 1, nombre: "N" }),
  ])
    assert.equal(r.status, 404);
  assert.equal(
    calls.some(
      (c) => c.path.includes("/products") || c.path.includes("/categories"),
    ),
    false,
  );
});
test("ID inválido y productos fuera de tienda no se exponen", async () => {
  setup();
  assert.equal((await read("invalid")).status, 400);
  setup((u) =>
    u.pathname === "/api/v1/products"
      ? Response.json(page([{ ...product, idTienda: 8 }], 0, 6))
      : undefined,
  );
  const r = await get();
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /Producto de prueba/);
});
test("POST deriva idTienda de la ruta y proyecta 201 y Location seguros", async () => {
  setup();
  const response = await post();
  assert.equal(response.status, 201);
  assert.equal(
    response.headers.get("location"),
    "/api/mi-negocio/tiendas/7/productos/11",
  );
  assert.deepEqual(calls.find((c) => c.method === "POST").body, {
    ...body,
    idTienda: 7,
  });
  assert.equal((await post({ ...body, idTienda: 8 })).status, 400);
});
test("nueva categoría inactiva se rechaza; inexistente mantiene 404", async () => {
  setup((u) =>
    u.pathname.endsWith("/categories/3")
      ? Response.json({ ...category, estado: "INACTIVA" })
      : undefined,
  );
  assert.equal((await post()).status, 400);
  assert.equal(
    calls.some((c) => c.method === "POST"),
    false,
  );
  setup((u) =>
    u.pathname.endsWith("/categories/3")
      ? Response.json({ detail: "private" }, { status: 404 })
      : undefined,
  );
  const r = await post();
  assert.equal(r.status, 404);
  assert.doesNotMatch(await r.text(), /private/);
});
test("PATCH parcial conserva categoría inactiva asignada y envía versión original", async () => {
  setup();
  const response = await patch({ version: 1, descripcion: null });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.find((c) => c.method === "PATCH").body, {
    version: 1,
    descripcion: null,
  });
  assert.equal(
    calls.some((c) => c.path.includes("/categories/")),
    false,
  );
});
test("409 se conserva aunque la lectura del BFF ya vea una versión mayor", async () => {
  setup(
    (u, options) =>
      options.method === "PATCH"
        ? Response.json({ detail: "private SQL" }, { status: 409 })
        : undefined,
    { ...product, version: 2 },
  );
  const response = await patch({ version: 1, cantidadDisponible: 9 });
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /Este producto cambió/);
  assert.equal(calls.find((c) => c.method === "PATCH").body.version, 1);
});
test("origen y JSON son obligatorios para escrituras", async () => {
  setup();
  for (const headers of [
    { origin: "null" },
    { origin: "" },
    { origin: "https://evil.test" },
    { "content-type": "text/plain" },
  ]) {
    assert.equal((await post(body, headers)).status, 403);
    assert.equal(
      (await patch({ version: 1, nombre: "N" }, headers)).status,
      403,
    );
  }
  assert.equal(
    calls.some((c) => ["POST", "PATCH"].includes(c.method)),
    false,
  );
});
test("categorías incluye inactivas para explicar asignaciones y solo DTOs explícitos", async () => {
  setup((u) =>
    u.pathname === "/api/v1/categories"
      ? Response.json(
          page(
            [
              category,
              {
                ...category,
                idCategoria: 4,
                estado: "INACTIVA",
                secret: "private",
              },
            ],
            0,
            100,
          ),
        )
      : undefined,
  );
  const response = await categories.GET(request());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.categories.length, 2);
  assert.equal(data.categories[1].secret, undefined);
});
test("respuestas de error desconocidas y red no filtran datos", async (t) => {
  for (const status of [400, 401, 403, 404, 409, 500])
    await t.test(String(status), async () => {
      setup((u, options) =>
        options.method === "PATCH"
          ? Response.json({ detail: "private-stack-token" }, { status })
          : undefined,
      );
      const r = await patch({ version: 1, nombre: "N" });
      assert.equal(r.status, status);
      assert.doesNotMatch(await r.text(), /private|stack|token/);
    });
  setup((u) => {
    if (u.pathname.endsWith("/products"))
      throw new TypeError("private-network");
  });
  const r = await get();
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /private/);
});
test("proyección exige versión y rechaza contratos rotos sin exponer relaciones", () => {
  const data = pure.projectManagedProduct({
    ...product,
    tienda: { secret: "private" },
    authId: "private",
  });
  assert.deepEqual(data, product);
  for (const value of [undefined, 0, "1", null])
    assert.equal(
      pure.projectManagedProduct({ ...product, version: value }),
      null,
    );
});
