# Fase 9A: Panel del repartidor

Base: `70422f4c0f2b31653edbf3adde07b0144ccbb275`, merge del PR #145.
El [CI posterior al merge](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44156356596)
terminó en Success antes de crear `feature/panel-repartidor-entregas`.
Validación local: 17 de noviembre de 2026, Costa Rica. Cambios locales para revisión;
no autoriza commit, push, PR, merge ni despliegue.

## Objetivo y alcance

El REPARTIDOR puede consultar sus entregas, iniciar una entrega asignada y completar
una entrega en camino. Se reutilizan los contratos, guards, repositorios y servicios
existentes de NestJS, sin cambios backend, migraciones ni dependencias nuevas.

La Fase 9A es exclusivamente la experiencia del REPARTIDOR. La futura Fase 9B
administrativa no está implementada aquí: no hay asignación, cancelación ni selector
de repartidor en el panel.

## Arquitectura y navegación

| Página              | Función                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `/mis-entregas`     | Listado paginado, filtro por estado, carga, vacío, error y reintento. |
| `/mis-entregas/:id` | Consulta directa por ID, detalle y acciones confirmadas.              |

El layout utiliza `requireCurrentUser`, `AccountHeader` y `SessionBoundary`.
Sin sesión se usa la recuperación existente; un rol distinto de REPARTIDOR vuelve
a `/cuenta`. Un fallo de verificación de identidad muestra `ProfileUnavailable`.
Se añade «Mis entregas» únicamente al AccountMenu y a `/cuenta` del REPARTIDOR.
No se cambia el login ni su destino `/cuenta`, tampoco los menús de otros roles.

Se reutilizan `apiRequest`, la cookie HttpOnly, el hook `useBusinessData` (cancelación
y descarte de lecturas de otra ruta), validadores de ID/página y los CSS Modules de
Mi negocio. El panel mantiene fondo crema, verdes, botones de al menos 44 px,
etiquetas de estado legibles, foco visible y diseño móvil de una columna.

## BFF y contratos

| BFF privado Next.js                    | NestJS existente                       |
| -------------------------------------- | -------------------------------------- |
| GET `/api/mis-entregas`                | GET `/api/v1/deliveries`               |
| GET `/api/mis-entregas/:id`            | GET `/api/v1/deliveries/:id`           |
| GET `/api/mis-entregas/:id/destino`    | GET `/api/v1/deliveries/:id/destination` |
| POST `/api/mis-entregas/:id/iniciar`   | POST `/api/v1/deliveries/:id/start`    |
| POST `/api/mis-entregas/:id/completar` | POST `/api/v1/deliveries/:id/complete` |

Las escrituras son **POST**, con cuerpo `{}`. No son PATCH y no envían estado,
identificadores de usuario, repartidor o pedido suministrados por el cliente.

El listado admite únicamente `page`, `size` (1–100; interfaz 6) y `estado`, sin
parámetros repetidos. Impone `fechaAsignacion DESC`; NestJS añade el desempate por
ID. Se valida que la página retornada coincida con la solicitada, conteos,
identificadores únicos y estado filtrado. No se cargan todas las entregas ni se
filtran filas posteriormente para inventar un conteo.

Cada entrega se valida y proyecta a los seis campos existentes: `idEntrega`,
`idPedido`, `idRepartidor`, `estado`, `fechaAsignacion` y `fechaEntrega`. Se exigen IDs
enteros positivos de 32 bits y timestamps UTC ISO de la serialización JSON de Date.
ENTREGADA requiere fecha de entrega no anterior a la asignación; los demás estados
conservan `fechaEntrega: null`. No se trasladan relaciones, perfiles ni campos extra.

El destino usa un contrato separado con solo `idEntrega`, `idPedido`,
`direccionEntrega` y `nombreBarrio`. NestJS une pedido, barrio y repartidor en una
consulta que condiciona simultáneamente el ID, `repartidor.idUsuario` y los estados
`ASIGNADA`/`EN_CAMINO`. Entregas ajenas, inexistentes, finalizadas o canceladas
responden 404. El cliente no consulta el endpoint en estados terminales y desmonta
la dirección cuando observa una transición a ENTREGADA o CANCELADA. Los errores de
lectura se muestran sin información sensible y permiten un reintento explícito.

## Identidad, roles y propiedad

