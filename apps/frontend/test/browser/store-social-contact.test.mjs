import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chrome, freePort, until } from "./support.mjs";

const frontend = resolve(import.meta.dirname, "../..");
const backend = createRequire(resolve(frontend, "../backend/package.json"));
backend("ts-node").register({
  project: resolve(frontend, "../backend/tsconfig.json"),
  transpileOnly: true,
});
const { createHttpTestApp } = backend("./test/support/create-http-test-app.ts");
const { AuthModule } = backend("./src/auth/auth.module.ts");
const { StoresModule } = backend("./src/modules/stores/stores.module.ts");
const { ProductsModule } = backend("./src/modules/products/products.module.ts");
const { User } = backend("./src/modules/users/entities/user.entity.ts");
const { Store } = backend("./src/modules/stores/entities/store.entity.ts");
const { EntrepreneurRegistrationService } = backend(
  "./src/auth/entrepreneur-registration.service.ts",
);
const { BadRequestException } = backend("@nestjs/common");
const { JwtService } = backend("@nestjs/jwt");
const { normalizeSocialValue: officialNormalize } = backend(
  "./src/modules/stores/validation/store-social-contact.ts",
);
const { normalizeSocialValue: frontendNormalize } = backend(
  resolve(frontend, "lib/store-social-contact.ts"),
);
const bcrypt = backend("bcrypt");
const evidence = "/private/tmp/chorotega-6b-social-evidence";

