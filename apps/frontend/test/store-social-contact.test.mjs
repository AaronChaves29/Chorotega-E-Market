import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = resolve(import.meta.dirname, "..");
const originalFetch = global.fetch;
let session = "local-social-test";
function load(file) {
  const filename = resolve(root, file),
    localRequire = createRequire(filename),
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
            get: () => (session ? { value: session } : undefined),
          }),
        };
      if (id === "@/lib/server-api")
        return { getApiUrl: () => "http://127.0.0.1:3999/api/v1" };
      if (id.endsWith(".module.css"))
        return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (id.startsWith("@/") || id.startsWith(".")) {
        const target = id.startsWith("@/")
          ? resolve(root, id.slice(2))
          : resolve(dirname(filename), id);
        return load(target + (existsSync(target + ".ts") ? ".ts" : ".tsx"));
      }
      return localRequire(id);
    },
    exports,
    { exports },
  );
  return exports;
}
const {
  normalizeSocialValue,
  socialContactErrors,
  safeStoreSocialContacts,
  storeSocialLinks,
} = load("lib/store-social-contact.ts");
const social = {
  instagramUrl: "https://www.instagram.com/local/",
  facebookUrl: "https://www.facebook.com/Local/",
  whatsappComercial: "50677777777",
};
const empty = {
  instagramUrl: null,
  facebookUrl: null,
  whatsappComercial: null,
};
const store = {
  idTienda: 7,
  nombre: "Local",
  direccion: "Nicoya",
  descripcion: null,
  telefono: "88888888",
  horario: null,
  estado: "ACTIVA",
  ...empty,
};
const registration = {
  nombre: "Ana",
  apellido: "Prueba",
  correo: "ana@example.test",
  clave: "Clave temporal 123!",
  telefono: "+506 8888-8888",
  tienda: { nombre: "Negocio", direccion: "Nicoya" },
};
const post = (body) =>
  load("app/api/auth/register/entrepreneur/route.ts").POST(
    new Request("http://localhost/api/auth/register/entrepreneur", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
afterEach(() => {
  global.fetch = originalFetch;
  session = "local-social-test";
});

test("normaliza únicamente los formatos admitidos por el contrato 6A", async (t) => {
  for (const [field, input, output] of [
    ["instagramUrl", "https://instagram.com/local", social.instagramUrl],
    [
      "instagramUrl",
      "HTTPS://WWW.INSTAGRAM.COM/local.1/",
      "https://www.instagram.com/local.1/",
    ],
    ["facebookUrl", "https://facebook.com/Local", social.facebookUrl],
    [
      "facebookUrl",
      "https://facebook.com/profile.php?id=123456",
      "https://www.facebook.com/profile.php?id=123456",
    ],
    ["whatsappComercial", "+506 7777-7777", social.whatsappComercial],
    ["whatsappComercial", "50677777777", social.whatsappComercial],
  ])
    await t.test(`${field}: ${input}`, () =>
      assert.equal(normalizeSocialValue(field, input), output),
    );
});

test("rechaza enlaces peligrosos, recursos ajenos y números ambiguos sin reflejar valores", async (t) => {
  for (const [field, value] of [
    ["instagramUrl", "http://instagram.com/local"],
    ["instagramUrl", "https://instagram.com.attacker.test/local"],
    ["instagramUrl", "https://user:private@instagram.com/local"],
    ["instagramUrl", "https://instagram.com:443/local"],
    ["instagramUrl", "https://instagram.com/local/?next=evil"],
    ["instagramUrl", "https://instagram.com/local/#bio"],
    ["instagramUrl", "https://instagram.com/reel/123"],
    ["instagramUrl", "https://instagram.com/p/123"],
    ["instagramUrl", "https://instagram.com/%70/"],
    ["instagramUrl", "https://instagram.com/a/../local"],
    ["instagramUrl", "https://instagram.com/a\\b"],
    ["instagramUrl", "https://instagram.com/a\nlocal"],
    ["instagramUrl", `https://instagram.com/${"a".repeat(31)}`],
    ["instagramUrl", "javascript:alert(1)"],
    ["facebookUrl", "https://facebook.com/l.php?u=evil"],
    ["facebookUrl", "https://facebook.com/profile.php?id=1&next=evil"],
    ["facebookUrl", "https://facebook.com/profile.php?id=1&id=2"],
    ["facebookUrl", "https://facebook.com/profile.php?id=0"],
    ["facebookUrl", "https://facebook.com/profile.php?id=abc"],
    ["facebookUrl", "https://facebook.com.attacker.test/local"],
    ["facebookUrl", "https://facebook.com/login/"],
    ["facebookUrl", "https://facebook.com/groups/123"],
    ["whatsappComercial", "https://wa.me/50677777777"],
    ["whatsappComercial", "0050677777777"],
    ["whatsappComercial", "7777-7777"],
    ["whatsappComercial", "1".repeat(16)],
    ["whatsappComercial", "50677777777\n"],
    ["whatsappComercial", 50677777777],
  ])
    await t.test(`${field} caso ${String(value).slice(0, 30)}`, () => {
      assert.equal(normalizeSocialValue(field, value), undefined);
      assert.ok(socialContactErrors({ [field]: value })[field]);
      assert.doesNotMatch(
        socialContactErrors({ [field]: value })[field],
        /attacker|private|javascript|alert\(/,
      );
      assert.equal(storeSocialLinks({ [field]: value }).length, 0);
    });
});

test("registro acepta omisión, null, una red o todas sin usar teléfono personal como WhatsApp", async () => {
  for (const fields of [
    {},
    empty,
    { instagramUrl: social.instagramUrl },
    social,
  ]) {
    const payload = {
      ...registration,
      tienda: { ...registration.tienda, ...fields },
    };
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(
        url,
        "http://127.0.0.1:3999/api/v1/auth/register/entrepreneur",
      );
      assert.equal(options.headers.get("Authorization"), null);
      assert.deepEqual(JSON.parse(options.body), payload);
      return Response.json(
        { usuario: { authId: "private" }, tienda: fields, token: "private" },
        { status: 201 },
      );
    };
    const result = await post(payload);
    assert.equal(result.status, 201);
    assert.equal(calls, 1);
    assert.equal(result.headers.get("set-cookie"), null);
    assert.doesNotMatch(await result.text(), /private|token|authId/);
  }
});

test("intermediario rechaza redes inválidas o campos no autorizados antes de llamar Nest", async () => {
  global.fetch = () => assert.fail("No debe llamar al backend");
  for (const fields of [
    { instagramUrl: "" },
    { facebookUrl: " " },
    { whatsappComercial: "" },
    { facebookUrl: "https://evil.test/" },
    { whatsappComercial: 123 },
    { idEmprendedor: 9 },
  ]) {
    const response = await post({
      ...registration,
      tienda: { ...registration.tienda, ...fields },
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("rechazo de validación backend permanece como 400 seguro, sin exponer Problem Details internos", async () => {
  global.fetch = async () =>
    Response.json(
      { detail: "private-sql", errors: [registration.clave], token: "private" },
      { status: 400 },
    );
  const result = await post({
    ...registration,
    tienda: { ...registration.tienda, ...social },
  });
  assert.equal(result.status, 400);
  const text = await result.text();
  assert.match(text, /servidor rechazó/);
  assert.doesNotMatch(text, /private|Clave temporal/);
  assert.equal(result.headers.get("set-cookie"), null);
});

test("activeStore proyecta los tres campos canónicos y excluye relaciones y credenciales", async () => {
  global.fetch = async () =>
    Response.json({
      ...store,
      ...social,
      authId: "private",
      claveHash: "private",
      emprendedor: { private: true },
    });
  const result = await load("lib/store-detail-api.ts").activeStore(7);
  assert.deepEqual(result, { status: 200, store: { ...store, ...social } });
});

test("los contactos inválidos no rompen la tienda ni se publican; null no inventa enlaces", async () => {
  assert.deepEqual(safeStoreSocialContacts({}), empty);
  assert.deepEqual(storeSocialLinks({ ...empty, telefono: "88888888" }), []);
  global.fetch = async () =>
    Response.json({
      ...store,
      instagramUrl: "javascript:alert(1)",
      facebookUrl: "https://evil.test/",
      whatsappComercial: "https://wa.me/123",
    });
  assert.deepEqual(await load("lib/store-detail-api.ts").activeStore(7), {
    status: 200,
    store,
  });
});

test("campos omitidos o de tipo incorrecto en respuesta se rechazan como contrato roto", async () => {
  for (const value of [undefined, 123, {}, []]) {
    global.fetch = async () => Response.json({ ...store, instagramUrl: value });
    assert.equal(
      (await load("lib/store-detail-api.ts").activeStore(7)).status,
      502,
    );
  }
});

test("componente solo renderiza redes existentes con origen fijo y protección de pestañas", () => {
  const Component = load(
    "components/marketplace/store-social-links.tsx",
  ).default;
  assert.equal(
    renderToStaticMarkup(React.createElement(Component, { store })),
    "",
  );
  assert.equal(
    renderToStaticMarkup(
      React.createElement(Component, {
        store: { instagramUrl: "javascript:alert(1)" },
      }),
    ),
    "",
  );
  const html = renderToStaticMarkup(
    React.createElement(Component, { store: social }),
  );
  assert.equal((html.match(/target="_blank"/g) ?? []).length, 3);
  assert.equal((html.match(/rel="noopener noreferrer"/g) ?? []).length, 3);
  assert.match(html, /href="https:\/\/wa.me\/50677777777"/);
  assert.match(html, /Instagram/);
  assert.match(html, /Facebook/);
  assert.match(html, /WhatsApp/);
  assert.doesNotMatch(html, /<script|<iframe|onload=/);
  const single = renderToStaticMarkup(
    React.createElement(Component, {
      store: { facebookUrl: social.facebookUrl },
    }),
  );
  assert.match(single, /Facebook/);
  assert.doesNotMatch(single, /Instagram|WhatsApp/);
});
