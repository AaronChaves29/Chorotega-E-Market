import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const originalFetch = global.fetch;
let role = "CLIENTE",
  authenticated = true,
  token = "local-token",
  nonce = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const profile = {
  idUsuario: 1,
  nombre: "Local",
  apellido: "Test",
  correo: "local@example.test",
  rol: "CLIENTE",
};
function load(file) {
  const filename = resolve(root, file),
    localRequire = createRequire(filename),
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
            get: (name) => ({
              value: name === "chorotega_session" ? token : nonce,
            }),
          }),
        };
      if (id === "@/lib/current-user")
        return {
          getCurrentUser: async () =>
            authenticated
              ? { status: "authenticated", user: { ...profile, rol: role } }
              : { status: "unauthenticated" },
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
const {
  addItem,
  applyReview,
  cents,
  colones,
  emptyCart,
  readCart,
  reviewChanges,
  subtotal,
  validQuantity,
} = load("lib/cart.ts");
const store = { idTienda: 7, nombre: "Tienda local" };
const product = {
  idProducto: 1,
  idTienda: 7,
  nombre: "Pieza",
  descripcion: null,
  precio: "1000.11",
  cantidadDisponible: 5,
  estado: "ACTIVO",
};
const scope = "a".repeat(64);
const selected = () => addItem(emptyCart(scope), store, product, 2);
afterEach(() => {
  global.fetch = originalFetch;
  role = "CLIENTE";
  authenticated = true;
  token = "local-token";
  nonce = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
});

test("centavos exactos incluso fuera del rango seguro de Number, sin redondeo binario", () => {
  assert.equal(cents("0.29") + cents("0.01"), 30n);
  assert.equal(colones(12345678901234n), "₡123 456 789 012,34");
  assert.equal(
    subtotal([
      { product: { ...product, precio: "99999999.99" }, quantity: 2147483647 },
    ]),
    9999999999n * 2147483647n,
  );
  for (const invalid of ["1e2", "NaN", "-1.00", "1.001", "1"])
    assert.throws(() => cents(invalid));
});
test("agrega, acumula y combina varios productos de una sola tienda", () => {
  let cart = selected();
  cart = addItem(cart, store, product, 1);
  cart = addItem(cart, store, { ...product, idProducto: 2 }, 2);
  assert.equal(cart.items.length, 2);
  assert.equal(cart.items[0].quantity, 3);
  assert.equal(subtotal(cart.items), 500055n);
});
test("cantidades inválidas, stock acumulado y reemplazo de tienda requieren decisión", () => {
  for (const q of [-1, 0, 1.5, NaN, Infinity, 6]) {
    assert.equal(validQuantity(q, 5), false);
    assert.throws(() => addItem(emptyCart(scope), store, product, q));
  }
  assert.throws(() => addItem(selected(), store, product, 4), /acumulada/);
  const other = { idTienda: 8, nombre: "Otra tienda" },
    p = { ...product, idTienda: 8 };
  assert.throws(() => addItem(selected(), other, p, 1), /otro emprendimiento/);
  assert.equal(addItem(selected(), other, p, 1, true).items.length, 1);
  assert.equal(addItem(selected(), other, p, 1, true).store.idTienda, 8);
});
test("persistencia proyectada: recarga, otra sesión, corrupción y datos extras", () => {
  const cart = selected();
  cart.items[0].product.claveHash = "never-store";
  const restored = readCart(JSON.stringify(cart), scope);
  assert.equal(restored.items.length, 1);
  assert.equal(restored.items[0].product.claveHash, undefined);
  assert.equal(readCart(JSON.stringify(cart), "b".repeat(64)).items.length, 0);
  assert.equal(readCart("{broken", scope).items.length, 0);
  assert.equal(
    readCart(
      JSON.stringify({ ...cart, items: [cart.items[0], cart.items[0]] }),
      scope,
    ).items.length,
    0,
  );
  assert.equal(
    readCart(
      JSON.stringify({ ...cart, items: [{ ...cart.items[0], quantity: -1 }] }),
      scope,
    ).items.length,
    0,
  );
});
test("recarga tras envío incierto impide repetir automáticamente, incluso si hay resultado pendiente", () => {
  const cart = readCart(
    JSON.stringify({ ...selected(), phase: "submitting" }),
    scope,
  );
  assert.equal(cart.phase, "uncertain");
  assert.throws(() => addItem(cart, store, product, 1), /pedidos/);
});
test("cambios de precio/stock y agotados requieren revisión explícita", () => {
  const cart = selected();
  const review = {
    store,
    items: [
      {
        idProducto: 1,
        quantity: 2,
        product: { ...product, precio: "1000.29", cantidadDisponible: 1 },
      },
    ],
  };
  assert.equal(reviewChanges(cart, review).length, 2);
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(applyReview(cart, review).items[0].quantity, 1);
  assert.equal(
    applyReview(cart, {
      ...review,
      items: [{ idProducto: 1, quantity: 2, product: null }],
    }).items.length,
    0,
  );
  assert.throws(
    () => reviewChanges(cart, { ...review, items: [] }),
    /incompleta/,
  );
});

const request = (body) =>
  new Request("http://localhost/api/cart/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const input = { idTienda: 7, items: [{ idProducto: 1, cantidad: 2 }] };
const reviewHandler = () => load("app/api/cart/review/route.ts").POST;
test("revisión BFF: JWT ausente y todos los roles no CLIENTE sin acceso a catálogo", async () => {
  global.fetch = () => assert.fail("No debe consultar productos");
  authenticated = false;
  assert.equal((await reviewHandler()(request(input))).status, 401);
  authenticated = true;
  for (role of ["ADMIN", "EMPRENDEDOR", "REPARTIDOR"])
    assert.equal((await reviewHandler()(request(input))).status, 403);
});
test("revisión BFF rechaza cantidades, duplicados, tienda y precios suministrados como autoridad", async () => {
  global.fetch = () => assert.fail("No debe consultar catálogo");
  for (const invalid of [
    { ...input, idTienda: 0 },
    { ...input, precio: 1 },
    { ...input, items: [] },
    { ...input, items: [{ idProducto: 1, cantidad: 0 }] },
    { ...input, items: [{ idProducto: 1, cantidad: 1, precio: 1 }] },
    { ...input, items: [...input.items, ...input.items] },
  ])
    assert.equal((await reviewHandler()(request(invalid))).status, 400);
});
test("revisión BFF consulta tienda y productos reales, parametriza ID y proyecta campos", async () => {
  global.fetch = async (url, options) => {
    assert.equal(options.headers.get("Authorization"), "Bearer local-token");
    assert.equal(options.cache, "no-store");
    if (url.endsWith("/stores/7"))
      return Response.json({
        ...store,
        descripcion: null,
        direccion: "Nicoya",
        telefono: null,
        horario: null,
        instagramUrl: null,
        facebookUrl: null,
        whatsappComercial: null,
        estado: "ACTIVA",
        secret: "private",
      });
    assert.ok(url.endsWith("/products/1"));
    return Response.json({
      ...product,
      authId: "private",
      tienda: { secret: "private" },
    });
  };
  const response = await reviewHandler()(request(input));
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /private|authId|tienda/);
});
test("revisión BFF marca producto ajeno o inactivo no disponible y oculta errores SQL", async () => {
  let mode = "other";
  global.fetch = async (url) => {
    if (url.endsWith("/stores/7"))
      return Response.json({
        ...store,
        descripcion: null,
        direccion: "Nicoya",
        telefono: null,
        horario: null,
        instagramUrl: null,
        facebookUrl: null,
        whatsappComercial: null,
        estado: "ACTIVA",
      });
    return mode === "other"
      ? Response.json({ ...product, idTienda: 8 })
      : Response.json({ detail: "private-sql" }, { status: 500 });
  };
  assert.equal(
    (await (await reviewHandler()(request(input))).json()).items[0].product,
    null,
  );
  mode = "failure";
  const response = await reviewHandler()(request(input));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private-sql/);
});
test("scope público no contiene JWT y cambia con identidad, nonce y token", async () => {
  const { cartScope } = load("lib/cart-session.ts");
  const expected = cartScope(1, nonce, token);
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.notEqual(expected, cartScope(2, nonce, token));
  assert.notEqual(expected, cartScope(1, "new", token));
  assert.notEqual(expected, cartScope(1, nonce, "changed"));
  const response = await load("app/api/cart/session/route.ts").GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: 1, scope: expected });
});