Cada BFF vuelve a verificar la identidad vigente con `/auth/me`. Una cookie o rol
de interfaz no basta: el backend valida firma/expiración, cuenta ACTIVO y rol actual
desde PostgreSQL. ADMIN, CLIENTE y EMPRENDEDOR reciben 403 en estos BFF exclusivos.
El endpoint REST de destino también exige el rol REPARTIDOR; los permisos REST
administrativos existentes para otros recursos de entregas no se amplían.

No existe `idRepartidor` en los filtros aceptados. La propiedad se determina por el
usuario JWT: `DeliveriesRepository.applyScope()` relaciona `repartidor.idUsuario`
en SQL **antes** de paginar y contar. No se confunde `idUsuario` con `idRepartidor`.
Sin registro asociado el listado está vacío y el detalle responde 404.

Lectura ajena/inexistente: 404. Iniciar/completar ajena: 403 de NestJS, conservado por
el BFF. Las escrituras se envían directamente al servicio autorizado: un GET previo
con alcance transformaría ese 403 en 404 y no sustituiría la validación bajo bloqueo.

Los POST exigen Origin exactamente igual al origen de Next.js, Content-Type JSON y
objeto vacío. Origin ausente, `null` o externo, cuerpos primitivos/arrays, campos
extra, IDs fuera de rango y queries de detalle/escritura se rechazan antes del POST
a NestJS. JWT solo en servidor, cookie HttpOnly y `Cache-Control: no-store` en todas
las respuestas; un 401 elimina la cookie con el mecanismo existente.

## Estados y transacciones

| Estado de entrega | Etiqueta  | Acción disponible |
| ----------------- | --------- | ----------------- |
| ASIGNADA          | Asignada  | Iniciar entrega   |
| EN_CAMINO         | En camino | Completar entrega |
| ENTREGADA         | Entregada | Ninguna           |
| CANCELADA         | Cancelada | Ninguna           |

La interfaz pide confirmación explícita y permite volver sin enviar nada. Un botón
deshabilitado y una referencia síncrona impiden doble envío en el componente. Solo
una respuesta 200 validada, con ID y estado esperado, confirma la operación.

NestJS conserva la autoridad transaccional:

- Iniciar: entrega ASIGNADA → EN_CAMINO y pedido → EN_CAMINO.
- Completar: entrega EN_CAMINO → ENTREGADA, fecha de entrega, pedido → ENTREGADO y
  repartidor → DISPONIBLE.
- Propiedad y estado se vuelven a comprobar dentro del EntityManager y bajo los
  bloqueos pesimistas existentes. Next.js no actualiza tablas ni disponibilidad.

Los estados de pedido y entrega se muestran como conceptos separados. El panel
solo muestra el identificador del pedido; no infiere ni modifica su estado.

## Errores, respuestas ambiguas y concurrencia

Se conservan 400, 401, 403, 404 y 409 con mensajes controlados. Errores inesperados
devuelven 500 seguro; red, timeout, contrato inválido o indisponibilidad del upstream
devuelven 502. No se retransmiten SQL, stacks, JWT, cookies ni mensajes privados.

Ante 409, 5xx, respuesta ilegible o conexión perdida se conserva «Último estado
confirmado», se bloquea el reenvío y se ofrece «Consultar estado vigente». No se
asume éxito ni rollback y **nunca se reintenta automáticamente el POST**.

Un GET confirmado puede mostrar el nuevo estado y sus acciones. Si conserva el
mismo estado, se requiere habilitar explícitamente otra confirmación y luego
confirmarla; consultar o habilitar no ejecutan una escritura. Un GET fallido deja
bloqueada la repetición. El usuario ve la fecha confirmada al quedar ENTREGADA.

No existe idempotencia distribuida ni coordinación de botones entre pestañas.
Recargar/navegar no conserva el bloqueo visual. Un GET tampoco garantiza que otra
solicitud haya terminado: cualquier nueva operación debe volver a serializarse y
validarse por NestJS. Dos POST concurrentes sobre la misma transición deben dar
exactamente 200/409, sin efectos duplicados.

## Límite de información para reparto real

El DTO general de entrega sigue sin incluir dirección, teléfono, nombre del
comprador ni productos. El destino se obtiene exclusivamente mediante el endpoint
específico descrito arriba; el REPARTIDOR no puede leer `/orders/:id` y el panel no
usa credenciales de ADMIN/EMPRENDEDOR para suplirlo. No se exponen datos personales
adicionales ni se conserva la dirección al quedar la entrega ENTREGADA o CANCELADA.

