# Administración MVC de entregas — Fase 9B

## Objetivo y arquitectura

Ampliación del panel NestJS existente para consultar entregas, asignar
repartidores y cancelar asignaciones mediante Handlebars y formularios HTML
nativos. No crea otro panel en Next.js ni incorpora JavaScript.

Base: `dd1c2c07ec2ee7cbedc53792e5781c5b858c3248`, merge de PR #147. Su
[CI de develop](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44217896907)
aprobó antes de iniciar esta fase. Rama: `feature/administracion-entregas`.
Las comprobaciones de esta fase son locales, no validaciones en producción o CI.

[AdminModule](../../apps/backend/src/admin/admin.module.ts) importa DeliveriesModule
y CouriersModule, reutilizando sus servicios exportados sin duplicar providers.
[AdminDeliveriesController](../../apps/backend/src/admin/admin-deliveries.controller.ts)
solo adapta formularios, DTOs, respuestas y vistas. No cambia servicios,
repositorios, entidades, migraciones, reglas del dominio ni dependencias.

## Rutas y navegación

| Método | Ruta                           | Función                                     |
| ------ | ------------------------------ | ------------------------------------------- |
| GET    | `/admin/deliveries`            | Listado con filtros y paginación SQL        |
| GET    | `/admin/deliveries/new`        | Asignación y disponibilidad de repartidores |
| POST   | `/admin/deliveries`            | `DeliveriesService.assignDelivery()`        |
| GET    | `/admin/deliveries/:id`        | Detalle autorizado                          |
| POST   | `/admin/deliveries/:id/cancel` | `DeliveriesService.cancelDelivery()`        |

Las rutas quedan fuera de `/api/v1` por la exclusión administrativa existente y
no aparecen en OpenAPI. La prueba de AppModule completo conserva las **40
operaciones REST actuales**. La navegación mantiene Productos, Tiendas y cierre
de sesión y añade Entregas. Las cuatro plantillas de catálogo solo reciben ese
enlace y envoltura flexible de la navegación. El login permanece intacto.

## Lecturas, formularios y estados

`searchVisible()` y `findVisibleById()` reciben la identidad ADMIN vigente del
guard. El listado usa DeliverySearchQueryDto: paginación y conteo SQL, estado,
pedido, repartidor y fechas inclusivas de asignación. Las fechas se muestran en
ISO 8601 UTC. Permite ordenar por fecha de asignación, fecha de entrega o ID con
el desempate estable existente. Anterior/siguiente conservan filtros, tamaño y
orden; enviar filtros vuelve a la primera página. Los controles opcionales
vacíos significan ausencia de filtro.

Solo se muestran identificadores y fechas del contrato, sin direcciones,
correos o nombres de clientes. `CouriersService.findAll()` aporta ID de
repartidor, transporte y disponibilidad; no se expone su ID de usuario.
La selección y el pedido se conservan después de errores.

La disponibilidad es informativa. El servicio valida dentro de su transacción:
pedido PREPARANDO, dirección válida, barrio activo, repartidor existente y
disponible y ausencia de entrega activa. El controlador no duplica esas reglas
ni modifica el pedido directamente.

El detalle ofrece `details` únicamente en ASIGNADA. ADMIN abre «Cancelar
entrega», lee la confirmación y pulsa «Confirmar cancelación». El servicio vuelve
a comprobar el estado bajo bloqueo: ocultar un botón no constituye autorización.
Cancelar libera al repartidor sin cambiar directamente el estado del pedido.
EN_CAMINO, ENTREGADA y CANCELADA no permiten cancelación. No hay reasignación.

## Seguridad, concurrencia y errores

Todas las rutas usan AdminSessionGuard, RolesGuard y rol ADMIN. Los POST usan
AdminCsrfGuard con token vinculado a la sesión. Se reutiliza la cookie cifrada
administrativa existente, HttpOnly, Secure en producción y SameSite; no se
comparte la sesión de Next.js ni se cambian identidad, login, JWT o permisos.

