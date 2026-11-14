import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const __dirname = import.meta.dirname;
const root = resolve(__dirname, "..");
const originalFetch = global.fetch;
const previousApi = process.env.API_URL;
process.env.API_URL = "http://127.0.0.1:3999/api/v1";
let session = "test-token";
function load(file) {
  const filename = resolve(root, file);
  const localRequire = createRequire(filename);
  const exports = {};
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const requireModule = (id) => {
    if (id === "server-only") return {};
    if (id === "next/headers")
      return {
        cookies: async () => ({
          get: () => (session ? { value: session } : undefined),
        }),
      };
    if (id === "next/navigation")
      return {
        redirect: (url) => {
          throw new Error(`redirect:${url}`);
        },
      };
    if (id.startsWith("@/")) return load(`${id.slice(2)}.ts`);
    if (id.startsWith(".")) return load(resolve(dirname(filename), `${id}.ts`));
    return localRequire(id);
  };
  new Function("require", "exports", "module", code)(requireModule, exports, {
    exports,
  });
  return exports;
}
after(() => {
  global.fetch = originalFetch;
  if (previousApi === undefined) delete process.env.API_URL;
  else process.env.API_URL = previousApi;
});

const profile = {
  idUsuario: 1,
  nombre: "Ana",
  apellido: "Prueba",
  correo: "ana@example.test",
  rol: "CLIENTE",
};

const businessRegistration = {
  nombre: "Ana", apellido: "Personal", correo: "ana@example.test", clave: "Clave-negocio-test-123!", telefono: "+506 8888-8888",
  tienda: { nombre: "Negocio distinto", direccion: "Nicoya", descripcion: "Ceramica", horario: "Lunes a viernes" },
};
test("registro emprendedor publica solo los campos permitidos y nunca retorna credenciales", async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:3999/api/v1/auth/register/entrepreneur");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.get("Authorization"), null);
    assert.deepEqual(JSON.parse(options.body), businessRegistration);
    return Response.json({ usuario: { rol: "EMPRENDEDOR" }, tienda: { idTienda: 1 }, token: "private-token", claveHash: "private-hash" }, { status: 201 });
  };
  const response = await load("app/api/auth/register/entrepreneur/route.ts").POST(new Request("http://localhost/api/auth/register/entrepreneur", { method: "POST", body: JSON.stringify(businessRegistration) }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(await response.json(), { message: "Tu cuenta y tu negocio se registraron correctamente." });
});
test("registro emprendedor rechaza rol, propietario, logo y datos invalidos antes del backend", async () => {
  global.fetch = () => assert.fail("No debe consultar backend");
  for (const invalid of [
    { ...businessRegistration, rol: "ADMIN" },
    { ...businessRegistration, tienda: { ...businessRegistration.tienda, idEmprendedor: 9 } },
    { ...businessRegistration, tienda: { ...businessRegistration.tienda, logo: "fake-upload" } },
    { ...businessRegistration, tienda: { nombre: "Sin direccion" } },
    { ...businessRegistration, nombre: " " }, { ...businessRegistration, correo: "invalid" },
    { ...businessRegistration, clave: "🔒".repeat(19) }, { ...businessRegistration, telefono: "abc" },
  ]) {
    const response = await load("app/api/auth/register/entrepreneur/route.ts").POST(new Request("http://localhost/register", { method: "POST", body: JSON.stringify(invalid) }));
    assert.equal(response.status, 400);
  }
});
test("registro emprendedor preserva errores HTTP sin exponer secretos ni crear sesion", async () => {
  for (const status of [400, 409, 429, 500, 503]) {
    global.fetch = async () => Response.json({ detail: "private-detail", token: "private-token", errors: [businessRegistration.clave, "Revisar campo"] }, { status });
    const response = await load("app/api/auth/register/entrepreneur/route.ts").POST(new Request("http://localhost/register", { method: "POST", body: JSON.stringify(businessRegistration) }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("set-cookie"), null);
    const text = await response.text();
    assert.ok(!text.includes("private-detail") && !text.includes("private-token") && !text.includes(businessRegistration.clave));
  }
  global.fetch = async () => { throw new Error("private-network-detail"); };
  const response = await load("app/api/auth/register/entrepreneur/route.ts").POST(new Request("http://localhost/register", { method: "POST", body: JSON.stringify(businessRegistration) }));
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("private-network-detail"));
});

