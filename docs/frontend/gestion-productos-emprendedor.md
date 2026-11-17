# Fase 7: Gestión de productos del emprendedor

Base: `2560c8ac2fc7e6ad38fd419571f2885082644f01`, PR #143 integrado en
`develop`, con [CI posterior al merge aprobado](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44005446053).
Rama de implementación: `feature/gestion-productos-emprendedor`. Código preparado
para revisión mediante PR hacia `develop`; esta fase no autoriza merge,
despliegue productivo ni migraciones remotas.

## Objetivo y páginas

Permitir a EMPRENDEDOR consultar, crear y editar productos de sus propias tiendas
mediante los contratos REST existentes. Se reutilizan el layout, sesión, estilos y
helpers de [Mi negocio](gestion-tiendas-emprendedor.md), sin cambiar backend,
entidades, migraciones, dependencias o autenticación global.

| Página                                                 | Función                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `/mi-negocio/tiendas/:id/productos`                    | Listado paginado, búsqueda por nombre y acceso a creación/edición. |
| `/mi-negocio/tiendas/:id/productos/nuevo`              | Formulario validado y confirmación de creación.                    |
| `/mi-negocio/tiendas/:id/productos/:productoId/editar` | Datos reales, PATCH parcial y revisión de conflictos de versión.   |

Cada tarjeta de Mis tiendas incorpora «Gestionar productos» y conserva «Editar
tienda» y «Ver tienda». CLIENTE, ADMIN y REPARTIDOR no acceden a esta interfaz:
el layout los devuelve a `/cuenta` y los BFF rechazan su rol. Esto no cambia los
permisos de ADMIN en la API REST o en MVC. Una sesión ausente utiliza la
recuperación existente; una sesión inválida o vencida termina en login.