| Situación                                                                       | Respuesta MVC                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Sesión ausente, inválida o vencida                                              | El filtro MVC existente transforma 401 en redirección 303 a `/admin/login` |
| Rol prohibido o CSRF ausente, inválido o ajeno                                  | 403 sin escritura                                                          |
| IDs/campos inválidos o campos desconocidos                                      | 400; errores por campo en asignación                                       |
| Pedido, repartidor o entrega inexistente                                        | 404                                                                        |
| Estado incompatible, entrega activa, repartidor ocupado o conflicto concurrente | 409                                                                        |
| Dirección o barrio que incumple las condiciones                                 | 422                                                                        |
| Error inesperado                                                                | 500 seguro con enlace de consulta                                          |

Se reutiliza el [adaptador HTTP de Deliveries](../../apps/backend/src/modules/deliveries/http/delivery-http-error.ts).
Los errores desconocidos no se convierten en 409/422. Se muestran mensajes
controlados, nunca SQL, stacks o mensajes originales desconocidos. El filtro
administrativo sirve HTML; Problem Details del REST sigue intacto.

IDs de escritura: enteros decimales positivos de 32 bits. Se rechazan campos
extra y entradas que no cumplen los DTOs. Las vistas conservan escape Handlebars,
`Cache-Control: no-store`, CSP sin scripts y `Referrer-Policy: same-origin`.
No se aceptan orígenes nulos ni se relajan CORS o CSRF.

Se conservan bloqueos y orden transaccional. Las pruebas HTTP concurrentes
mantienen bloqueada la fila disputada hasta observar **dos transacciones
esperando un bloqueo en PostgreSQL**; después la liberan. Una asignación confirma
y la otra recibe 409, sin duplicados. Se prueban tanto dos repartidores para un
pedido como un repartidor para dos pedidos, con base real.

## PRG y resultados ambiguos

Una escritura confirmada responde 303 hacia `/admin/deliveries/:id`. Recargar
ese GET no repite la escritura. Una cancelación repetida o asignación incompatible
sigue sometida al dominio y responde 409.

Ante un error inesperado durante la escritura aparece «Consultar estado vigente»:
por pedido para asignación o por entrega para cancelación. No hay formulario de
reintento de esa operación ni reenvío automático. Una prueba simula commit
exitoso seguido de error: POST 500, GET comprueba la entrega y no crea otra.

**PRG no ofrece idempotencia distribuida.** Si se pierde toda la respuesta HTTP,
el navegador puede mostrar su propio error. Antes de recargar o repetir un POST,
ADMIN debe consultar el listado por pedido o el detalle. La interfaz no puede
recuperar una respuesta que nunca recibió; no se añade una clave de idempotencia.

## Pruebas locales

Comprobaciones del 17 de noviembre de 2026: **Node.js 22.22.0**, PostgreSQL 16
en Testcontainers y Chrome **158.0.8127.36** local. Datos exclusivamente sintéticos,
sin conexiones o migraciones de producción.

La tabla siguiente conserva la validación inicial. Las ejecuciones posteriores,
incluidos sus fallos, se registran cronológicamente en «Cierre de validación».

| Comprobación                                                                    | Resultado                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Unitarias backend completas                                                     | 713/713, 48 suites                                  |
| Integración HTTP nueva de entregas MVC                                          | 26/26                                               |
| Integración completa backend                                                    | 822/822, 33 suites                                  |
| Chrome MVC, comando normal                                                      | 28/28: 2 contenedores de escenarios y 26 subpruebas |
| Chrome nuevo de entregas                                                        | 17 subpruebas: 12 funcionales y 5 responsive        |
| Chrome MVC previo                                                               | 9 subpruebas                                        |
| Diagnóstico y launcher Chrome, sin cambios                                      | 42/42                                               |
| Pruebas existentes del artefacto compilado                                      | 9/9                                                 |
| Build, TypeScript completo, ESLint, Prettier, sintaxis CJS y `git diff --check` | Aprobados                                           |