for (const resource of ["stores", "products", "neighborhoods"]) {
  const request = {
    nextUrl: new URL(`http://localhost/api/${resource}?idTienda=1`),
  };
  test(`${resource}: sin cookie devuelve 401 sin consultar backend`, async () => {
    session = undefined;
    global.fetch = () => assert.fail("No debe consultar sin sesion");
    const response = await load(`app/api/${resource}/route.ts`).GET(request);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie"), /chorotega_session=;/);
  });
  test(`${resource}: usa Bearer exclusivamente en servidor y conserva datos`, async () => {
    session = "catalog-private-marker";
    const data = resource === "neighborhoods"
      ? [{ idBarrio: 1, estado: "ACTIVO" }, { idBarrio: 2, estado: "INACTIVO" }]
      : { content: [{ id: 1 }], totalPages: 1 };
    global.fetch = async (url, options) => {
      assert.ok(url.startsWith(`http://127.0.0.1:3999/api/v1/${resource}`));
      assert.equal(options.headers.get("Authorization"), "Bearer catalog-private-marker");
      assert.equal(options.cache, "no-store");
      if (resource === "products") {
        assert.equal(new URL(url).searchParams.get("idTienda"), "1");
        assert.equal(new URL(url).searchParams.get("disponible"), "true");
      }
      return Response.json(data);
    };
    const response = await load(`app/api/${resource}/route.ts`).GET(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.text();
    assert.ok(!body.includes(session));
    assert.deepEqual(JSON.parse(body), resource === "neighborhoods" ? [data[0]] : data);
  });
  test(`${resource}: distingue 401 de errores temporales y no filtra datos de error`, async () => {
    session = "catalog-private-marker";
    for (const status of [401, 403, 404, 500, 502, 503]) {
      global.fetch = async () => Response.json({ token: session, private: "private-error-marker" }, { status });
      const response = await load(`app/api/${resource}/route.ts`).GET(request);
      assert.equal(response.status, status);
      assert.equal(response.headers.has("set-cookie"), status === 401);
      const body = await response.text();
      assert.ok(!body.includes(session));
      assert.ok(!body.includes("private-error-marker"));
    }
    global.fetch = async () => { throw new Error("private-error-marker"); };
    const response = await load(`app/api/${resource}/route.ts`).GET(request);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(!(await response.text()).includes("private-error-marker"));
  });
}
test("perfil usa Bearer servidor/no-store y solo devuelve campos necesarios", async () => {
  session = "test-token";
  global.fetch = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:3999/api/v1/auth/me");
    assert.equal(options.headers.get("Authorization"), "Bearer test-token");
    assert.equal(options.cache, "no-store");
    return Response.json({
      ...profile,
      claveHash: "never-forward",
      authId: "never-forward",
      telefono: "123",
    });
  };
  assert.deepEqual(await load("lib/current-user.ts").getCurrentUser(), {
    status: "authenticated",
    user: profile,
  });
});
test("cookie ausente no consulta API y sesión inválida redirige a limpieza permitida", async () => {
  session = undefined;
  global.fetch = () => {
    throw new Error("No debe consultar");
  };
  const current = load("lib/current-user.ts");
  assert.deepEqual(await current.getCurrentUser(), {
    status: "unauthenticated",
  });
  await assert.rejects(
    current.requireCurrentUser(),
    /redirect:\/api\/auth\/session/,
  );
});
test("401 limpia cookie desde route handler", async () => {
  session = "invalid";
  global.fetch = async () => Response.json({}, { status: 401 });
  const response = await load("app/api/auth/me/route.ts").GET();
  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie"), /chorotega_session=;/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("500, timeout y datos inválidos no borran sesión ni muestran identidad", async () => {
  session = "valid";
  for (const fetcher of [
    async () => Response.json({}, { status: 500 }),
    async () => {
      throw new DOMException("timeout", "TimeoutError");
    },
    async () => Response.json({ ...profile, rol: "UNKNOWN" }),
  ]) {
    global.fetch = fetcher;
    const response = await load("app/api/auth/me/route.ts").GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal((await response.json()).nombre, undefined);
  }
});
test("registro intermediario rechaza campos privilegiados antes de consultar backend", async () => {
  global.fetch = () => {
    throw new Error("No debe consultar");
  };
  const { POST } = load("app/api/auth/register/route.ts");
  for (const field of ["rol", "estado", "authId", "idUsuario"]) {
    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          nombre: "Ana",
          apellido: "Prueba",
          correo: "ana@example.test",
          clave: "test-password",
          [field]: "ADMIN",
        }),
      }),
    );
    assert.equal(response.status, 400);
  }
});
test("destinos por rol y enlace MVC usan origen backend sin prefijo REST", () => {
  const { accountDestination } = load("types/auth.ts");
  assert.equal(accountDestination("CLIENTE"), "/pedidos");
  for (const role of ["ADMIN", "EMPRENDEDOR", "REPARTIDOR"])
    assert.equal(accountDestination(role), "/cuenta");
  assert.equal(
    load("lib/server-api.ts").getAdminLoginUrl(),
    "http://127.0.0.1:3999/admin/login",
  );
});

