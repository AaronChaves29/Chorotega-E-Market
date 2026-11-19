import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { NextRequest } from "next/server.js";

const root = resolve(import.meta.dirname, "..");
const originalFetch = global.fetch;
let session = true,
  role = "EMPRENDEDOR",
  calls = [],
  handler;
function load(file) {
  const filename = resolve(root, file),
    local = createRequire(filename),
    exports = {};
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  new Function("require", "exports", "module", code)(
    (id) => {
      if (id === "server-only") return {};
      if (id === "next/headers")
        return {
          cookies: async () => ({
            get: () =>
              session ? { value: "opaque-local-fixture" } : undefined,
          }),
        };
      if (id === "@/lib/server-api")
        return { getApiUrl: () => "http://127.0.0.1:3999/api/v1" };
      if (id.startsWith("@/") || id.startsWith(".")) {
        const target = id.startsWith("@/")
          ? resolve(root, id.slice(2))
          : resolve(dirname(filename), id);
        return load(target + (existsSync(target + ".ts") ? ".ts" : ".tsx"));
      }
      return local(id);
    },
    exports,
    { exports },
  );
  return exports;
}
const pure = load("lib/managed-stores.ts");
const list = load("app/api/mi-negocio/tiendas/route.ts");
const detail = load("app/api/mi-negocio/tiendas/[id]/route.ts");
const store = {
  idTienda: 7,
  idEmprendedor: 42,
  nombre: "Negocio de prueba",
  descripcion: "Descripción",
  direccion: "Nicoya",
  telefono: "88888888",
  horario: "Lunes",
  instagramUrl: "https://www.instagram.com/local/",
  facebookUrl: null,
  whatsappComercial: "50677777777",
  estado: "INACTIVA",
  fechaCreacion: "2026-01-01T00:00:00.000Z",
};
const page = (content) => ({
  content,
  page: 0,
  size: 6,
  totalElements: content.length,
  totalPages: content.length ? 1 : 0,
});
const context = (id) => ({ params: Promise.resolve({ id: String(id) }) });
const request = (body, headers = {}, raw) =>
  new NextRequest("http://localhost/api/mi-negocio/tiendas/7", {
    method: "PATCH",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      ...headers,
    },
    body: raw ?? JSON.stringify(body),
  });
const get = (query = "") =>
  list.GET(new NextRequest("http://localhost/api/mi-negocio/tiendas" + query));
const read = (id) =>
  detail.GET(new NextRequest("http://localhost/"), context(id));
const patch = (body, headers, raw) =>
  detail.PATCH(request(body, headers, raw), context(7));
function setup(custom) {
  calls = [];
  handler = custom;
  global.fetch = async (url, options) => {
    calls.push({
      url: String(url),
      method: options.method,
      body: options.body ? JSON.parse(options.body) : undefined,
      cache: options.cache,
    });
    if (String(url).endsWith("/auth/me"))
      return Response.json({
        idUsuario: 42,
        nombre: "Prueba",
        apellido: "Temporal",
        correo: "owner@example.test",
        rol: role,
      });
    return handler
      ? handler(String(url), options)
      : Response.json(String(url).includes("/stores?") ? page([store]) : store);
  };
}
afterEach(() => {
  global.fetch = originalFetch;
  session = true;
  role = "EMPRENDEDOR";
});