El listado muestra nombre, categoría, descripción, precio, existencias y estado.
Incluye tiendas activas e inactivas y productos ACTIVO, INACTIVO y AGOTADO, incluso
con cero unidades. No se reutiliza el BFF del marketplace que filtra disponibilidad.
Los tres estados son independientes de la cantidad: no se inventan transiciones
automáticas. La paginación usa páginas de seis registros, conteo de PostgreSQL y
orden estable por ID ASC. Buscar o limpiar reinicia la página; NestJS conserva el
tratamiento literal de `%`, `_` y `\` mediante SQL parametrizado.

## Arquitectura y BFF privados

| Método y ruta                                             | Contrato                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET `/api/mi-negocio/tiendas/:id/productos`               | Admite únicamente `page`, `size` (1–100) y `nombre` (150). Impone `idTienda` en servidor.      |
| POST `/api/mi-negocio/tiendas/:id/productos`              | Deriva tienda de la ruta autorizada. Devuelve 201 y Location del recurso BFF.                  |
| GET `/api/mi-negocio/tiendas/:id/productos/:productoId`   | Devuelve tienda y producto proyectados dentro del alcance autorizado.                          |
| PATCH `/api/mi-negocio/tiendas/:id/productos/:productoId` | Campos modificados y versión original obligatoria. No permite traslado de tienda.              |
| GET `/api/mi-negocio/categorias`                          | Catálogo real proyectado, incluidas categorías inactivas para reconocer asignaciones antiguas. |

Todos autentican con la cookie HttpOnly y `/auth/me`, exigen EMPRENDEDOR y
comprueban propiedad con `ownedStore()` antes de consultar productos. Los IDs
deben ser enteros positivos del rango PostgreSQL. Los filtros de tienda, estado,
disponibilidad, propietario, parámetros repetidos o desconocidos se rechazan.
Las respuestas y lecturas hacia NestJS usan `no-store`. No hay almacenamiento de
productos ni credenciales en localStorage/sessionStorage.

La revisión final sustituyó el recorrido de páginas del detalle por una única
lectura REST `GET /api/v1/products/:id`. La secuencia obligatoria es autenticar,
exigir EMPRENDEDOR, comprobar que la tienda solicitada pertenece al usuario y,
solo entonces, consultar el producto. `scopedProduct()` valida el contrato y el
ID recibido, comprueba `producto.idTienda` y devuelve únicamente la proyección
permitida. Producto inexistente o de otra tienda, incluso otra tienda propia,
devuelve 404 sin incluir su nombre, precio u otros datos. Un contrato inválido o
un ID de respuesta distinto produce 502 seguro. No se almacena la respuesta.

Esto es compatible con el catálogo REST autenticado existente: NestJS permite esa
lectura por ID y no la restringe por propietario. La restricción de pertenencia
del detalle se aplica en el servidor Next.js antes de responder, no mediante un
predicado de propietario en el SQL de ese GET. El listado sí conserva el filtro
SQL por tienda antes de paginar y contar. La autorización definitiva de las
escrituras continúa en NestJS. No se agregan permisos ni se modifica el backend.

El detalle requiere una consulta de producto independiente del tamaño de la
tienda, además de las comprobaciones de identidad y tienda. Se adaptaron las dos
pruebas del recorrido anterior, conservando sus controles y sin eliminar casos;
se añadieron regresiones para los tres estados, contratos rotos y datos ajenos.
Una prueba con 10001 productos simulados y otra Chrome/Nest/PostgreSQL con 151
productos reales en una tienda confirman una única lectura por ID, sin recorrer
páginas. El ajuste se limita al helper de Fase 7, sus dos archivos de pruebas y
este documento; no cambia las pantallas ni el contrato de versión.

POST/PATCH requieren JSON y Origin exactamente igual al origen de Next.js. No se
acepta Origin ausente, `null` o externo. La whitelist excluye `idTienda`, propietario,
ID del producto, fechas y campos desconocidos. NestJS conserva la autorización
definitiva de escritura en su servicio y SQL condicionado por propietario.
No se cambian cookies, JWT, CORS, guards, CSRF de MVC ni permisos existentes.

Se conservan 400 (entrada), 401 (sesión), 403 (rol/origen), 404 (recurso no visible)
y 409 (versión). Fallos inesperados tienen respuesta segura; errores de red,
timeout o contratos rotos se representan como 502. No se refleja SQL, stack ni
mensajes arbitrarios del backend.

## Formulario y semántica de escritura

Campos: nombre obligatorio (150), categoría, descripción opcional (500), precio,
existencias enteras 0–2147483647 y estado entre los tres valores existentes.
Hay etiquetas, errores por campo, foco al primer error y conservación de valores.
No hay imágenes ficticias, carga de archivos, eliminación o traslado de productos.

Las opciones nuevas de categoría son activas. La asignación inactiva existente se
muestra y puede conservarse sin reenviarla; cambiarla requiere una activa. El BFF
vuelve a consultar una categoría nueva antes de escribir. Categoría inexistente
produce 404 e inactiva nueva produce 400. El backend actual solo verifica existencia:
esta comprobación de estado en el BFF no es atómica con una posible desactivación
concurrente por otro administrador. No se promete ese aislamiento adicional.

En PATCH se comparan valores con la última respuesta confirmada: omitido conserva,
descripción vaciada se envía como `null`, campo modificado se reemplaza. No se envía
un PATCH vacío ni de solo versión. Las cantidades/estados no cambian implícitamente.
Una respuesta válida actualiza la instantánea local; recargar confirma persistencia.

La referencia síncrona de envío y los controles deshabilitados impiden doble envío
simultáneo en el formulario. POST confirmado muestra el producto creado y enlaces
al listado/edición. Ante red o 5xx se conserva el formulario y se bloquea otro envío:
se debe revisar el listado y confirmar explícitamente la revisión para habilitar
otro intento. Esa confirmación no repite la petición por sí sola. No hay idempotencia
distribuida: reintentar manualmente sin comprobar puede duplicar una creación que
ya se guardó. Recargar/abrir otra pestaña tampoco conserva este bloqueo local.

## Precios exactos

`priceInput()` valida el texto decimal antes de convertir al número del DTO:
admite coma o punto, máximo dos decimales, sin separadores de miles, signos,
exponentes o valores no finitos. Canoniza dos decimales, calcula centavos con
BigInt y exige 1–9999999999 centavos (₡0,01–₡99.999.999,99). Finalmente verifica
que el número serializable conserva la equivalencia en centavos. La comparación
de cambios monetarios usa centavos; `1500` y `1500.00` son equivalentes.

La API mantiene precios de respuesta como cadenas decimales exactas; su
presentación usa el formateador CRC existente. No se calculan totales de compras
ni se altera el precio definitivo o inventario del backend.

## Concurrencia optimista e inventario

La versión recibida al abrir el producto se conserva junto con sus datos originales.
PATCH incluye esa versión, aunque una lectura del BFF observe una posterior.
El backend existente realiza UPDATE condicionado por ID, propietario y versión,
e incrementa la versión atómicamente. No basta con recibir una lectura reciente.

Ante 409 se muestra «Este producto cambió desde que lo abriste», se conservan
campos y versión originales y se bloquea guardar. «Consultar versión vigente»
solo lee y muestra una comparación: no sustituye los campos ni realiza PATCH.
«Descartar mis cambios y cargar versión vigente» es una decisión explícita que
reemplaza la instantánea; después el usuario debe editar y guardar de nuevo.
No hay mezcla automática, actualización silenciosa de versión ni reintentos ciegos.
Una escritura ambigua en edición también exige consultar y recargar expresamente.

Pedidos conserva sus bloqueos pesimistas, versión de inventario, transacción y
rollback. La prueba nueva retiene una fila PostgreSQL, inicia compra y PATCH de
stock desde Chrome y confirma dos operaciones esperando el bloqueo antes de
liberarlo. Son válidos dos órdenes: compra primero → stock 8 y PATCH 409;
edición a 100 primero → compra descuenta a 98. Se comprueban versión y estado.
La ejecución inicial observó compra 201, PATCH 409, stock 8 y versión 2. La suite
REST existente verifica por separado ambos órdenes, dos PATCH concurrentes,
permisos y rollback; no se modifica esa lógica.

## Validaciones locales y evidencias

Las pruebas son locales, con usuarios y datos sintéticos, Chrome, Next compilado,
NestJS y PostgreSQL Testcontainers aislado. No utilizan Supabase, Atlas o servicios
de producción. Las cuentas y JWT se mantienen solo en memoria y no se registran.

| Validación                                    | Resultado                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unitarias frontend, `npm test`                | 221/221 después del ajuste.                                                                                 |
| Nueva suite Chrome → Next → Nest → PostgreSQL | 24/24 después del ajuste.                                                                                   |
| Navegador completo, `npm run test:browser`    | 169/169 después del ajuste. Incluye registro, sesiones, tiendas, marketplace, carrito y pedidos existentes. |
| Unitarias backend, Node.js 22.22.0            | 686/686, 48 suites.                                                                                         |
| Integración backend seleccionada, rama actual | 235/235 en la revisión final, cuatro suites, Node.js 22.22.0 y `--runInBand`.                               |
| Mismo conjunto en worktree limpio de la base  | 235/235, mismas dependencias y comando, Node.js 22.22.0 y PostgreSQL temporal.                              |
| ESLint y TypeScript frontend/backend          | Aprobados.                                                                                                  |
| Builds frontend/backend                       | Aprobados.                                                                                                  |

Frontend y la integración Chrome utilizan Node.js 24.21.0 del entorno local;
las unitarias y Jest de integración del backend utilizan Node.js 22.22.0. No se
afirma que los resultados locales sean CI de esta rama: se obtuvieron antes de
publicarla y los checks remotos deben verificarse por separado.
El CI actual del frontend no ejecuta su suite completa de navegador.

Incidencia conservada: en la ejecución seleccionada inicial, la suite existente
`catalog-write-security.integration-spec.ts` esperaba 201 de `/auth/login` en
beforeEach y recibió 401 en «post categories / JWT invalid devuelve 401 sin
escribir» y «delete categories / EMPRENDEDOR recibe 403». El fallo fue de
preparación, antes de esas operaciones. Las otras tres suites aprobaron.
Ocurrió bajo Node.js 22.22.0; no debe atribuirse exclusivamente a Node 24. No se
modificó autenticación, pruebas del backend o timeouts ni se demostró su causa.
Un contraste aislado posterior de la suite aprobó 88/88; no demuestra que el
fallo haya quedado corregido. Los logs se conservan fuera de Git en
`/private/tmp/phase7-backend-integration.log` y
`/private/tmp/phase7-catalog-isolated.log`.

La revisión final ejecutó el mismo conjunto de cuatro suites una vez en la rama
actual y una vez en un worktree limpio y separado de
`2560c8ac2fc7e6ad38fd419571f2885082644f01`. Ambos aprobaron 235/235 sin cambiar
autenticación, expectativas, concurrencia o timeouts. Se compararon los 284
archivos versionados del backend y eran idénticos entre ambos árboles. El
worktree reutilizó mediante un enlace las mismas dependencias instaladas; no se
instalaron paquetes ni se cargaron archivos `.env`. Cada suite utilizó su propio
PostgreSQL Testcontainers. La rama principal de trabajo no cambió.

La evidencia original confirma una respuesta HTTP 401 recibida por Supertest al
invocar el servidor HTTP de NestJS desde `beforeEach`, no un fallo de aserción que
genere por sí mismo ese código. No se guardó el cuerpo Problem Details, la cuenta
exacta del bucle ni una traza interna de aquella respuesta; no se puede identificar
si provino de autenticación de credenciales u otro componente de la petición.
El código de preparación genera un hash de una contraseña sintética y utiliza la
misma variable en el login; guarda cada cuenta ACTIVA antes de llamar al endpoint.
Esto es coherente y funcionó en las repeticiones, pero no comprueba retrospectivamente
la fila o comparación bcrypt en los dos instantes fallidos.

Se revisó el estado compartido: cada archivo tiene su app/base, el contexto se
reutiliza entre sus casos, `afterEach` espera TRUNCATE y restaura mocks, y
`afterAll` cierra la aplicación/contenedor y restaura JWT_SECRET. La ejecución es
secuencial entre archivos. No se encontraron mocks de autenticación ni cambios de
metadata en la suite del catálogo. El login declara AuthRateLimitGuard, cuyo
rechazo es 429; ese guard por sí solo no explica un 401. No se demostró una carrera,
credencial incorrecta, cierre prematuro o agotamiento de recursos.

El síntoma no volvió a aparecer en ninguna de las dos versiones; la causa sigue
abierta y no se considera corregida ni reproducida en la base durante esta revisión.
Si reaparece, el siguiente diagnóstico útil es capturar de forma controlada el
status/cuerpo público de la respuesta y correlacionar etapas de login, existencia
y estado de la fila y resultado booleano de bcrypt, sin valores de credenciales.
Eso requiere una investigación específica, sin ampliar esta fase ni modificar
autenticación para lograr resultados verdes. Logs nuevos, fuera de Git:
`/private/tmp/phase7-review-integration-current.log` y
`/private/tmp/phase7-review-integration-base.log`.

Los resultados previos de frontend (216 unitarias, 23 de la suite nueva y 168 del
navegador completo) corresponden a la implementación anterior del detalle. Los
221/24/169 de la tabla son ejecuciones nuevas tras el ajuste, no una reinterpretación
de las anteriores. Prettier, sintaxis, enlaces locales y `git diff --check` se
verifican sobre los 17 archivos finales.

Comandos desde cada workspace, con la versión de Node indicada:

```sh
# apps/frontend
npm test
node --test test/browser/managed-products.test.mjs
npm run test:browser
npm run lint
node_modules/.bin/tsc --noEmit --incremental false
npm run build