test(
  "Redes sociales: Chrome → Next.js → NestJS → PostgreSQL temporal",
  { timeout: 240000 },
  async (t) => {
    let context, next, browser;
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const password = "Solo pruebas temporales 123!";
    try {
      context = await createHttpTestApp([
        AuthModule,
        StoresModule,
        ProductsModule,
      ]);
      await context.app.listen(0, "127.0.0.1");
      const api = await context.app.getUrl(),
        ds = context.database.dataSource;
      const users = ds.getRepository(User),
        stores = ds.getRepository(Store);
      const client = await users.save({
        authId: randomUUID(),
        nombre: "Cliente",
        apellido: "Temporal",
        correo: "social-client@example.test",
        rol: "CLIENTE",
        estado: "ACTIVO",
        claveHash: await bcrypt.hash(password, 4),
      });
      const port = await freePort(),
        origin = `http://localhost:${port}`;
      let logs = "";
      next = spawn(
        process.execPath,
        [
          resolve(frontend, "node_modules/next/dist/bin/next"),
          "start",
          "-H",
          "127.0.0.1",
          "-p",
          String(port),
        ],
        {
          cwd: frontend,
          env: {
            ...process.env,
            API_URL: `${api}/api/v1`,
            NODE_ENV: "production",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      for (const stream of [next.stdout, next.stderr])
        stream.on("data", (chunk) => {
          logs = (logs + chunk).slice(-12000);
        });
      await until(
        async () => {
          try {
            return (await fetch(`${origin}/login`)).ok;
          } catch {
            if (next.exitCode !== null) throw new Error(logs);
            return false;
          }
        },
        "Next.js listo",
        30000,
      );
      browser = await chrome();
      await mkdir(evidence, { recursive: true });
      const navigate = async (path, selector) => {
        await browser.navigate(`${origin}${path}`);
        await browser.wait(
          `location.pathname === ${JSON.stringify(path)} && !!document.querySelector(${JSON.stringify(selector)}) && document.readyState === 'complete'`,
          path,
        );
      };
      const submit = () =>
        browser.evaluate(
          "document.querySelector('.registration-form').requestSubmit()",
        );
      const fill = async (values) => {
        for (const [field, value] of Object.entries(values))
          await browser.fill(`#entrepreneur-${field}`, value);
      };
      const base = (email) => ({
        negocio: "Taller local de prueba",
        nombre: "Persona",
        apellido: "Temporal",
        correo: email,
        clave: password,
        confirmacion: password,
        direccion: "Nicoya, dirección sintética",
        telefono: "+506 8888-8888",
        descripcion: "Creaciones de una fixture temporal",
        horario: "Lunes a viernes",
      });
      const capture = async (name) => {
        await browser.evaluate("document.fonts.ready.then(() => true)");
        await browser.evaluate("scrollTo(0, 0)");
        const { cssContentSize } = await browser.call("Page.getLayoutMetrics");
        const shot = await browser.call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: cssContentSize.width,
            height: cssContentSize.height,
            scale: 1,
          },
        });
        await writeFile(join(evidence, name), Buffer.from(shot.data, "base64"));
      };
      const socialSection =
        'section[aria-label="Redes sociales y contacto comercial"]';
      const readLinks = () =>
        browser.evaluate(
          `Array.from(document.querySelectorAll('${socialSection} a'), a => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, label: a.innerText.trim() }))`,
        );
      let withContacts, withoutContacts, oneContact;

      await t.test(
        "frontend y NestJS concuerdan en formatos admitidos y rechazados",
        () => {
          const values = [
            null,
            undefined,
            "",
            123,
            {},
            "http://instagram.com/local",
            "https://instagram.com/local",
            "https://www.instagram.com/local.1/",
            "https://instagram.com/reel/123",
            "https://instagram.com:443/local",
            "https://instagram.com@evil.test/local",
            "https://instagram.com/a/../local",
            "https://instagram.com/local/#bio",
            "https://facebook.com/Local",
            "https://facebook.com/profile.php?id=123",
            "https://facebook.com/profile.php?id=123&x=1",
            "https://facebook.com/l.php?u=evil",
            "https://facebook.com/groups/123",
            "+506 7777-7777",
            "50677777777",
            "7777-7777",
            "0050677777777",
            "https://wa.me/50677777777",
            "50677777777\n",
          ];
          for (const field of [
            "instagramUrl",
            "facebookUrl",
            "whatsappComercial",
          ])
            for (const value of values)
              assert.equal(
                frontendNormalize(field, value),
                officialNormalize(field, value),
              );
        },
      );
      await navigate("/registro/emprendedor", "#entrepreneur-negocio");
      for (const width of [320, 390, 768, 1280, 1440])
        await t.test(
          `registro responsive ${width}px y aviso comercial visible`,
          async () => {
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 1000,
              deviceScaleFactor: 1,
              mobile: false,
            });
            assert.ok(
              await browser.evaluate(
                "document.documentElement.scrollWidth <= innerWidth",
              ),
            );
            assert.match(
              await browser.evaluate(
                "document.querySelector('fieldset').innerText",
              ),
              /usuarios autenticados/,
            );
            assert.ok(
              await browser.evaluate(
                "['instagramUrl','facebookUrl','whatsappComercial'].every(f => { const input=document.querySelector('[name='+f+']'); return input && !input.required && input.getBoundingClientRect().width>0; })",
              ),
            );
            if ([320, 1440].includes(width))
              await capture(`registro-${width}.png`);
          },
        );
      await fill(base("social-owner@example.test"));
      for (const [field, value] of [
        ["instagramUrl", "https://instagram.com.attacker.test/local"],
        ["facebookUrl", "https://facebook.com/l.php?u=evil"],
        ["whatsappComercial", "8888-8888"],
      ])
        await t.test(
          `${field} inválido: error asociado, foco y ausencia de escrituras`,
          async () => {
            await fill({
              instagramUrl: "",
              facebookUrl: "",
              whatsappComercial: "",
              [field]: value,
            });
            await submit();
            await browser.wait(
              `document.querySelector('#entrepreneur-${field}').getAttribute('aria-invalid') === 'true'`,
              "error del contacto",
            );
            assert.equal(
              await browser.evaluate(`document.activeElement.id`),
              `entrepreneur-${field}`,
            );
            assert.equal(
              await browser.evaluate(
                `document.querySelector('#entrepreneur-${field}').value`,
              ),
              value,
            );
            assert.ok(
              await browser.evaluate(
                `!!document.querySelector('#entrepreneur-${field}-error')`,
              ),
            );
            assert.equal(
              await users.countBy({ correo: "social-owner@example.test" }),
              0,
            );
            assert.equal(await stores.count(), 0);
          },
        );
      const socials = {
        instagramUrl: "https://instagram.com/taller_local",
        facebookUrl: "https://facebook.com/profile.php?id=123456",
        whatsappComercial: "+506 7777-7777",
      };
      await fill(socials);
      await t.test(
        "400 del backend conserva el formulario y no muestra éxito ni detalles internos",
        async () => {
          const service = context.app.get(EntrepreneurRegistrationService),
            original = service.register;
          // An isolated server-side rejection, without changing DTOs, guards or production code.
          service.register = async () => {
            throw new BadRequestException("private-social-validation-marker");
          };
          try {
            await submit();
            await browser.wait(
              "!!document.querySelector('.registration-error') && document.querySelector('.registration-error').innerText.includes('servidor rechazó')",
              "rechazo seguro del backend",
            );
            assert.equal(
              await browser.evaluate(
                "!!document.querySelector('.registration-success')",
              ),
              false,
            );
            assert.equal(
              await browser.evaluate(
                "document.querySelector('#entrepreneur-instagramUrl').value",
              ),
              socials.instagramUrl,
            );
            assert.doesNotMatch(
              await browser.evaluate("document.body.innerText"),
              /private-social-validation-marker/,
            );
            assert.equal(
              await users.countBy({ correo: "social-owner@example.test" }),
              0,
            );
          } finally {
            service.register = original;
          }
        },
      );
      await t.test(
        "registro real con tres redes persiste valores canónicos y WhatsApp independiente",
        async () => {
          await submit();
          await browser.wait(
            "!!document.querySelector('.registration-success')",
            "registro con redes",
          );
          const owner = await users.findOneByOrFail({
            correo: "social-owner@example.test",
          });
          withContacts = await stores.findOneByOrFail({
            idEmprendedor: owner.idUsuario,
          });
          assert.equal(owner.rol, "EMPRENDEDOR");
          assert.equal(
            withContacts.instagramUrl,
            "https://www.instagram.com/taller_local/",
          );
          assert.equal(
            withContacts.facebookUrl,
            "https://www.facebook.com/profile.php?id=123456",
          );
          assert.equal(withContacts.whatsappComercial, "50677777777");
          assert.equal(withContacts.telefono, "+506 8888-8888");
          assert.equal(
            (await browser.call("Network.getAllCookies")).cookies.some(
              (c) => c.name === "chorotega_session",
            ),
            false,
          );
        },
      );
      await t.test(
        "campos vacíos se omiten: registro anterior conserva NULL sin copiar teléfono personal",
        async () => {
          await navigate("/registro/emprendedor", "#entrepreneur-negocio");
          await fill({
            ...base("social-empty@example.test"),
            instagramUrl: "   ",
            facebookUrl: "",
            whatsappComercial: " ",
          });
          await browser.evaluate(
            `(() => { const original=window.fetch; window.fetch=function(input, init){ if(String(input).includes('/api/auth/register/entrepreneur')) window.__socialStoreKeys=Object.keys(JSON.parse(init.body).tienda); return original.apply(this,arguments); }; })()`,
          );
          await submit();
          await browser.wait(
            "!!document.querySelector('.registration-success')",
            "registro sin redes",
          );
          const keys = await browser.evaluate("window.__socialStoreKeys");
          for (const field of [
            "instagramUrl",
            "facebookUrl",
            "whatsappComercial",
          ])
            assert.equal(keys.includes(field), false);
          const owner = await users.findOneByOrFail({
            correo: "social-empty@example.test",
          });
          withoutContacts = await stores.findOneByOrFail({
            idEmprendedor: owner.idUsuario,
          });
          assert.equal(withoutContacts.instagramUrl, null);
          assert.equal(withoutContacts.facebookUrl, null);
          assert.equal(withoutContacts.whatsappComercial, null);
          assert.equal(withoutContacts.telefono, "+506 8888-8888");
        },
      );
      await t.test(
        "registro con una sola red no completa contactos ausentes",
        async () => {
          await navigate("/registro/emprendedor", "#entrepreneur-negocio");
          await fill({
            ...base("social-one@example.test"),
            instagramUrl: "https://instagram.com/solo_instagram",
          });
          await submit();
          await browser.wait(
            "!!document.querySelector('.registration-success')",
            "registro de una red",
          );
          const owner = await users.findOneByOrFail({
            correo: "social-one@example.test",
          });
          oneContact = await stores.findOneByOrFail({
            idEmprendedor: owner.idUsuario,
          });
          assert.equal(
            oneContact.instagramUrl,
            "https://www.instagram.com/solo_instagram/",
          );
          assert.equal(oneContact.facebookUrl, null);
          assert.equal(oneContact.whatsappComercial, null);
        },
      );
      await t.test(
        "detalle e intermediario requieren sesión antes de mostrar contactos",
        async () => {
          const response = await fetch(
            `${origin}/api/stores/${withContacts.idTienda}`,
          );
          assert.equal(response.status, 401);
          assert.doesNotMatch(
            await response.text(),
            /taller_local|50677777777/,
          );
          await browser.navigate(`${origin}/tiendas/${withContacts.idTienda}`);
          await browser.wait(
            "location.pathname === '/login'",
            "detalle privado",
          );
        },
      );
      for (let index = 1; index <= 8; index++)
        await stores.save({
          idEmprendedor: withContacts.idEmprendedor,
          nombre: `Social taller ${index}`,
          direccion: "Nicoya, fixture temporal",
          estado: "ACTIVA",
        });
      await navigate("/login", "#correo");
      await browser.fill("#correo", client.correo);
      await browser.fill("#clave", password);
      await browser.evaluate("document.querySelector('form').requestSubmit()");
      await browser.wait(
        "location.pathname === '/mercado' && !!document.querySelector('#market-title') && !document.querySelector('.session-notice')",
        "sesión CLIENTE",
      );
      const marketplaceTitles = () =>
        browser.evaluate(
          "Array.from(document.querySelectorAll('[data-store-id] h2'),e=>e.textContent)",
        );
      await t.test(
        "búsqueda en vivo conserva foco y utiliza tiendas reales con el contrato social ampliado",
        async () => {
          await browser.wait(
            "document.querySelectorAll('[data-store-id]').length === 6",
            "mercado con datos",
          );
          await browser.evaluate(
            "document.querySelector('#store-name').focus()",
          );
          await browser.fill("#store-name", "Social taller");
          await browser.wait(
            "document.querySelector('#emprendimientos').getAttribute('aria-busy') === 'false' && document.querySelector('[data-store-id] h2')?.textContent === 'Social taller 1'",
            "búsqueda real",
          );
          assert.deepEqual(await marketplaceTitles(), [
            "Social taller 1",
            "Social taller 2",
            "Social taller 3",
            "Social taller 4",
            "Social taller 5",
            "Social taller 6",
          ]);
          assert.equal(
            await browser.evaluate("document.activeElement.id"),
            "store-name",
          );
          assert.ok(
            await browser.evaluate(
              "document.querySelector('#emprendimientos').innerText.includes('8 emprendimientos')",
            ),
          );
        },
      );
      await t.test(
        "ordenamiento por nombre conserva el filtro con contactos opcionales",
        async () => {
          await browser.evaluate(
            "(() => {const input=document.querySelector('#store-sort');input.value='nombre-DESC';input.dispatchEvent(new Event('change',{bubbles:true}));})()",
          );
          await browser.wait(
            "document.querySelector('#emprendimientos').getAttribute('aria-busy') === 'false' && document.querySelector('[data-store-id] h2')?.textContent === 'Social taller 8'",
            "orden real",
          );
          assert.deepEqual(await marketplaceTitles(), [
            "Social taller 8",
            "Social taller 7",
            "Social taller 6",
            "Social taller 5",
            "Social taller 4",
            "Social taller 3",
          ]);
        },
      );
      await t.test(
        "paginación SQL conserva búsqueda y orden tras ampliar el contrato",
        async () => {
          await browser.evaluate(
            `document.querySelector('nav[aria-label="Páginas de emprendimientos"] button:last-child').click()`,
          );
          await browser.wait(
            "document.querySelector('#emprendimientos').getAttribute('aria-busy') === 'false' && document.querySelectorAll('[data-store-id]').length === 2",
            "segunda página real",
          );
          assert.deepEqual(await marketplaceTitles(), [
            "Social taller 2",
            "Social taller 1",
          ]);
          assert.equal(
            await browser.evaluate(
              "document.querySelector('#store-name').value",
            ),
            "Social taller",
          );
        },
      );
      await t.test(
        "detalle proyecta redes reales y abre enlaces con protección de pestañas",
        async () => {
          await navigate(`/tiendas/${withContacts.idTienda}`, "#shop-title");
          await browser.wait(
            `document.querySelectorAll('${socialSection} a').length === 3`,
            "contactos visibles",
          );
          const links = await readLinks();
          assert.deepEqual(
            links.map((l) => l.href),
            [
              withContacts.instagramUrl,
              withContacts.facebookUrl,
              "https://wa.me/50677777777",
            ],
          );
          assert.ok(
            links.every(
              (l) => l.target === "_blank" && l.rel === "noopener noreferrer",
            ),
          );
          const data = await browser.evaluate(
            `fetch('/api/stores/${withContacts.idTienda}').then(r=>r.json())`,
          );
          assert.equal(data.instagramUrl, withContacts.instagramUrl);
          assert.equal(data.facebookUrl, withContacts.facebookUrl);
          assert.equal(data.whatsappComercial, withContacts.whatsappComercial);
          assert.equal(data.authId, undefined);
          assert.equal(data.emprendedor, undefined);
          assert.equal(
            await browser.evaluate(
              "document.cookie.includes('chorotega_session')",
            ),
            false,
          );
          const external = await browser.evaluate(
            "performance.getEntriesByType('resource').map(r=>r.name).filter(url=>/https?:\\/\\/(www\\.)?(instagram\\.com|facebook\\.com|wa\\.me)/.test(url))",
          );
          assert.deepEqual(external, []);
        },
      );
      for (const width of [320, 390, 768, 1280, 1440])
        await t.test(
          `detalle responsive ${width}px con enlaces accesibles`,
          async () => {
            await browser.call("Emulation.setDeviceMetricsOverride", {
              width,
              height: 1000,
              deviceScaleFactor: 1,
              mobile: false,
            });
            assert.ok(
              await browser.evaluate(
                "document.documentElement.scrollWidth <= innerWidth",
              ),
            );
            assert.ok(
              await browser.evaluate(
                `Array.from(document.querySelectorAll('${socialSection} a')).every(a=>a.getBoundingClientRect().height >= 44)`,
              ),
            );
            if ([320, 1440].includes(width))
              await capture(`tienda-${width}.png`);
          },
        );
      await t.test(
        "tienda con NULL no muestra redes y tienda con una red solo muestra esa",
        async () => {
          await navigate(`/tiendas/${withoutContacts.idTienda}`, "#shop-title");
          assert.deepEqual(await readLinks(), []);
          assert.equal(
            await browser.evaluate(
              `!!document.querySelector('${socialSection}')`,
            ),
            false,
          );
          await navigate(`/tiendas/${oneContact.idTienda}`, "#shop-title");
          await browser.wait(
            `document.querySelectorAll('${socialSection} a').length === 1`,
            "una red visible",
          );
          assert.equal((await readLinks())[0].href, oneContact.instagramUrl);
        },
      );
      await t.test(
        "datos alterados en fixture local no generan enlaces peligrosos ni rompen la tienda",
        async () => {
          await stores.update(oneContact.idTienda, {
            instagramUrl: "javascript:alert(1)",
            facebookUrl: "https://facebook.com.attacker.test/local",
            whatsappComercial: "0050677777777",
          });
          await navigate(`/tiendas/${oneContact.idTienda}`, "#shop-title");
          assert.deepEqual(await readLinks(), []);
          const fields = await browser.evaluate(
            `fetch('/api/stores/${oneContact.idTienda}').then(r=>r.json()).then(s=>[s.instagramUrl,s.facebookUrl,s.whatsappComercial])`,
          );
          assert.deepEqual(fields, [null, null, null]);
        },
      );
      await t.test(
        "tienda inexistente e inactiva continúan ocultando datos",
        async () => {
          await stores.update(withContacts.idTienda, { estado: "INACTIVA" });
          for (const id of [withContacts.idTienda, 2147483647]) {
            await browser.navigate(`${origin}/tiendas/${id}`);
            await browser.wait(
              "!!document.querySelector('[data-store-error=\"404\"]')",
              "tienda no disponible",
            );
            assert.deepEqual(await readLinks(), []);
            assert.equal(
              await browser.evaluate("!!document.querySelector('#shop-title')"),
              false,
            );
          }
        },
      );
      await t.test(
        "sesión vencida retira contactos y redirige al acceso",
        async () => {
          const expired = await context.app.get(JwtService).signAsync(
            {
              sub: client.correo,
              idUsuario: client.idUsuario,
              rol: client.rol,
            },
            { expiresIn: -1 },
          );
          await browser.call("Network.setCookie", {
            name: "chorotega_session",
            value: expired,
            url: origin,
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
          });
          await browser.navigate(
            `${origin}/tiendas/${withoutContacts.idTienda}`,
          );
          await browser.wait(
            "location.pathname === '/login'",
            "sesión vencida",
          );
          assert.deepEqual(await readLinks(), []);
        },
      );
      t.diagnostic(
        `Capturas con formularios vacíos y datos exclusivamente sintéticos: ${evidence}`,
      );
    } finally {
      try {
        await browser?.close();
      } finally {
        if (next && next.exitCode === null) {
          next.kill();
          await new Promise((resolve) => {
            next.once("exit", resolve);
            setTimeout(resolve, 5000).unref();
          });
        }
        try {
          await context?.close();
        } finally {
          if (oldSecret === undefined) delete process.env.JWT_SECRET;
          else process.env.JWT_SECRET = oldSecret;
        }
      }
    }
  },
);