Fuentes:

- [HTTP con servicios simulados](../../apps/backend/src/admin/admin-http.spec.ts): permisos en todas las rutas, CSRF, validación, escape, errores seguros y alcance ADMIN.
- [Integración nueva PostgreSQL](../../apps/backend/test/integration/http/admin-deliveries.integration-spec.ts): persistencia, filtros, PRG, cancelación, concurrencia y resultado ambiguo tras commit.
- [Chrome de entregas](../../apps/backend/test/browser/admin-deliveries.browser.test.cjs): formularios nativos, confirmación, navegación, validaciones, CSRF, rol prohibido y responsividad.
- [Regresión transaccional existente](../../apps/backend/test/integration/deliveries-transactions.integration-spec.ts): rollback, pool pequeño y conflictos, conservada sin modificaciones dentro de la integración completa.

La primera ejecución del test Chrome nuevo tuvo una expresión de espera mal
escapada: la asignación persistió, pero la aserción no reconoció su destino.
Se corrigió esa expresión del test sin ampliar timeouts ni cambiar el launcher.
Después aprobaron la suite nueva y el comando normal con ambas suites. Esto
no identifica ni corrige las causas de incidentes históricos de Chrome.

Desde `apps/backend`, con Docker y Chrome locales y dependencias instaladas:

```bash
node --version
npm run lint
npx tsc --noEmit
npm run build
npm test -- --runInBand
npm run test:integration
npm run test:integration -- --testPathPatterns=admin-deliveries
npm run test:browser
node --test test/support/chrome-browser.test.cjs
npm run test:deployment
```

La suite nueva reutiliza sin modificar la utilidad CDP sin dependencias externas
de `apps/frontend/test/browser/support.mjs` para viewport y capturas. No levanta
Next.js ni requiere sus paquetes. El launcher MVC anterior permanece intacto.

### Evidencia sintética

Se generan 15 PNG fuera del repositorio en una carpeta temporal
`chorotega-9b-responsive-*`. El test informa su ruta; no constituye un enlace
público o una evidencia publicada en GitHub. Para **320, 390, 768, 1280 y
1440 px** se capturan `listado-ANCHO.png`, `asignacion-ANCHO.png` y
`detalle-ANCHO.png`, este último con la confirmación abierta.

Las pruebas comprueban ausencia de scroll horizontal de página y controles
cortados. La tabla usa un contenedor de desplazamiento horizontal accesible
para conservar sus columnas. No se muestran cookies, JWT, contraseñas o datos
reales. Las imágenes no se incorporan automáticamente al repositorio.

## Limitaciones y comprobación posterior

- `findAll()` de repartidores no tiene paginación. Un selector para grandes
  volúmenes requeriría ampliar el contrato en otro bloque autorizado.
- El pedido se ingresa por ID; no se inventa un endpoint de pedidos seleccionables.
- No se añaden iniciar/completar: permanecen en el flujo del repartidor.
- El estado puede cambiar después de renderizar; la transacción decide y puede
  devolver 409. No hay garantía de disponibilidad basada solo en el HTML.
- La comprobación en Render queda pendiente de integración y despliegue
  autorizados. No se modifican proveedores, variables, CI/CD o producción.
- El origen administrativo debe ser compatible con CORS existente. Las pruebas
  de formularios nativos permiten explícitamente el origen local, sin cambiar
  la política del proyecto.

Para revisión manual, iniciar la aplicación con configuración **explícitamente
local**, acceder con ADMIN sintético a `/admin/login` y abrir Entregas. Comprobar
filtros, asignación, confirmación y cancelación. No usar cuentas o datos reales
para evidencias.

## Cierre de validación: investigación de integración

### Historial y alcance de las conclusiones

Se conservan los resultados anteriores, que no equivalen a una garantía de
estabilidad de todas las ejecuciones:

1. Primera integración de Fase 9B: **822/822**, 33 suites, 125,978 s.
2. Validación final inicial: **822/822**, 33 suites, 125,467 s.
3. Auditoría posterior: **821/822**, 32 suites aprobadas y una fallida, 130,119 s.
   Falló «post stores — EMPRENDEDOR propietario autorizado» en
   `catalog-write-security.integration-spec.ts`, con `socket hang up`.
4. Comprobación aislada de esa suite durante la auditoría: **88/88**, 30,192 s.

El log original de la auditoría se conservó en `/private/tmp` antes de investigar.
No contiene una traza que distinga si el error ocurrió en la preparación, en uno
de sus cinco POST de login o en el POST de tienda del cuerpo del caso. Tampoco
acredita un cierre prematuro de NestJS o PostgreSQL. **El punto HTTP exacto del
incidente original y su causa permanecen sin demostrar.**

### Comparación controlada con develop

Se creó un worktree independiente y detached sobre
`dd1c2c07ec2ee7cbedc53792e5781c5b858c3248`. Ambos árboles utilizan Node.js
**22.22.0**, los mismos `package.json` y lockfile de backend y las mismas
versiones instaladas mediante un enlace local de `node_modules`, sin instalación
ni actualización. Cada suite utiliza su propio contenedor PostgreSQL 16; no se
comparten bases ni conexiones externas. La suite de catálogo y la integración
completa se comparan con ejecuciones sucesivas, sin aumentar concurrencia Jest.

La instrumentación temporal fue idéntica en ambos árboles. Registró inicio y fin
de los logins y de la escritura del caso, códigos HTTP, recepción en servidor,
finish/close de respuestas, abortos, errores de servidor y ciclo de vida de la
aplicación. Nunca registró cuerpos, encabezados, JWT, contraseñas o cookies.
No cambió aserciones, timeouts ni operaciones funcionales.

En el caso problemático aislado ambos árboles completaron cinco logins 201 y
el POST de tienda 201. No se observaron errores de transporte ni respuestas
incompletas en esas ejecuciones. Los eventos `server_close` por petición no son
por sí solos un fallo: Supertest abre y cierra un puerto efímero cuando recibe
un servidor sin escucha; el cierre de la aplicación se registra separadamente.

En la suite completa de catálogo de develop apareció un **incidente distinto**:
GET de tiendas con 401 cuando se esperaba 200. La instrumentación constató una
respuesta HTTP completa, con el servidor escuchando, después de los cinco
logins 201 de preparación. No hubo un error de transporte en esa ejecución.
Esto demuestra que ese 401 puede aparecer sin Fase 9B; **no reproduce ni explica
el socket hang up original**. No se modifica autenticación ni se presenta una
causa interna para el 401 sin evidencia adicional.

### Comandos de comparación

Desde `apps/backend` de cada árbol, con el mismo binario Node 22.22.0 en PATH:

```bash
npm run test:integration -- --testPathPatterns=catalog-write-security --testNamePattern='post stores EMPRENDEDOR propietario autorizado'
npm run test:integration -- --testPathPatterns=catalog-write-security
npm run test:integration
```

El primer comando selecciona deliberadamente un caso: sus 87 pruebas omitidas
por filtro no se contabilizan como aprobadas. No se introducen skips en código,
reintentos automáticos ni repeticiones indefinidas para obtener verde. Los logs
y la instrumentación son evidencia local temporal, no enlaces públicos.

### Confirmación abierta: accesibilidad y responsividad

La comprobación del detalle ahora enfoca el `summary`, comprueba el foco, abre
la confirmación mediante Enter y verifica que permanezca abierta antes de medir
la página, los controles y el ancho del panel. Incluye el botón de confirmación
visible y el texto del formulario. Se conservan las comprobaciones anteriores y
las capturas en 320, 390, 768, 1280 y 1440 px. No cambia la interfaz funcional,
la CSP ni las cookies. El desplazamiento interno de la tabla continúa siendo
intencional y accesible, sin desbordamiento horizontal de página.

