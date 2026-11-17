# Fase 6C: Mi negocio y edición de tiendas

Base: `d9e52c0f39c5b76e0d8460acc88258588250efba`, PR #142 integrado en
`develop`, con [CI posterior al merge aprobado](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/43994729585).
Rama: `feature/gestion-tiendas-emprendedor`. La implementación se prepara para
revisión mediante PR hacia `develop`. La autorización de publicación de la rama
no incluye merge ni despliegue de producción.

## Páginas y navegación

- `/mi-negocio/tiendas`: listado de todas las tiendas propias, activas e inactivas,
  con nombre, descripción, dirección, teléfono, horario, estado y contactos
  registrados. Pagina seis registros mediante SQL y usa el total de PostgreSQL.
  Incluye carga, vacío, errores seguros y reintento explícito.
- `/mi-negocio/tiendas/[id]/editar`: precarga los datos reales. Permite editar
  nombre, descripción, dirección, teléfono comercial, horario, Instagram,
  Facebook y WhatsApp comercial. Incluye validación por campo, conservación de
  valores, confirmación tras guardar y Cancelar al listado.
- En `/cuenta`, EMPRENDEDOR dispone de «Gestionar mi negocio» y de «Mi negocio»
  en su dropdown. Los demás roles conservan su navegación. CLIENTE continúa
  entrando a `/mercado`; no cambia Mis pedidos ni carrito.

El layout consulta el perfil vigente mediante la cookie HttpOnly y `/auth/me`.
Sin sesión utiliza la redirección existente a `/api/auth/session`; otros roles
se redirigen a `/cuenta`, sin montar la gestión. `SessionBoundary` mantiene sus
verificaciones de identidad, foco y vencimiento. La seguridad no depende de
ocultar enlaces: todos los BFF vuelven a autenticar y comprobar el rol.

## BFF separado del marketplace

| Método y ruta                               | Comportamiento                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET `/api/mi-negocio/tiendas?page=0&size=6` | Solo EMPRENDEDOR. Añade `idEmprendedor` desde `/auth/me`, no desde la petición. No impone estado ACTIVA. |
| GET `/api/mi-negocio/tiendas/:id`           | Solo devuelve el DTO proyectado si la tienda pertenece al usuario; ajena o inexistente devuelve 404.     |
| PATCH `/api/mi-negocio/tiendas/:id`         | Valida origen, JSON, whitelist y propiedad; reenvía los campos a PATCH `/api/v1/stores/:id`.             |

Los parámetros admitidos del listado son únicamente `page` y `size` (1–100).
Filtros de propietario o estado, parámetros repetidos o desconocidos se rechazan
con 400. La consulta a NestJS deriva el propietario y solicita orden por ID ASC;
PostgreSQL aplica el filtro antes del conteo y paginación. El BFF comprueba además
que todos los registros recibidos pertenecen al perfil autenticado, permitiendo
ambos estados. Una respuesta inconsistente se rechaza, sin exponerla.

Todas las respuestas de gestión llevan `Cache-Control: no-store`; las llamadas
al backend usan `cache: no-store`. La proyección enumera campos de StoreResponseDto,
excluyendo relaciones, credenciales u objetos internos. Los contactos pasan por
la validación segura ya incorporada en [6B](redes-sociales-tiendas.md).

La lectura REST existente de tiendas sigue siendo un catálogo autenticado; la
restricción específica de estas pantallas se aplica en los BFF nuevos. La
autorización definitiva de las escrituras permanece en NestJS: su servicio y
UPDATE SQL condicionado por propietario impiden escribir tiendas ajenas,
incluso ante una carrera entre el GET de comprobación y PATCH. No se cambia ese
servicio ni el contrato REST.

## PATCH, validación y seguridad

El formulario compara sus valores con la última respuesta confirmada:

- Un campo sin cambios se omite y no sobrescribe información.
- Un opcional antes registrado que se deja vacío se envía como `null`.
- Un valor válido modificado se reemplaza; NestJS normaliza los contactos.
- Sin cambios no se envía una escritura.

Nombre (150) y dirección (255) son obligatorios y rechazan null o solo espacios.
Descripción (500), teléfono (20) y horario (150) son opcionales. Las redes usan
las reglas compartidas de 6B y la validación definitiva de NestJS: URLs HTTPS de
perfiles admitidos y WhatsApp internacional explícito, nunca inferido a partir
del teléfono personal. El teléfono de esta pantalla es comercial, no el perfil
del usuario. Los enlaces se muestran solo si existen y su formato es seguro,
con `noopener noreferrer`; no se verifica titularidad ni se hacen consultas a
redes sociales.

La whitelist del BFF rechaza `idEmprendedor`, `idTienda`, `estado` y cualquier
campo adicional. No hay transferencia, cambio de estado, creación o eliminación
de tiendas en esta fase. No se añade gestión de productos.