# apps/backend (Node.js 22.22.0; Docker para integración)
npm test -- --runInBand
npm run test:integration -- --testPathPatterns='http/(products|product-optimistic-concurrency|catalog-write-security|orders)\.integration-spec\.ts$'
npm run lint
node_modules/.bin/tsc --noEmit --incremental false
npm run build
```

La suite nueva crea siete capturas fuera del repositorio, en
`/private/tmp/chorotega-phase7-product-evidence/`: `productos-320.png`,
`productos-1440.png`, `nuevo-320.png`, `nuevo-1440.png`, `editar-320.png`,
`editar-1440.png` y `conflicto-version.png`. Se verificaron listado y ambos
formularios en 320, 390, 768, 1280 y 1440 px sin desbordamiento horizontal.
Solo se muestran datos sintéticos; no son pruebas manuales de producción.
La identidad visual reutiliza Mi negocio; no se proporcionó un frame Figma
específico para estas pantallas y no se atribuye una réplica exacta.

No se ejecutaron la integración completa del backend, E2E completas ni Chrome MVC
del backend en esta fase. La regresión seleccionada y el navegador completo del
frontend no sustituyen esas suites. Los incidentes históricos de socket/401 y
Chrome no se declaran corregidos por una ejecución posterior aprobada.

## Limitaciones y revisión pendiente

- Mantener visible la incidencia 401 al preparar el PR. Las verificaciones actuales
  permiten recomendar revisión mediante PR, pero no demuestran su causa ni autorizan
  merge o publicación productiva.
- El GET de detalle del backend es un catálogo autenticado, no una lectura SQL
  restringida por propietario. El BFF impide devolver un producto de otra tienda;
  las escrituras mantienen la autorización SQL del backend.
- El catálogo de categorías se obtiene completo paginando; no es una instantánea
  transaccional. Un cambio de conteos durante la lectura produce error seguro y
  requiere reintento, en lugar de mostrar un catálogo incompleto.
- No hay autosave, borradores persistentes, idempotencia distribuida, carga de
  imágenes, eliminación ni traslados. Cambiar de página pierde valores locales.
- El esquema productivo debe contener las migraciones ya existentes de versión
  de productos y contactos de tiendas; esta implementación no añade migraciones
  ni las ejecuta en bases remotas, y tampoco verifica esas bases.

Al finalizar la revisión local, los cambios estaban sin staging ni commit.
La autorización posterior permite publicarlos mediante PR para revisión;
no incluye merge ni despliegue productivo. Las capturas locales deben adjuntarse
manualmente al PR y sus rutas temporales no son enlaces públicos.