test("PATCH del formulario solo envía cambios; null elimina opcionales y omisión conserva", () => {
  const values = pure.storeFormValues(store);
  assert.deepEqual(pure.changedStoreFields(store, values), {});
  assert.deepEqual(
    pure.changedStoreFields(store, {
      ...values,
      telefono: "",
      instagramUrl: "   ",
      direccion: "  Liberia  ",
    }),
    { telefono: null, instagramUrl: null, direccion: "Liberia" },
  );
  assert.deepEqual(
    pure.changedStoreFields(
      { ...store, descripcion: "" },
      { ...values, descripcion: "" },
    ),
    {},
  );
  assert.deepEqual(pure.validateStorePatch({}), {});
  assert.deepEqual(
    pure.validateStorePatch({
      descripcion: null,
      telefono: null,
      horario: null,
      instagramUrl: null,
      facebookUrl: null,
      whatsappComercial: null,
    }),
    {},
  );
});
test("validación respeta campos editables, obligatoriedad, longitudes y contactos", async (t) => {
  for (const field of pure.editableStoreFields)
    await t.test(field.name, () => {
      assert.ok(
        pure.validateStorePatch({ [field.name]: "x".repeat(field.max + 1) })[
          field.name
        ],
      );
      if (field.required)
        for (const value of [null, "", "   ", 123])
          assert.ok(
            pure.validateStorePatch({ [field.name]: value })[field.name],
          );
    });
  for (const key of [
    "idEmprendedor",
    "idTienda",
    "estado",
    "authId",
    "fechaCreacion",
    "__proto__",
  ])
    assert.ok(pure.validateStorePatch(JSON.parse(`{"${key}":"x"}`)).form);
  for (const input of [null, [], "texto"])
    assert.ok(pure.validateStorePatch(input).form);
  for (const key of ["instagramUrl", "facebookUrl", "whatsappComercial"])
    assert.ok(pure.validateStorePatch({ [key]: "javascript:alert(1)" })[key]);
});
test("parámetros no aceptan filtros de propietario ni ampliar el alcance", () => {
  for (const query of [
    "idEmprendedor=43",
    "estado=ACTIVA",
    "page=0&page=1",
    "size=101",
    "page=-1",
    "size=x",
    "sortBy=nombre",
  ])
    assert.equal(pure.managementPageParams(new URLSearchParams(query)), null);
  assert.equal(
    pure.managementPageParams(new URLSearchParams()).get("size"),
    "6",
  );
});
test("listado deriva propietario del perfil y conserva inactivas con proyección explícita", async () => {
  setup(() =>
    Response.json(
      page([
        { ...store, authId: "private", emprendedor: { secret: "private" } },
      ]),
    ),
  );
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).content, [store]);
  const url = new URL(calls.at(-1).url);
  assert.equal(url.searchParams.get("idEmprendedor"), "42");
  assert.equal(url.searchParams.has("estado"), false);
  assert.ok(calls.every((c) => c.cache === "no-store"));
});
test("sesión ausente no realiza peticiones y produce 401 con borrado de cookie", async () => {
  setup();
  session = false;
  for (const response of [
    await get(),
    await read(7),
    await patch({ nombre: "Nuevo" }),
  ]) {
    assert.equal(response.status, 401);
    assert.match(response.headers.get("set-cookie"), /chorotega_session=;/);
  }
  assert.equal(calls.length, 0);
});
test("CLIENTE, ADMIN y REPARTIDOR no acceden ni leen tiendas mediante BFF", async (t) => {
  for (const currentRole of ["CLIENTE", "ADMIN", "REPARTIDOR"])
    await t.test(currentRole, async () => {
      role = currentRole;
      setup();
      assert.equal((await get()).status, 403);
      assert.equal((await read(7)).status, 403);
      assert.equal((await patch({ nombre: "Nuevo" })).status, 403);
      assert.ok(calls.every((c) => c.url.endsWith("/auth/me")));
    });
});
test("401 de identidad y perfil no disponible no filtran datos", async () => {
  global.fetch = async () =>
    Response.json({ token: "private" }, { status: 401 });
  assert.equal((await get()).status, 401);
  global.fetch = async () => {
    throw new TypeError("private-network");
  };
  const response = await get();
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private/);
});
test("propiedad ajena devuelve 404 y nunca envía PATCH", async () => {
  setup(() => Response.json({ ...store, idEmprendedor: 43 }));
  for (const response of [await read(7), await patch({ nombre: "Nuevo" })]) {
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /Negocio de prueba/);
  }
  assert.ok(calls.every((c) => c.method !== "PATCH"));
});
test("listado rechaza resultados ajenos, contratos rotos y metadata inválida", async (t) => {
  for (const bad of [
    page([{ ...store, idEmprendedor: 43 }]),
    { ...page([store]), totalPages: 99 },
    page([{ ...store, instagramUrl: undefined }]),
    { ...page([store]), size: 5 },
  ])
    await t.test("respuesta inválida", async () => {
      setup(() => Response.json(bad));
      const response = await get();
      assert.equal(response.status, 502);
      assert.doesNotMatch(await response.text(), /Negocio de prueba/);
    });
});
test("ID inválido o filtros inyectados producen 400 sin consultar tiendas", async () => {
  setup();
  assert.equal((await read("1 OR 1=1")).status, 400);
  assert.equal((await get("?idEmprendedor=43")).status, 400);
  assert.ok(calls.every((c) => c.url.endsWith("/auth/me")));
});
test("PATCH parcial reenvía exactamente los campos validados, sin propietario ni estado", async () => {
  const partial = { descripcion: null, nombre: "Nuevo" };
  setup((_url, options) =>
    Response.json(
      options.method === "PATCH" ? { ...store, ...partial } : store,
    ),
  );
  const response = await patch(partial);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.find((c) => c.method === "PATCH").body, partial);
  assert.deepEqual(await response.json(), { ...store, ...partial });
});
test("PATCH rechaza campos protegidos, datos inválidos y JSON roto antes de consultar tiendas", async () => {
  setup();
  for (const value of [
    { idEmprendedor: 43 },
    { estado: "ACTIVA" },
    { idTienda: 8 },
    { nombre: null },
    { instagramUrl: "https://evil.test/" },
  ])
    assert.equal((await patch(value)).status, 400);
  assert.equal((await patch({}, {}, "{")).status, 400);
  assert.ok(calls.every((c) => c.url.endsWith("/auth/me")));
});
test("PATCH con cookies exige JSON y origen exacto, sin relajar CSRF", async () => {
  setup();
  for (const headers of [
    { origin: "https://evil.test" },
    { origin: "null" },
    { origin: "" },
    { "content-type": "text/plain" },
  ])
    assert.equal((await patch({ nombre: "Nuevo" }, headers)).status, 403);
  assert.ok(calls.every((c) => c.url.endsWith("/auth/me")));
});
test("errores de Nest preservan códigos esperados sin mostrar SQL o credenciales", async (t) => {
  for (const status of [400, 401, 403, 404, 500])
    await t.test(String(status), async () => {
      setup((_url, options) =>
        options.method === "PATCH"
          ? Response.json({ detail: "private-SQL-password-token" }, { status })
          : Response.json(store),
      );
      const response = await patch({ nombre: "Nuevo" });
      assert.equal(response.status, status);
      assert.doesNotMatch(await response.text(), /private|SQL|password|token/);
    });
});
test("fallos de red 502 y errores inesperados 500 son seguros", async () => {
  for (const [error, status] of [
    [new TypeError("private-network"), 502],
    [new Error("private-stack"), 500],
  ]) {
    setup(() => {
      throw error;
    });
    const response = await get();
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /private/);
  }
});
test("PATCH no confirma éxito si la respuesta cambia identidad o propietario", async () => {
  setup((_url, options) =>
    Response.json(
      options.method === "PATCH" ? { ...store, idTienda: 999 } : store,
    ),
  );
  assert.equal((await patch({ nombre: "Nuevo" })).status, 502);
});
