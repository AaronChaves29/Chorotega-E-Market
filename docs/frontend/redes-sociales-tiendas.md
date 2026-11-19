# Implementación 6B: redes sociales en registro y detalle de tiendas

Base: `upstream/develop` en `6ee90823f7625395852e4ddbcda0085927b009bb`,
con el PR #141 integrado y el [CI posterior al merge aprobado](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/43778515325).
Rama: `feature/redes-sociales-tiendas-frontend`. Implementación frontend preparada
para revisión mediante PR hacia `develop`; este documento no autoriza su merge
ni un despliegue de producción.

## Registro

`/registro/emprendedor` mantiene los campos obligatorios y añade el fieldset
**Redes sociales y contacto comercial**, con Instagram, Facebook y WhatsApp
comercial opcionales. Explica que se publicarán para usuarios autenticados y
que WhatsApp es independiente del teléfono personal.

El formulario elimina espacios exteriores y omite los campos sociales vacíos,
incluidos los que contienen solo espacios. Los errores se muestran junto al
campo, asociados con `aria-describedby`/`aria-invalid`, y se enfoca el primer
contacto inválido. No se borran los valores ante errores locales ni del servidor.
Los errores de servidor se conservan en el panel general, sin reflejar SQL,
contraseñas ni el contenido interno de Problem Details.

El intermediario existente `/api/auth/register/entrepreneur` utiliza la whitelist
ampliada de `lib/entrepreneur-registration.ts` y acepta los tres campos dentro
de `tienda`:

```json
{
  "tienda": {
    "nombre": "Negocio",
    "direccion": "Nicoya",
    "instagramUrl": "https://instagram.com/negocio_local/",
    "facebookUrl": "https://facebook.com/profile.php?id=123456",
    "whatsappComercial": "+506 7777-7777"
  }
}
```

El ejemplo muestra solo la parte comercial del payload; los datos obligatorios
de la cuenta siguen siendo necesarios. No representa cuentas verificadas.

El servidor Next.js conserva la respuesta pública de confirmación, sin JWT,
cookies de sesión ni entidades de usuario/tienda. Si un cliente envía manualmente
una cadena vacía en un campo social, el intermediario la rechaza con 400 como
NestJS; es el formulario el que omite las entradas vacías.

## Validación y contratos

`lib/store-social-contact.ts` contiene la política compartida por el formulario,
la validación del intermediario y la representación de enlaces. Sigue el
[contrato backend 6A](../laboratory/lab-07/redes-sociales-tiendas.md):

- Instagram: HTTPS con `instagram.com` o `www.instagram.com`, un perfil definido,
  sin publicaciones, parámetros, fragmentos, credenciales ni puertos explícitos.
- Facebook: HTTPS con `facebook.com` o `www.facebook.com`, nombre de perfil o
  exactamente `profile.php?id=<entero positivo>`, sin parámetros adicionales.
- WhatsApp: número internacional explícito, 8–15 dígitos; entrada formateada con
  `+`, espacios y guiones admitida. No URLs, extensiones ni `00` inicial.
  Se construye exclusivamente `https://wa.me/NUMERO` con dígitos canónicos.

No se comprueba externamente existencia, titularidad ni asignación de números.
La autoridad definitiva sigue siendo NestJS. Las reglas frontend no importan
código ni dependencias de NestJS en el bundle del navegador; la prueba de
integración compara ambas implementaciones con entradas válidas y peligrosas
para detectar divergencias.

`Store`, `StoreDetail` y los validadores incorporan `instagramUrl`, `facebookUrl`
y `whatsappComercial` como `string | null`. Una respuesta que omite estos campos
o usa tipos incompatibles es un contrato roto, no una tienda antigua: las tiendas
previas a la migración tienen propiedades presentes con NULL.

`activeStore()` sigue autenticando desde el servidor y proyectando únicamente
los campos permitidos. Incorpora los tres contactos canónicos. Un contacto de
tipo string pero formato peligroso se reduce a null; no invalida el resto de la
tienda ni se expone como enlace. Las relaciones e identificadores privados de
Auth siguen fuera de esta proyección.

## Detalle de tienda y presentación

`/tiendas/[id]` conserva encabezado, búsqueda, catálogo, paginación, contactos y
flujo de compra aprobados. El componente `StoreSocialLinks` añade una sección
dentro de la presentación verde solo si hay al menos un contacto válido.