test("recuperación de sesión válida conserva cookie y dirige cada rol a su destino", async () => {
  session = "test-token";
  for (const rol of ["CLIENTE", "ADMIN", "EMPRENDEDOR", "REPARTIDOR"]) {
    global.fetch = async () => Response.json({ ...profile, rol });
    const response = await load("app/api/auth/session/route.ts").GET(
      new Request("http://localhost/api/auth/session"),
    );
    assert.equal(response.status, 307);
    assert.equal(
      new URL(response.headers.get("location")).pathname,
      rol === "CLIENTE" ? "/pedidos" : "/cuenta",
    );
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("recuperación distingue sesión inválida de indisponibilidad sin bucle a la landing", async () => {
  session = "test-token";
  for (const status of [401, 503]) {
    global.fetch = async () => Response.json({}, { status });
    const response = await load("app/api/auth/session/route.ts").GET(
      new Request("http://localhost/api/auth/session"),
    );
    assert.equal(
      new URL(response.headers.get("location")).pathname,
      status === 401 ? "/login" : "/cuenta",
    );
    assert.equal(response.headers.has("set-cookie"), status === 401);
  }
});

test("login conserva contrato, cookie HttpOnly y nunca devuelve el JWT al navegador", async () => {
  global.fetch = async () =>
    Response.json({
      token: "server-only-token",
      tipo: "Bearer",
      expiraEnSegundos: 3600,
    });
  const response = await load("app/api/auth/login/route.ts").POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ correo: "ana@example.test", clave: "password" }),
    }),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(response.headers.get("set-cookie"), /SameSite=lax/);
  assert.match(response.headers.get("set-cookie"), /Path=\//);
  assert.equal((await response.json()).token, undefined);
});
test("login maneja 401, 429 y fallo de conexión sin crear una sesión", async () => {
  for (const status of [401, 429, 500]) {
    global.fetch = async () => Response.json({}, { status });
    const response = await load("app/api/auth/login/route.ts").POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ correo: "ana@example.test", clave: "password" }),
      }),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  global.fetch = async () => {
    throw new TypeError("offline");
  };
  const response = await load("app/api/auth/login/route.ts").POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ correo: "ana@example.test", clave: "password" }),
    }),
  );
  assert.equal(response.status, 502);
});
test("logout elimina la cookie con el mismo path", async () => {
  const response = await load("app/api/auth/logout/route.ts").POST();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /chorotega_session=;/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.match(response.headers.get("set-cookie"), /Path=\//);
});

const courierRegistration = {nombre:'Luis',apellido:'Persona',correo:'courier@example.test',clave:'Clave-repartidor-test-123!',telefono:'+506 8888-8888',medioTransporte:'Bicicleta'};
test('registro repartidor envia datos sin JWT y retorna solo confirmacion',async()=>{
 global.fetch=async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:3999/api/v1/auth/register/courier');
  assert.equal(options.headers.get('Authorization'),null);
  assert.deepEqual(JSON.parse(options.body),courierRegistration);
  return Response.json({usuario:{rol:'REPARTIDOR'},repartidor:{idRepartidor:1},token:'private-token',claveHash:'private-hash'},{status:201});
 };
 const response=await load('app/api/auth/register/courier/route.ts').POST(new Request('http://localhost/register',{method:'POST',body:JSON.stringify(courierRegistration)}));
 assert.equal(response.status,201);assert.equal(response.headers.get('set-cookie'),null);
 assert.deepEqual(await response.json(),{message:'Tu cuenta de repartidor se registró correctamente.'});
});
test('registro repartidor rechaza privilegios y datos invalidos antes de consultar backend',async()=>{
 global.fetch=()=>assert.fail('No debe consultar backend');
 for(const override of [{rol:'ADMIN'},{idUsuario:1},{idRepartidor:2},{authId:'foreign'},{disponibilidad:'DISPONIBLE'},{placa:'unsupported'},{medioTransporte:''},{medioTransporte:[]},{medioTransporte:'T'.repeat(51)},{telefono:'123'},{correo:'invalid'},{clave:'short'},{clave:'\u{1F512}'.repeat(19)},{nombre:' '},{apellido:''}]){
 const response=await load('app/api/auth/register/courier/route.ts').POST(new Request('http://localhost/register',{method:'POST',body:JSON.stringify({...courierRegistration,...override})}));
 assert.equal(response.status,400);assert.equal(response.headers.get('set-cookie'),null);
 }
});
test('registro repartidor conserva errores sin secretos y rechaza JSON invalido',async()=>{
 const post=()=>load('app/api/auth/register/courier/route.ts').POST(new Request('http://localhost/register',{method:'POST',body:JSON.stringify(courierRegistration)}));
 for(const status of [400,409,429,500,503]){
 global.fetch=async()=>Response.json({message:'private-detail',errors:['private-secret',courierRegistration.clave],token:'private-token'},{status});
 const response=await post();assert.equal(response.status,status);
 assert.equal(response.headers.get('set-cookie'),null);assert.doesNotMatch(await response.text(),/private-detail|private-secret|private-token|Clave-repartidor/);
 }
 global.fetch=async()=>{throw Error('private-network')};const response=await post();assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/private-network/);
 global.fetch=()=>assert.fail('No debe consultar backend');
 const malformed=await load('app/api/auth/register/courier/route.ts').POST(new Request('http://localhost/register',{method:'POST',body:'{'}));assert.equal(malformed.status,400);
});