## Pruebas y evidencias

Las unitarias verifican proyección, estados, filtros, roles, validación, cookies,
errores seguros y contratos de los cuatro BFF. Se simula fetch sin servicios remotos.
La primera ejecución nueva quedó 71/74 porque `afterEach` restauraba el mock entre
subcasos de roles. Se reinstaló el mock por subcaso; no se cambió autenticación ni se
debilitaron expectativas.

La nueva integración ejecuta Chrome → Next compilado → Nest → PostgreSQL 16
Testcontainers. Usa cuentas, tiendas, pedidos, direcciones y contraseñas de fixtures;
fuerza API_URL loopback y no carga el `.env` del backend. Las asignaciones y la
preparación de históricos se hacen mediante las operaciones existentes de ADMIN y
REPARTIDOR en la API temporal, no mediante estados imposibles. La interfaz de
reparto nunca recibe credenciales ADMIN.

Se comprueban 200/409 reales reteniendo la fila de entrega y observando dos sesiones
en espera de bloqueo PostgreSQL antes de liberar. También se simula una respuesta
perdida tras guardar realmente, y una excepción HTTP después del commit del servicio;
los wrappers se restauran y no forman parte del código funcional.

| Validación                                                                | Resultado                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Unitarias frontend                                                        | 329/329, incluidas 74 de entregas/BFF.                                                       |
| Nueva suite Chrome → Next → Nest → PostgreSQL                             | 28/28 en la segunda ejecución.                                                               |
| Navegador completo frontend                                               | Tras la corrección: normal 225/225; secuencial 225/225. Historial 223/225 documentado abajo. |
| Unitarias backend, Node.js 22.22.0                                        | 686/686, 48 suites.                                                                          |
| Integración backend completa, Node.js 22.22.0                             | 796/796, 32 suites, incluidas entregas, concurrencia y rollback.                             |
| ESLint, TypeScript sin emisión ni incremental, builds de ambos workspaces | Aprobados.                                                                                   |
| Prettier, enlaces locales y git diff --check                              | Aprobados en la revisión final.                                                              |

Frontend y navegador utilizan Node.js 24.21.0. La primera ejecución de la nueva
integración quedó 11/20: faltaba OrdersHttpModule para comprobar el 403 real de
/orders (se obtenía 404 por ruta no registrada) y dos expresiones DevTools
redeclaraban una variable const global. El fallo de la segunda confirmación dejó
ocupado al repartidor de fixtures y las asignaciones posteriores devolvieron 409;
la suite no llegó a los ocho últimos subcasos. Se importó el módulo HTTP existente
y se encapsularon ambas expresiones en funciones. La segunda ejecución aprobó los
28 casos completos. No se alteraron expectativas, transacciones, timeouts ni
mecanismos de autenticación.

Las capturas exclusivamente sintéticas se generan fuera del repositorio en
`/private/tmp/chorotega-phase9a-courier-evidence/`: `entregas-320.png`,
`entregas-1440.png`, `detalle-320.png`, `detalle-1440.png`, `confirmacion-320.png` y
`confirmacion-1440.png`. Se verifican 320, 390, 768, 1280 y 1440 px. Se revisaron visualmente sin controles cortados ni desbordamiento y deben
adjuntarse manualmente cuando se autorice un PR; las rutas temporales no son
enlaces públicos persistentes.

```sh
# apps/frontend; backend instalado, Docker Desktop y Chrome locales
npm test
node --test test/browser/courier-deliveries.test.mjs
npm run test:browser
npm run lint
node_modules/.bin/tsc --noEmit --incremental false
npm run build

# apps/backend; Node.js 22.22.0 y PostgreSQL temporal
npm test -- --runInBand
npm run test:integration
npm run lint
node_modules/.bin/tsc --noEmit --incremental false
npm run build
```

No hay mapas/GPS, mensajería, notificaciones, tarifas, pagos, asignación/cancelación
ni administración de repartidores. Los incidentes históricos de Chrome/autenticación
no se declaran corregidos por resultados posteriores aprobados.

## Diagnóstico final del navegador y sincronización del carrito