PATCH exige `Content-Type: application/json` y `Origin` exactamente igual al
origen de la petición Next.js. Un origen ausente, null o diferente produce 403
tras autenticar. No se relajan cookies, CORS ni CSRF existentes. El navegador
mismo añade Origin a su PATCH del mismo origen; herramientas manuales deben
incluirlo. No se confía en identidades suministradas por el cliente.

Se conservan 400, 401, 403 y 404; los errores inesperados devuelven 500 seguro,
y los fallos de red/timeout o contratos rotos 502. No se refleja SQL, stack ni
mensajes arbitrarios del backend. Ante 401 se elimina la cookie de sesión y el
navegador vuelve al login. Los errores conservan los valores del formulario.
La confirmación de guardado solo aparece con una respuesta válida del BFF.
Ante una respuesta perdida se advierte que no pudo confirmarse y se solicita
recargar para comprobar el resultado antes de volver a guardar; no se reenvía
automáticamente ni se promete idempotencia o control de versiones de tiendas.

## Diseño y evidencia local

Se reutilizan `AccountHeader`, `AccountMenu`, `SessionBoundary`, las tipografías,
crema `#f7f3ea`, verde `#244f3e` y verde oscuro `#203b30`. Los estilos nuevos están
aislados en CSS Module. No se proporcionó un frame/exportación específico de
Figma para gestión: es una propuesta consistente con el sistema, no una réplica
exacta atribuida a un diseño inexistente.

El listado y formulario se verifican a 320, 390, 768, 1280 y 1440 px, con foco
visible, labels, mensajes asociados, estados anunciados y controles de al menos
44 px. Las capturas reales se generan fuera del repositorio en
`/private/tmp/chorotega-6c-business-evidence/`:

- `mis-tiendas-320.png` y `mis-tiendas-1440.png`.
- `editar-tienda-320.png` y `editar-tienda-1440.png`.

Solo contienen fixtures sintéticas del contenedor, sin contraseñas, cookies,
JWT ni datos productivos. Las rutas locales no se presentan como imágenes
publicadas en GitHub.

## Pruebas

Las unitarias nuevas validan whitelist, campos, longitudes, PATCH parcial y null,
proyección, propietario derivado, contratos, origen y respuestas seguras. La
suite Chrome nueva recorre Next.js → NestJS → PostgreSQL 16 temporal con las
cinco migraciones existentes, incluyendo las de versión y contactos sociales.
Nunca carga el DataSource CLI ni apunta a Supabase.

Comprueba roles, JWT ausente/inválido/vencido, varias tiendas, inactivas, conteo,
paginación, aislamiento, edición ajena, persistencia tras recargar, validación
sin escritura, contactos, red y reintento. También llama directamente a NestJS
con login real para comprobar el 404 de PATCH ajeno, sin el BFF de por medio.
Los rechazos controlados de 400/500 y la carga pendiente se inyectan únicamente
en instancias del servicio del contenedor y se restauran en finally. No se
alteran guards, DTOs, entidades ni fuentes del backend.

La primera ejecución nueva de Chrome quedó 23/26: el selector de cuenta elegía
el enlace oculto del dropdown en lugar del enlace visible esperado, lo que
impidió navegar y causó el fallo siguiente de paginación y de la contenedora.
Se corrigió el selector conservando la expectativa «Gestionar mi negocio».
La siguiente ejecución aprobó 26/26. Después se incorporó una comprobación de
carga; la versión final aprobó 27/27, como registra la tabla siguiente.

El primer intento unitario backend quedó 562/686 en el sandbox, con errores
`listen EPERM` al abrir sockets locales. Con permisos de sockets y sin cambios
de código aprobó 686/686. Se conserva la distinción entre un impedimento del
entorno y una regresión funcional.

La integración backend seleccionada inicial quedó 173/174: `socket hang up` en
`catalog-write-security.integration-spec.ts`, caso «post stores › CLIENTE recibe
403 sin escribir». No hay código backend modificado ni causa raíz demostrada.
El log no identifica si se interrumpió el login de preparación o el POST.
Un pase posterior no se presentará como corrección de ese incidente ni de los
incidentes históricos de Node 24.

Resultados finales del **16 de noviembre de 2026 (Costa Rica)**:

| Validación                                                                  | Resultado                               |
| --------------------------------------------------------------------------- | --------------------------------------- |
| Frontend unitarias, existentes y nuevas                                     | **184/184**                             |
| Suite nueva Chrome/Nest/PostgreSQL, final con prueba de carga               | **27/27** (26 escenarios y contenedora) |
| Navegador completo secuencial, primera versión sin el escenario de carga    | **144/144**                             |
| Navegador completo secuencial, versión final                                | **145/145**                             |
| Comando normal `npm run test:browser`, versión final                        | **145/145**                             |
| Backend unitarias, fuera de la restricción de sockets                       | **686/686; 48 suites**                  |
| Integración backend seleccionada, primera ejecución                         | **173/174; falló**                      |
| Mismas tres suites backend, una ejecución controlada sin Chrome en paralelo | **174/174**                             |
| Builds frontend y backend                                                   | Aprobados                               |
| ESLint y TypeScript sin emisión ni incremental, frontend y backend          | Aprobados                               |
| Prettier, enlaces locales y `git diff --check`                              | Aprobados                               |

Frontend y Chrome usan Node **24.21.0** y Chrome **157.0.8103.79**, con Next.js
**16.4.5** compilado. El backend independiente se verificó con Node **22.22.0**.
Los conjuntos se solapan y no se suman. La ejecución normal y la secuencial
completaron todos sus escenarios, incluidos registro, carrito, compra e inventario,
landing, búsquedas, detalle y contactos; cero fallos, omisiones o cancelaciones.

La integración seleccionada ejecutó `stores`, `store-social-contact` y
`catalog-write-security`. El pase controlado no prueba que Chrome en paralelo
causara el incidente anterior. No se modificaron esas suites ni sus timeouts y
no se afirma que el `socket hang up` esté corregido. La integración backend
completa, su E2E independiente y Chrome MVC del backend no se ejecutaron en esta
fase: no deben confundirse con las tres suites seleccionadas o con el navegador
de Next.js. Los checks del CI citados al inicio pertenecen al commit base, no a
estos cambios locales.

Comandos utilizados desde `apps/frontend` (con Docker y Chrome disponibles):

```bash
npm test
node --test test/browser/managed-stores.test.mjs
node --test --test-concurrency=1 test/browser/*.test.mjs
npm run test:browser
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
```

Desde `apps/backend`, con Node 22.22.0:

```bash
npm test -- --runInBand
npm run test:integration -- --testPathPatterns='(stores|store-social-contact|catalog-write-security)\.integration-spec\.ts$'
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
```

El backend de navegador se crea con `createHttpTestApp`, que usa el DataSource
exclusivo del contenedor y no carga ConfigModule.forRoot ni archivos privados.
Next recibe `API_URL` explícita de loopback. Las bases y aplicaciones temporales
se cierran en finally; se conserva el PostgreSQL local que ya existía antes de
esta fase. No se prueban servicios remotos ni se cambian variables privadas.

## Archivos de la fase

Modificados:

- [Página de cuenta](../../apps/frontend/app/cuenta/page.tsx).
- [Menú de cuenta](../../apps/frontend/components/account-menu.tsx).

Nuevos:

- [BFF listado](../../apps/frontend/app/api/mi-negocio/tiendas/route.ts) y
  [BFF detalle/PATCH](../../apps/frontend/app/api/mi-negocio/tiendas/[id]/route.ts).
- [Layout privado](../../apps/frontend/app/mi-negocio/layout.tsx),
  [listado](../../apps/frontend/app/mi-negocio/tiendas/page.tsx),
  [edición](../../apps/frontend/app/mi-negocio/tiendas/[id]/editar/page.tsx),
  [carga](../../apps/frontend/app/mi-negocio/tiendas/loading.tsx) y
  [error](../../apps/frontend/app/mi-negocio/tiendas/error.tsx).
- [Listado cliente](../../apps/frontend/components/business/store-manager.tsx),
  [formulario](../../apps/frontend/components/business/store-editor.tsx) y
  [CSS Module](../../apps/frontend/components/business/business.module.css).
- [Validación y diff PATCH](../../apps/frontend/lib/managed-stores.ts) y
  [autorización/proyección del servidor](../../apps/frontend/lib/managed-stores-api.ts).
- [Unitarias](../../apps/frontend/test/managed-stores.test.mjs) y
  [Chrome/Nest/PostgreSQL](../../apps/frontend/test/browser/managed-stores.test.mjs).
- Este documento.

## Límites y preparación de publicación

- Producción no se consulta ni se modifica. Requiere backend 6A y su migración
  aplicados antes de utilizar los contactos en estas pantallas.
- No se modifica backend, migraciones, dependencias, CI/CD, logging, proveedores,
  main ni las reglas de negocio. El despliegue productivo conserva su bloqueo.
- No hay bloqueo optimista de tiendas ni fusión de ediciones simultáneas sobre
  el mismo campo. Los campos omitidos permanecen, pero dos cambios concurrentes
  sobre el mismo campo conservan el comportamiento actual de NestJS.
- El CI actual del frontend ejecuta lint y build, no su batería completa de
  navegador; sus checks remotos no sustituyen las pruebas locales.
- No se incorpora búsqueda adicional, gestión de productos, favoritos,
  notificaciones, pagos o eliminación de tiendas.