Cada enlace tiene etiqueta visible, SVG local, `target="_blank"` y
`rel="noopener noreferrer"`. No se usan scripts, embeds, widgets, enlaces ficticios
ni peticiones a plataformas sociales. Los enlaces nativos no precargan destinos.
La página y sus intermediarios siguen requiriendo sesión; las tiendas inactivas
o inexistentes no muestran contactos y la sesión vencida dirige al acceso.

Los cambios visuales usan CSS Modules, los verdes `#244f3e`/`#203b30` y crema
`#f7f3ea`, con foco visible, enlaces de al menos 44 px de alto y filas flexibles.
Se conserva el diseño existente; no se consultó Figma MCP ni se afirma una
coincidencia visual exacta para esta sección nueva. Se reutilizan las fuentes,
emblema e imágenes existentes, sin asignar fotografías comerciales ficticias.

## Pruebas y evidencias

Las pruebas unitarias comprueban validación, omisión/null, whitelist, errores
backend sanitizados, proyección, enlaces condicionales y WhatsApp seguro.
Se actualizaron únicamente las fixtures de los consumidores existentes para
incluir los tres NULL que ya devuelve el backend 6A; no se debilitan expectativas
ni se cambia el flujo de carrito/pedidos.

`test/browser/store-social-contact.test.mjs` ejecuta Chrome → Next.js → NestJS →
PostgreSQL 16 temporal, con las cinco migraciones del backend. Comprueba registro
con cero/una/tres redes, persistencia canónica, validaciones visibles sin escrituras,
400 del servidor conservando valores, privacidad, contactos NULL, datos peligrosos,
404, sesión vencida y responsive en **320, 390, 768, 1280 y 1440 px**.

El escenario del 400 del servidor inyecta un rechazo controlado exclusivamente en
la instancia local de pruebas y restaura el método al terminar; no altera DTOs,
guards ni código backend. El escenario de datos peligrosos modifica solo una
fixture del contenedor, respetando sus longitudes físicas, para verificar la
segunda barrera de validación del intermediario. No usa bases productivas.

Las capturas `registro-320.png`, `registro-1440.png`, `tienda-320.png` y
`tienda-1440.png` se guardan fuera del repositorio en el directorio temporal
`chorotega-6b-social-evidence`. El formulario está vacío y las tiendas contienen
solo datos sintéticos; no incluyen contraseñas, JWT, cookies o información real.
Se revisan visualmente escritorio y móvil, además de las aserciones de overflow.

### Validación inicial: 15 de noviembre de 2026 (Costa Rica)

| Verificación                                                            | Resultado                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Frontend unitarias                                                      | **148/148** (43 casos adicionales respecto a la base) |
| Suite nueva Chrome/Nest/PostgreSQL                                      | **28/28** (27 escenarios y contenedora)               |
| Navegador completo, antes de añadir los últimos tres escenarios nuevos  | **96/106; falló**                                     |
| Marketplace original, aislado en esta rama                              | **1/11; falló**                                       |
| Marketplace original, commit base limpio `6ee90823` en worktree aislado | **1/11; falló**                                       |
| Backend unitarias existentes con Node 22.22.0                           | **686/686; 48 suites**                                |
| Build frontend de producción                                            | Aprobado                                              |
| TypeScript frontend sin emisión ni incremental                          | Aprobado                                              |
| ESLint y Prettier de archivos del bloque                                | Aprobados                                             |

El fallo inicial de la ejecución completa fue `Tiempo agotado: login real` en
`test/browser/marketplace.test.mjs:218`, seguido de fallos en cascada. La misma
suite falló de forma aislada y sobre el commit base, que no incluye 6B, con el
mismo timeout. Esa primera comparación estableció el antecedente en la base,
pero todavía no demostró su causa. La evidencia capturada posteriormente se
describe abajo. Esta ejecución inicial sigue registrada como fallida; no se
suman resultados parciales para construir una aprobación.

Una copia diagnóstica temporal fuera del repositorio logró iniciar sesión y
completar las primeras búsquedas, pero luego registró timeouts de Chrome/CDP.
Solo observó estado del documento y cantidad de peticiones, sin registrar
credenciales. Esa ejecución no estableció una causa ni se presenta como solución.
En esa investigación inicial no se modificaron el test original, el launcher,
autenticación ni los timeouts.

El worktree base usó el mismo Node 24.21.0, versiones instaladas de dependencias,
Chrome y PostgreSQL temporal. Turbopack inicialmente rechazó el enlace externo de
node_modules; se reutilizaron mediante copia APFS las dependencias instaladas y
el build original aprobó, sin cambiar configuración ni instalar versiones nuevas.