Los logs conservados distinguen dos fallos: el primer 223/225 normal correspondió
a la aserción histórica del menú (`account.test.mjs:583`, true frente a false), ya
adaptada al enlace autorizado para REPARTIDOR. El segundo 223/225 ocurrió en
`cart.test.mjs:638`: «respuesta perdida después del commit conserva carrito
bloqueado y no duplica al recargar», con 1 pedido frente a 2 esperados. La acción
previa fue confirmar la compra; el navegador ya mostraba «Resultado de compra
pendiente». El log original no registró si el HTTP seguía pendiente. Otras suites
se ejecutaban simultáneamente; eso no demuestra por sí solo una causa de recursos.

Se creó un worktree aislado en el commit base 70422f4, sin Fase 9A. Con Node.js
24.21.0, el mismo Chrome local, Next 16.4.5 y PostgreSQL Testcontainers, el comando
normal falló 195/197 en exactamente cart.test.mjs:638 con 1 frente a 2. Se usaron
los mismos lockfiles y dependencias locales, sin instalar paquetes ni cambiar
configuración. Turbopack rechazó inicialmente node_modules enlazado fuera del
worktree; se copiaron las dependencias existentes y el build independiente aprobó.
No se copió ningún .env privado. API_URL fue impuesto a loopback por las pruebas.

### Evidencia determinista de la carrera

Solo en el worktree temporal se añadió una barrera en el fetch de POST /api/orders,
antes de despacharlo, sin sleeps ni timeouts nuevos. La prueba mantuvo su aserción
estricta y reprodujo el mismo fallo. El diagnóstico incluyó únicamente contadores
y booleanos:

```json
{"event":"cart_barrier_before","orders":1,"postStarted":true,"postSettled":false,"pendingHeading":true}
{"event":"cart_barrier_after","orders":2,"postSettled":true}
```

El texto se renderiza tanto para `submitting` como para `uncertain` en cart-view.tsx.
La fase submitting se establece antes de esperar submitOrder: el encabezado no
acredita el commit del pedido. Liberada la barrera y recibida la respuesta real,
PostgreSQL contiene los dos pedidos. Esto demuestra una sincronización insuficiente
de la prueba, reproducible en la base; no una regresión funcional introducida por
9A. La ejecución instrumentada quedó 18/20 por el fallo deliberadamente reproducido
y su contenedor. La instrumentación se retiró y el archivo base quedó restaurado.

### Corrección mínima exclusivamente de prueba

En el wrapper que ya simulaba perder la respuesta se registra solo el status HTTP
numérico al recibir el POST real. Antes del conteo se espera ese status igual a 201. Se conservan las dos aserciones de exactamente dos pedidos, las comprobaciones
de carrito bloqueado, su contenido y la recarga sin duplicados. No se cambió el
carrito funcional, el backend, cartReady, timeouts, helpers globales ni cobertura.
No hay reintentos ni pausas fijas. Las otras comprobaciones de cartReady se revisaron:
la que falló exige una condición de finalización del POST, no solo tener DOM listo.

Los logs se conservan fuera de Git bajo /private/tmp/phase9-base-* y
/private/tmp/phase9-fixed-*. No contienen tokens ni valores de cookies en los
diagnósticos añadidos. Los incidentes históricos diferentes de Chrome o autenticación
no quedan explicados ni corregidos por este diagnóstico.

Resultados posteriores a la corrección, Node.js 24.21.0:

| Ejecución                      | Resultado  |
| ------------------------------ | ---------- |
| Carrito aislado                | 20/20      |
| Navegador completo normal      | 225/225    |
| Navegador completo secuencial  | 225/225    |
| Integración Fase 9A aislada    | 28/28      |
| Unitarias frontend             | 329/329    |
| ESLint y TypeScript            | Aprobados  |
| Prettier, build y diff --check | Aprobados. |

No se reejecutó la integración backend: su código no cambió y conserva los
796/796 registrados en la implementación. No se ejecutaron CI remoto ni operaciones
productivas. Esta corrección no promete eliminar cualquier incidencia futura del
navegador; corrige la sincronización concreta demostrada aquí.

Se verificó también la corrección con la misma barrera controlada en la base:
20/20. Antes de liberar el POST: orders=1 y responseStatus=null. Después del HTTP
201: orders=2. La prueba esperó la respuesta antes del conteo estricto. Esta
comprobación no utiliza sleeps ni relaja expectativas. Se restauró el archivo del
worktree; no queda instrumentación temporal en la aplicación ni en la suite.

Chrome verificado al cierre: 158.0.8127.36, mismo binario local utilizado por los
helpers de ambos worktrees. Los logs originales anteriores a este diagnóstico no
registraban la versión por lanzamiento; no se inventa ese dato retrospectivo.