Resultados controlados registrados (duraciones informadas por Jest):

| Árbol           | Ejecución                      | Resultado                      | Duración  |
| --------------- | ------------------------------ | ------------------------------ | --------- |
| Fase 9B         | Caso problemático seleccionado | 1/1; 87 casos no seleccionados | 4,224 s   |
| develop aislado | Mismo caso seleccionado        | 1/1; 87 casos no seleccionados | 2,776 s   |
| Fase 9B         | Catálogo completo              | 88/88                          | 30,155 s  |
| develop aislado | Catálogo completo              | 87/88; GET tiendas recibió 401 | 29,993 s  |
| develop aislado | Integración completa           | 796/796, 32 suites             | 115,547 s |

En las ejecuciones filtradas que conservaron marcas detalladas no se observaron
errores del servidor, abortos ni respuestas cerradas antes de finalizar en las
rutas instrumentadas. La salida de la integración completa no conservó esas
marcas: su resumen permite verificar resultados, pero no demostrar ausencia de
eventos de conexión. La evidencia detallada no permite reconstruir
retrospectivamente la causa del incidente original. No se ha aplicado una corrección de transporte,
autenticación, sincronización o limpieza sin una causa demostrada.

Nueva integración completa de Fase 9B: **821/822**, 32 suites aprobadas y una
fallida, **119,718 s**. Esta vez falló
`courier-registration.integration-spec.ts`, caso «creates a courier, hashes the
password, logs in and preserves delivery permissions», iniciado en la línea 51.
El caso incluye registro, login y asignación; el log solo aporta `socket hang up`,
sin una traza que identifique cuál de esas peticiones falló. No se amplía la
instrumentación ni se inicia otra ronda completa para buscar un resultado verde.
Catálogo y las pruebas nuevas de entregas aprobaron en esta ejecución.

La prueba de registro importa AuthModule, CouriersModule y DeliveriesModule;
no importa el panel AdminModule. Esto no demuestra la causa
ni descarta todos los posibles efectos del entorno de pruebas, pero no hay
evidencia de un defecto funcional de las vistas nuevas que explique el fallo.
La comparación demuestra **un 401 distinto en develop**, no una reproducción del
socket hang up original en develop. La causa del transporte sigue abierta.

La instrumentación se retiró de ambos árboles después de la comparación. El
archivo de catálogo recuperó exactamente sus bytes iniciales y no forma parte
del diff de Fase 9B. Los únicos ajustes permanentes de este cierre son las
aserciones responsive del test Chrome nuevo y esta documentación; no se cambia
código funcional, autenticación, timeouts, dependencias ni CI/CD.

### Validación del árbol final y decisión

Después de retirar la instrumentación:

- Unitarias backend: **713/713**, 48 suites, 5,079 s.
- HTTP administrativo: **42/42**, dos suites (26 casos nuevos y 16 anteriores),
  8,143 s.
- Integración completa de la comparación: **821/822**; no se presenta como
  aprobada. Se ejecutó con la instrumentación temporal descrita.
- La integración anterior **822/822** se conserva como evidencia histórica; no
  demuestra que el incidente esté corregido.

**Recomendación: mantener pendiente la publicación.** Las verificaciones
funcionales de Fase 9B no han demostrado un defecto, pero persiste un fallo de
integración completa sin causa confirmada. El siguiente paso útil, si se
requiere cerrar el transporte antes de publicar, sería una investigación
acotada del caso de registro con trazas seguras de cliente y servidor que no
dependan de la consola capturada por Jest. Cualquier publicación como Draft para
contrastar CI requerirá autorización explícita y deberá conservar esta incidencia.

Validaciones restantes del árbol final:

- Chrome MVC: **28/28**, 5,419 s, incluidos los cinco anchos con la confirmación
  abierta y el botón visible dentro de los límites. Se regeneran las 15 capturas
  sintéticas temporales, sin incorporarlas al repositorio.