Las pruebas específicas verifican también búsqueda, foco, orden y paginación con
el contrato social nuevo. Esa ejecución completa aprobó cuenta,
registro, carrito, compra e inventario, landing, detalle y redes; no alcanzó a
ejecutar los últimos escenarios de Marketplace. La corrección posterior se
valida con nuevas ejecuciones completas, sin reinterpretar ese resultado inicial.

Durante el desarrollo se ajustaron las fixtures unitarias al contrato nullable
6A y una fixture nueva de WhatsApp que inicialmente excedía VARCHAR(16); no se
modificó la columna ni se debilitaron validaciones.

Frontend y Chrome: Node 24.21.0. Los totales se solapan y no deben sumarse.
El CI aprobado citado al inicio corresponde al commit base. Los resultados
remotos de esta rama deben consultarse en sus checks de GitHub y Vercel; los
resultados locales de este documento no equivalen a una aprobación remota.

### Carrera de hidratación y corrección del test: 16 de noviembre de 2026

La investigación posterior reprodujo Marketplace aislado (**1/11**) y navegador
completo (**99/109**, ya con los tres últimos escenarios sociales), antes de
corregir el helper. Los diez fallos contabilizados eran el login inicial, ocho
casos dependientes y la prueba contenedora; otros nueve escenarios no llegaron a
registrarse. No representan diez defectos independientes.

Una copia diagnóstica del commit base `6ee90823`, con el mismo Node 24.21.0,
Chrome y PostgreSQL temporal que la rama, capturó la carrera: al rellenar el
correo, el documento estaba `interactive` y el formulario aún no tenía manejador
React. El DOM pasó de 0 a 20 caracteres, pero el estado React continuó vacío.
El siguiente envío quedó bloqueado por validación nativa; no hubo login hacia
NestJS. Solo se observaron longitudes, tipos y estados, nunca credenciales.

En otra reproducción sobre 6B, el POST `/api/auth/login` recibió **400 de Next.js**
sin llegar a NestJS, mientras Next seguía vivo y PostgreSQL conectado. No se
capturó el estado previo al envío en esa ejecución; no se afirma que ambas
variantes recorrieran exactamente la misma secuencia. Una copia con observación
más detallada aprobó **20/20**, lo que tampoco demostraba una corrección: la
instrumentación podía alterar el momento de las acciones. Se retiraron todas las
copias temporales y el worktree de diagnóstico.

La corrección permanente se limita al helper `login()` de
`apps/frontend/test/browser/marketplace.test.mjs`:

1. Conserva el documento si ya está en `/login`; navega explícitamente cuando
   necesita cambiar de ruta.
2. Espera el formulario cargado y comprueba que la contraseña está oculta.
3. Activa una sola vez «Mostrar contraseña» y espera `type="text"`, el nombre
   accesible «Ocultar contraseña» y `aria-pressed="true"`.
4. Activa una sola vez «Ocultar contraseña» y espera `type="password"`, el nombre
   accesible «Mostrar contraseña» y `aria-pressed="false"`.
5. Después rellena los campos, envía el formulario y conserva las aserciones de
   autenticación, catálogo privado y destinos: CLIENTE a `/mercado`, demás roles
   a `/cuenta` antes de explorar.

La señal decisiva es el comportamiento observable controlado por React;
`document.readyState` es solo una precondición. No se depende de propiedades
privadas de React, marcadores introducidos en la aplicación, pausas fijas,
reintentos de login ni aumentos de timeout. No cambian `support.mjs`, el formulario
funcional, el intermediario, JWT, cookies, guards, backend, carrito ni pedidos.

Esta carrera del test es distinta de los incidentes históricos de 401 y
`socket hang up` del backend bajo Node 24: no demuestra ni corrige sus causas.
Las repeticiones son ejecuciones independientes planificadas, no reintentos
automáticos hasta obtener verde. La validación no garantiza estabilidad absoluta
ni sustituye el CI de la futura publicación.

Resultados posteriores con Node **24.21.0**, Chrome **157.0.8103.79**, Next.js
**16.4.5** compilado y PostgreSQL **16** temporal:

| Verificación                                                   | Resultado   |
| -------------------------------------------------------------- | ----------- |
| Marketplace aislado, ejecución 1                               | **20/20**   |
| Marketplace aislado, ejecución 2                               | **20/20**   |
| Marketplace aislado, ejecución 3                               | **20/20**   |
| Navegador completo, archivos secuenciales                      | **118/118** |
| Comando normal `npm run test:browser`                          | **118/118** |
| Redes sociales en cada ejecución completa                      | **28/28**   |
| Frontend unitarias                                             | **148/148** |
| ESLint, TypeScript sin emisión ni incremental y build frontend | Aprobados   |