const body = {
  idBarrio: 1,
  direccionEntrega: "Local",
  items: [{ idProducto: 1, cantidad: 2 }],
};
const order = {
  idPedido: 1,
  idCliente: 1,
  idTienda: 7,
  idBarrio: 1,
  direccionEntrega: "Local",
  estado: "CONFIRMADO",
  items: [
    {
      idProducto: 1,
      cantidad: 2,
      precioUnitario: "1000.11",
      subtotal: "2000.22",
    },
  ],
  subtotal: "2000.22",
  tarifaEnvio: "500.00",
  total: "2500.22",
};
test("envío compartido acepta solo confirmación 201 coherente; nunca envía precios", async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, "/api/orders");
    assert.deepEqual(JSON.parse(options.body), body);
    assert.equal(options.headers["X-Cart-Scope"], scope);
    return Response.json(order, { status: 201 });
  };
  assert.equal(
    (
      await load("lib/order-submission.ts").submitOrder(body, {
        scope,
        storeId: 7,
      })
    ).status,
    "created",
  );
});
test("red, 5xx, 200 ambiguo o DTO contradictorio no se reintentan ni confirman", async () => {
  for (const fixture of [
    { code: 502, data: {} },
    { code: 200, data: order },
    { code: 201, data: { ...order, total: "1.00" } },
    { code: 201, data: { ...order, idTienda: 8 } },
    { code: 201, data: null },
  ]) {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return Response.json(fixture.data, { status: fixture.code });
    };
    assert.equal(
      (await load("lib/order-submission.ts").submitOrder(body, { storeId: 7 }))
        .status,
      "uncertain",
    );
    assert.equal(calls, 1);
  }
  global.fetch = async () => {
    throw new Error("private-network");
  };
  const result = await load("lib/order-submission.ts").submitOrder(body);
  assert.equal(result.status, "uncertain");
  assert.doesNotMatch(result.message, /private/);
});
test("rechazos conocidos 400/401/403/409/422 preservan código sin divulgar mensajes internos", async () => {
  for (const code of [400, 401, 403, 409, 422]) {
    global.fetch = async () =>
      Response.json({ detail: "private" }, { status: code });
    const result = await load("lib/order-submission.ts").submitOrder(body);
    assert.equal(result.status, "rejected");
    assert.equal(result.code, code);
    assert.doesNotMatch(result.message, /private/);
  }
});