- La primera ejecución de la ampliación de Chrome produjo **22/28**: cinco
  aserciones de apertura y su escenario contenedor fallaron porque el evento CDP
  Enter omitía el carácter `\r`. Se completó el evento de teclado como en los
  tests existentes; después aprobaron las mismas aserciones. No se modificó la
  aplicación ni se aumentaron timeouts. Este incidente del test es independiente
  de los fallos de transporte y autenticación del backend.
- Diagnósticos Chrome: **42/42**, 83,391 ms.
- Artefacto compilado: **9/9**, 1,634 s.
- Build, ESLint, TypeScript completo, Prettier, sintaxis CJS, enlaces locales y
  `git diff --check`: aprobados.

La comparación utilizó dos ejecuciones aisladas del caso (una por árbol), una
suite de catálogo por árbol y una integración completa por árbol. No se hizo
otra integración completa para sustituir el fallo por un verde. Los 42 casos
HTTP administrativos finales son una comprobación focalizada adicional y no
reemplazan la integración completa fallida. Los contenedores se detienen y el
worktree temporal se retira tras preservar los resultados. No hubo commits,
staging, push, PR, migraciones remotas ni despliegues.

## Investigación acotada del transporte HTTP

Esta sección añade evidencia posterior al cierre anterior; no elimina sus fallos
ni declara corregida la incidencia histórica.

### Instrumentación y ejecución

Se revisaron `create-http-test-app.ts`, `postgres-test-database.ts`,
`catalog-http-auth.ts`, ambas suites afectadas y `jest-integration.json`.
Las aplicaciones esperan `app.init()` antes de retornar, y su limpieza espera
`app.close()` antes de detener PostgreSQL. El helper de PostgreSQL comparte una
promesa de cierre para evitar limpiezas simultáneas y vuelve a permitirla si
falla. Las suites asignan secretos efímeros antes de crear la aplicación y
restauran la variable anterior en `finally`. `--runInBand` serializa suites,
pero no impide solicitudes concurrentes o tareas asíncronas dentro de ellas.

Supertest recibe servidores sin escucha persistente, abre un puerto efímero y
lo cierra después de la solicitud que lo abrió. Se distinguieron estos eventos
de los del cierre explícito de la aplicación. No se cambió ese comportamiento
sin una evidencia que demostrara su relación causal con el fallo.

Se añadió temporalmente una sonda de HTTP de Node que escribe directamente a un
archivo JSONL, sin depender de la consola capturada por Jest. Registró solicitud,
método/ruta sin query ni cuerpos, identificadores numéricos de socket, reutilización,
estado HTTP, errores de transporte permitidos, finish/close de respuestas y
servidores, `clientError` y fases de cierre de aplicación/PostgreSQL. Los nombres
de casos no incluidos en una lista segura se identificaron mediante un hash.
La captura de `clientError` observó la emisión del evento sin instalar un listener
que reemplazara su tratamiento predeterminado. Se conservó también stderr y el
código de salida del proceso; no aparecieron errores no controlados en esa salida.

Primero se verificó la sonda con una petición HTTP local sintética. Después se
realizó **una única integración completa**, con Node.js **22.22.0**, PostgreSQL 16
independiente en Testcontainers y el comando real del proyecto:

```bash
npm run test:integration
```

Se usaron variables temporales de diagnóstico: `NINEB_TRANSPORT_LOG` para el
archivo local y `NODE_OPTIONS` para precargar la sonda externa al repositorio.
No se editaron `.env`, configuración Jest, dependencias ni CI/CD.

### Resultado y solicitud investigada

Resultado: **822/822**, **33 suites**, **123,478 s**, salida **0**. No se repitió
la integración completa para obtener otro resultado.

La traza contiene **2294 solicitudes de aplicación y 2294 respuestas HTTP**:

| Evento                                             | Resultado observado |
| -------------------------------------------------- | ------------------- |
| Errores de transporte de aplicación                | 0                   |
| `clientError` del servidor                         | 0                   |
| Errores del servidor HTTP                          | 0                   |
| Solicitudes abortadas en servidor                  | 0                   |
| Cierres de respuesta de servidor antes de terminar | 0                   |
| Respuestas HTTP 401 completas                      | 122                 |