La ejecución completa secuencial aprobó **118/118** y el comando normal
`npm run test:browser` aprobó **118/118**, ambos con cero fallos, cancelaciones u
omisiones. En cada ejecución aprobaron los **28/28** casos de redes sociales y
los **20/20** de Marketplace; los totales se solapan y no se suman. El total de
118 incluye los nueve escenarios de Marketplace que antes no alcanzaban a
registrarse y los tres escenarios sociales añadidos después de la primera
medición de 106.

Las comprobaciones reales conservaron las redirecciones por rol, sesión HttpOnly,
rechazo de sesiones inválidas/vencidas y logout. La autenticación se completó
mediante el formulario existente y los intermediarios de Next.js contra NestJS
con PostgreSQL temporal; no se sustituyó el login por un JWT inyectado para
hacerlo aprobar. Los escenarios que prueban tokens inválidos conservan sus
fixtures específicas. Las suites de carrito, compra/inventario, registro, landing
y detalle también aprobaron.

Prettier, sintaxis, enlaces locales y `git diff --check` aprobaron. No se volvió a
ejecutar la batería unitaria independiente del backend en esta corrección; el
**686/686** de la tabla inicial es el resultado anterior, no una ejecución nueva.
No se realizaron comprobaciones en producción ni se instalaron dependencias.

Al cerrar esta corrección solo se añadieron cambios al test de Marketplace y a
este documento. Se verificó mediante SHA-256 que los otros 18 archivos originales
de 6B permanecen intactos. Al terminar esa validación los cambios seguían sin staging ni commit y la rama
no se había publicado. Los pases locales respaldan preparar el PR autorizado
para revisión, sin prometer estabilidad absoluta ni atribuirles la resolución
de los incidentes históricos del backend.

### Alcance del CI y publicación

El workflow actual `.github/workflows/ci.yml` ejecuta **ESLint y build** en el job
`Build Frontend`, con Node 24. No ejecuta `npm test` ni la suite completa de
navegador del frontend. Por tanto, un check remoto verde no sustituye las
**148 unitarias**, las tres repeticiones de Marketplace ni las dos ejecuciones
completas de navegador registradas localmente. `Build Backend` usa Node 22.22.0
y sí ejecuta su propia cobertura, integración y navegador MVC; esa suite es
distinta de la de Next.js. No se modifica el workflow en esta fase.

Los checks de Vercel corresponden al Preview Git automático. `Deploy production`
permanece bloqueado con el literal `false &&`; no se ejecutan despliegues
manuales ni migraciones remotas durante la preparación del PR. Las cuatro
capturas responsive continúan fuera del repositorio, con los nombres descritos
arriba; adjuntarlas visualmente al PR queda pendiente de carga manual. Una ruta
local no se presenta como imagen accesible desde GitHub.

El backend 6A y la migración `1794772600000-AddStoreSocialContact` ya están
integrados en `develop` mediante el PR #141. Esto no demuestra que producción
esté actualizada: el esquema y backend compatibles deben estar disponibles
antes de utilizar este frontend allí.

Comandos desde el repositorio, con dependencias ya instaladas y Docker disponible:

```bash
npm --prefix apps/frontend run lint
apps/frontend/node_modules/.bin/tsc --noEmit --incremental false --project apps/frontend/tsconfig.json
npm --prefix apps/frontend test
npm --prefix apps/frontend run build
cd apps/frontend
node --test --test-concurrency=1 test/browser/*.test.mjs
npm run test:browser
```

Se comprueban tanto la ejecución secuencial por archivo como el comando normal
del proyecto, que no fija concurrencia. No se añaden reintentos ni se aumentan
timeouts. El backend de las pruebas usa exclusivamente la URL del
contenedor y Next.js recibe `API_URL` explícita de loopback. No es una validación
de las plataformas de producción.

## Prerrequisitos y límites

- Antes de desplegar este frontend deben estar publicados el backend 6A y su
  migración. No se afirma que eso ya haya ocurrido en producción.
- No se modifica backend, migraciones, dependencias, autenticación, CI/CD ni
  configuración de proveedores. El despliegue productivo continúa bloqueado.
- No hay edición de tiendas propias: queda para la fase 6C.
- Logo, fotografías, favoritos y notificaciones permanecen fuera del bloque.
- Los incidentes históricos de Node 24 de la fase A no se consideran corregidos
  por resultados de estas pruebas frontend.