test("BFF de pedidos rechaza scope obsoleto y roles sin despachar la escritura", async () => {
  global.fetch = () => assert.fail("No debe crear pedido");
  const post = () =>
    load("app/api/orders/route.ts").POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Cart-Scope": "old" },
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await post()).status, 409);
  role = "ADMIN";
  assert.equal((await post()).status, 403);
  authenticated = false;
  assert.equal((await post()).status, 401);
});
test("scope vigente permite el contrato original de compra; backend recibe solo IDs, cantidades y entrega", async () => {
  const scope = load("lib/cart-session.ts").cartScope(
    profile.idUsuario,
    nonce,
    token,
  );
  global.fetch = async (url, options) => {
    assert.ok(url.endsWith("/orders"));
    assert.deepEqual(JSON.parse(options.body), body);
    assert.equal(options.headers.get("Authorization"), "Bearer local-token");
    return Response.json(order, { status: 201 });
  };
  const response = await load("app/api/orders/route.ts").POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Cart-Scope": scope },
      body: JSON.stringify(body),
    }),
  );
  assert.equal(response.status, 201);
});
test("login rota el nonce aun con el mismo JWT; logout elimina la cookie del carrito", async () => {
  global.fetch = async () =>
    Response.json(
      { token: "local-token", tipo: "Bearer", expiraEnSegundos: 3600 },
      { status: 201 },
    );
  const login = () =>
    load("app/api/auth/login/route.ts").POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correo: "local@example.test",
          clave: "Local only fixture",
        }),
      }),
    );
  const first = await login(),
    second = await login();
  assert.notEqual(
    first.cookies.get("chorotega_cart_session").value,
    second.cookies.get("chorotega_cart_session").value,
  );
  assert.match(first.headers.get("set-cookie"), /HttpOnly/);
  assert.doesNotMatch(await first.text(), /local-token/);
  const logout = await load("app/api/auth/logout/route.ts").POST();
  assert.match(logout.headers.get("set-cookie"), /chorotega_cart_session=;/);
});
test("storage con cantidades superiores al stock declarado se invalida", () => {
  const cart = selected();
  cart.items[0].quantity = 6;
  assert.equal(readCart(JSON.stringify(cart), scope).items.length, 0);
});