Los 401 se registraron como respuestas HTTP; no se contabilizan como ECONNRESET.
Hay pruebas que esperan 401 y la integración aprobó. Ese conteo no demuestra que
se haya corregido el 401 inesperado de la comparación anterior con develop.

En «post stores — EMPRENDEDOR propietario autorizado» se observaron los cinco
POST de login con **201**, seguidos del POST `/api/v1/stores` con **201**.
En el caso de registro de repartidores se completaron:

1. POST `/api/v1/auth/register/courier`: **201**.
2. POST `/api/v1/auth/login`: **201**.
3. GET `/api/v1/auth/me`: **200**.
4. GET `/api/v1/couriers`: **403**, esperado por el rol.
5. GET `/api/v1/deliveries`: **200**.
6. POST `/api/v1/deliveries`: **403**, esperado por el rol.

Se observaron 22 secuencias de cierre de aplicaciones HTTP y 34 de PostgreSQL
con sus etapas de finalización. Las restantes suites también usan el helper de
PostgreSQL sin una aplicación HTTP. Los contenedores se limpian al finalizar.
No se identificó una conexión fallida ni un evento que permitiera atribuir
retrospectivamente el cierre de las conexiones de los incidentes históricos.

### Límites del diagnóstico

La sonda produjo `MaxListenersExceededWarning`: añadía observadores de `connect`
a sockets ya reutilizados. Esto es una limitación de la instrumentación temporal,
no evidencia de una fuga de memoria de la aplicación. No se elevó el límite de
listeners para ocultar la advertencia. La escritura síncrona del diagnóstico y
sus observadores pueden alterar el tiempo de ejecución; un verde con esta sonda
no prueba la estabilidad de una ejecución sin instrumentación.

Al terminar se retiró toda la instrumentación de los cinco archivos. Se
restauraron exactamente sus bytes iniciales y no quedan listeners de diagnóstico
en los procesos terminados. No se conservó ningún cambio permanente del soporte
de pruebas, de la aplicación, de timeouts o de las aserciones.

Evidencia local temporal, sin enlaces públicos:

- `/private/tmp/phase9b-transport/full.log`: salida de Jest y stderr.
- `/private/tmp/phase9b-transport/full.jsonl`: traza segura de transporte/fases.
- `/private/tmp/phase9b-transport/summary.json`: resumen del resultado observado.

### Clasificación y aceptación de riesgo

**D. Incidencia intermitente sin causa demostrada.** No se ha demostrado un
problema del ciclo de vida, del transporte/servidor ni de la aplicación que
justifique una corrección. Tampoco se demostró una relación causal con Fase 9B.
El evento exacto de los incidentes originales continúa indeterminado porque no
se reprodujo bajo la captura nueva. No se presenta como solucionado.

La investigación acotada termina aquí. Como aceptación de riesgo, resulta
razonable autorizar **solo un Draft PR para contrastar el CI oficial**, conservando
los fallos anteriores y esta incertidumbre en su descripción. Esa recomendación
actualiza la anterior de mantener toda publicación pendiente; requiere decisión
explícita del responsable y no autoriza merge o producción. Si no se acepta el
riesgo residual, se mantiene pendiente la publicación sin repetir indefinidamente
la integración. Un nuevo fallo debería conservar su traza antes de decidir una
corrección, sin reintentos automáticos ni aumentos de timeout.

Las validaciones previas de 713 unitarias, 42 HTTP administrativas, 28 Chrome MVC,
42 diagnósticos Chrome, 9 de artefacto, build, ESLint y TypeScript se conservan
como resultados del cierre anterior: **no se ejecutaron de nuevo en esta
investigación de transporte**. Aquí solo se modificó permanentemente este
informe, se verificaron formato y enlaces y se ejecutó `git diff --check`.
