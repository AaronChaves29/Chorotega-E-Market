# Bitácora de pedidos: PostgreSQL outbox y MongoDB

Fase 12D, basada en develop `1a6b98faa706c843a354e15fa556cf83a3898dd6`.
Implementación local completada y validada con Node.js 22.22.0, con la incidencia
residual de transporte documentada abajo. El respaldo inicial
WIP es `2d7d3244a64cd2e210e1aa6a2566d13db56af485`; las correcciones posteriores
permanecen sin commit ni push. No está integrada ni desplegada. Los resultados
verificados y límites se detallan al final; el CI remoto de estas correcciones
queda pendiente de una publicación autorizada.

## Arquitectura y garantías

Cada transición escribe un evento en `pedido_audit_outbox` usando el mismo
EntityManager de su transacción comercial. El escritor se invoca **al final**,
después de todas las consultas y escrituras comerciales. PostgreSQL confirma o
revierte conjuntamente inventario, estados, detalles, contador y evento.
Ninguna transacción comercial contacta MongoDB.

Un publicador NestJS reclama como máximo cinco eventos por lote. La transacción
de reclamación termina antes de escribir en MongoDB. La persistencia es eventual,
con entrega al menos una vez e inserción idempotente en el destino. No existe una
transacción distribuida ni se promete entrega exactamente una vez entre bases.
No se reejecutan compras, cancelaciones ni entregas para recuperar eventos.

## Eventos y actores

| Tipo              | Actor autenticado       | Cambio registrado                                           |
| ----------------- | ----------------------- | ----------------------------------------------------------- |
| PEDIDO_CONFIRMADO | CLIENTE                 | PENDIENTE → CONFIRMADO                                      |
| PEDIDO_CANCELADO  | CLIENTE propietario     | CONFIRMADO/PENDIENTE → CANCELADO                            |
| PEDIDO_PREPARANDO | EMPRENDEDOR propietario | CONFIRMADO → PREPARANDO                                     |
| ENTREGA_ASIGNADA  | ADMIN                   | Entrega nueva → ASIGNADA                                    |
| ENTREGA_CANCELADA | ADMIN                   | ASIGNADA → CANCELADA                                        |
| ENTREGA_EN_CAMINO | REPARTIDOR propietario  | Entrega ASIGNADA → EN_CAMINO; pedido PREPARANDO → EN_CAMINO |
| PEDIDO_ENTREGADO  | REPARTIDOR propietario  | Entrega EN_CAMINO → ENTREGADA; pedido EN_CAMINO → ENTREGADO |

La compra pública confirma dentro de una sola transacción. No se emite un evento
provisional de éxito durante PENDIENTE. Cancelar una asignación no cancela el
pedido ni repone inventario. Los IDs ADMIN llegan del JWT vigente o la sesión MVC,
nunca del cuerpo JSON o formulario. Los contratos públicos REST permanecen iguales.

## Esquemas y secuencias

El payload incluye `eventoId` UUID, `schemaVersion: 1`, `pedidoId`, `secuencia`,
`tipo`, `fecha`, `actor: {idUsuario, rol}` y, cuando corresponde, `entregaId`,
`repartidorId`, `pedido: {anterior, nuevo}`, `entrega: {anterior, nuevo}`.
Se proyectan campos permitidos; se rechazan payloads persistidos contradictorios
o con campos extra antes de enviarlos a MongoDB.

Migración aditiva `1795082400000-AddOrderAuditOutbox`:

- `pedido_audit_sequence`: contador entero por pedido.
- `pedido_audit_outbox`: identidad, pedido/secuencia únicos, tipo, versión,
  JSONB, fecha timestamptz, estado, intentos, próxima ejecución, concesión UUID,
  vencimiento y fecha de publicación. Incluye restricciones e índices de pendientes.

No altera tablas comerciales. No agrega FK hacia pedido/usuario/repartidor:
agregar comprobaciones de FK después de bloquear entrega/repartidor podría
introducir un nuevo orden de bloqueo sobre el pedido. Los identificadores se
obtienen de entidades verificadas en la transacción comercial.

El contador se actualiza con INSERT/ON CONFLICT, cuya fila es el último bloqueo
adquirido. La contención normal espera al emisor previo: se eliminó el rechazo
inmediato del prototipo basado en pg_try_advisory_xact_lock. La espera se limita
a cinco segundos usando SET LOCAL lock_timeout; si el llamador ya tiene un límite
menor, se conserva. No se modificaron timeouts de pruebas para obtener aprobación.
Un timeout real revierte toda la transacción, sin éxito parcial ni evento huérfano.

Todos los emisores deben conservar este protocolo y no hacer más consultas
comerciales después. No se añaden FK desde las tablas outbox hacia filas comerciales
que puedan invertir la adquisición de bloqueos. Un rollback revierte el contador;
la siguiente transición puede utilizar la secuencia correcta. El orden por pedido
se define por esta reserva transaccional, no por relojes ni UUID. No se garantiza
un orden global entre pedidos independientes.

La fecha original se conserva en los reintentos. PostgreSQL usa timestamptz y
MongoDB BSON Date. No se reinterpretan timestamps históricos sin zona ni se
reconstruyen eventos pasados a partir de estados actuales.

## Reclamación, orden y recuperación

El publicador corre cada segundo, sin ticks solapados dentro de la instancia.
Puede haber varias instancias: SELECT FOR UPDATE SKIP LOCKED reclama candidatos y
les asigna una concesión de 30 segundos. **Además**, NOT EXISTS exige que todos
los predecesores del pedido estén PUBLICADO. Un predecesor retrasado, PUBLICANDO,
con resultado incierto o FALLIDO bloquea sus sucesores. Pedidos distintos pueden
publicarse en paralelo. SKIP LOCKED por sí solo no garantiza este orden.

Las confirmaciones y fallos requieren la misma concesión, estado PUBLICANDO y
vencimiento todavía vigente. Un dueño anterior no puede confirmar la nueva
concesión. Una concesión vencida se recupera con el mismo eventoId. Un intento
antiguo que termine tarde no puede duplicar el evento en MongoDB.

Después de un fallo se aplica backoff exponencial de 2 a 60 segundos. Tras diez
intentos queda FALLIDO, bloqueando ese pedido sin eliminarlo. No se descarta
ningún evento. Cada operación MongoDB tiene timeout de cinco segundos; el lote
espera todos sus trabajos al cerrar. No se mantiene una conexión PostgreSQL
reservada mientras responde MongoDB.

## MongoDB e idempotencia

Colección existente `bitacora_pedidos`: un documento por pedido, `eventos` y
`ultimaSecuencia`. Es obligatorio un índice único global por pedido, sin filtros parciales ni
sparse; el publicador comprueba esa definición y falla de forma cerrada si falta.

El primer evento se crea mediante setOnInsert y upsert. Una colisión 11000 se
reconcilia consultando el documento; no se ignoran otros errores. En documentos
históricos solo se inicializa el contador a cero cuando no contienen eventos del
nuevo esquema. El validador reconoce los siete contratos, exige el rol y los estados de cada
tipo y conserva el formato histórico. Las entregas registran el estado previo real
del pedido; no agregan nuevas reglas comerciales sobre transiciones existentes.
La inserción siguiente usa push condicionado por secuencia previa
y ausencia del eventoId. No se reemplaza el historial completo.

La lectura posterior, con readConcern majority, comprueba exactamente un evento
y su contenido. Si MongoDB
guarda pero se pierde la respuesta, el siguiente intento reconoce el mismo ID y
contenido sin agregarlo otra vez. Una contradicción de payload o secuencia falla.
El ACK utiliza writeConcern majority. Se rechazan fechas nulas, numéricas o no
canónicas; la fecha del JSONB debe coincidir con la columna timestamptz. El JSONB
también debe coincidir con sus metadatos e incluir solo campos permitidos. Un índice multikey único sobre eventoId no
sustituiría esta comprobación dentro de un mismo documento.

Los eventos legacy `{tipo, fecha, detalle}` se conservan y aparecen primero, en su
orden original. Los eventos nuevos se ordenan por secuencia. No se atribuye una
secuencia, identidad o fecha nueva a los eventos anteriores.

## Aprovisionamiento y despliegue futuro

**No se ejecutó este procedimiento sobre Atlas ni Supabase.** Antes de publicar:

1. Autorizar respaldo, revisión de estado e implementación de la nueva migración.
2. Verificar colección, documentos legacy, posibles duplicados y privilegios.
3. Ejecutar deliberadamente el aprovisionamiento compilado, con configuración de
   producción inyectada por el operador, sin incluir valores en el comando:

   ```sh
   node dist/deployment/provision-order-audits.js
   ```

4. Este comando crea la colección si falta, crea el índice único y actualiza el
   validador admitiendo ambos formatos. No carga seeds ni inserta documentos.
   Si hay duplicados, falla sin eliminarlos ni fusionarlos. No cambia documentos
   históricos para hacerlos pasar por eventos nuevos.
5. El arranque productivo existente ejecutará la migración registrada antes de
   abrir HTTP. Verificar luego conteos y antigüedad de pendientes.

El aprovisionamiento es explícito y repetible; no se invoca automáticamente al
iniciar NestJS. La migración está registrada en producción y Testcontainers como la sexta entrada.
Las pruebas de rollback de las migraciones anteriores retroceden primero esta
migración nueva y conservan sus comprobaciones originales.
Su down elimina las tablas nuevas: **no ejecutarlo con eventos pendientes ni
sin respaldo y autorización**, porque perdería recuperación e historial PostgreSQL.

## Monitoreo y operación

`OutboxStore.status()` proporciona únicamente estado, cantidad y fecha del evento
más antiguo. No hay endpoint público ni se devuelve payload. Logs JSON fijos
`outbox_poll_failed` y `outbox_publish_failed` excluyen errores originales,
stacks, URI, tokens y contenido del evento.

Consultar internamente y en modo de lectura:

```sql
SELECT estado, count(*), min(fecha)
FROM pedido_audit_outbox GROUP BY estado;
```

Una cola detenida se detecta por pendientes antiguos, FALLIDO, concesiones vencidas
y ausencia de avance. El operador debe investigar conexión, índice, validador,
permisos, payload y discrepancias sin copiar datos sensibles a logs. Después de
corregir la causa, `OutboxStore.retryFailed(eventoId)` devuelve únicamente ese
evento FALLIDO a pendiente; nunca volver a ejecutar la acción comercial.
Concesiones vigentes no se fuerzan. No marcar PUBLICADO manualmente para saltar
un evento incierto. No borrar predecesores ni editar secuencias para desbloquear.

El publicador vive dentro del proceso web NestJS: no avanza mientras Render esté
suspendido o el proceso detenido; retoma pendientes al reanudarse. El health HTTP
actual comprueba PostgreSQL, no acredita que la cola esté al día. Deben revisarse
los conteos/antigüedad internos además del health. Alertas externas requieren una
configuración futura autorizada.

La disponibilidad de MongoDB al arrancar sigue siendo obligatoria por el módulo
existente. Una interrupción durante ejecución acumula pendientes; no se promete
que el backend pueda reiniciar mientras MongoDB continúe caído.

## Privacidad, retención y limitaciones

No almacenar direcciones, correos, teléfonos, contraseñas, JWT, cookies, DTO
completos ni mensajes originales de excepciones. Los IDs de actor siguen siendo
referencias identificables y requieren control de acceso y política de retención.
La bitácora no es un almacén inmutable frente a un administrador de base de datos.

No hay TTL ni limpieza automática en MongoDB o PostgreSQL. Debe monitorearse el
crecimiento, incluidos contadores y el límite de tamaño de documentos MongoDB.
Las reasignaciones repetidas pueden ampliar un historial; una futura partición o
política de archivo requiere diseño y autorización. La retención de eventos
publicados, respaldo MongoDB y alertas externas quedan pendientes de aprobación.
Los contadores no deben borrarse mientras se conserve el historial del pedido.

## Correcciones verificadas al completar el prototipo

- **MongoDB/Jest:** la incidencia oficial
  [NODE-7832](https://jira.mongodb.org/browse/NODE-7832) afecta al driver 7.6.0
  al resolver el adaptador OS sin soporte para importación dinámica bajo Jest.
  El fallo termina presentándose como metadata sin driver. Se importa node:os
  explícitamente y se pasa runtimeAdapters: { os } al cliente del servicio y al
  comando de aprovisionamiento. Se comprobó conexión y escritura reales bajo Jest.
  No se actualizaron dependencias ni se relajó TLS o validación de certificados.
  Es un workaround local probado; no una afirmación de que el proveedor ya cerró
  la incidencia.
- **TypeORM:** UPDATE/RETURNING devolvía [filas, cantidad], no el arreglo esperado
  por el publicador. La reclamación termina ahora con SELECT sobre la CTE de
  actualización para devolver filas inequívocas. El parámetro del backoff tiene
  tipo integer explícito.
- **Concurrencia:** el contador espera contención acotada y no rechaza
  inmediatamente operaciones válidas. Se prueba su bloqueo real, conservación de
  un timeout menor y el uso de un pool de una conexión durante publicación.
- **Integridad:** payload y columnas coinciden por restricciones PostgreSQL;
  MongoDB valida variantes por tipo/rol/estado. Un índice parcial se rechaza como
  garantía de unicidad global y las fechas nulas no se convierten silenciosamente
  en 1970. Se reprodujeron fallos antes de aplicar estas correcciones.
- **Soporte:** al reiniciar el contenedor MongoDB, Testcontainers puede cambiar su
  puerto. La prueba de recuperación utiliza el puerto nuevo. El apagado se realiza
  sobre el proceso MongoDB real; no se sustituye por una colección simulada.

## Validación reproducible

Usar Node.js 22.22.0, Docker Desktop y únicamente los contenedores temporales del
soporte. No cargar archivos privados .env ni apuntar a bases compartidas. MongoDB
7 y PostgreSQL 16 son las imágenes de estas pruebas; no acreditan una conexión a
Atlas o Supabase.

```sh
cd apps/backend
npm test -- --runInBand
npm run test:integration -- --testPathPatterns=order-audits-outbox
npm run test:integration -- --testPathIgnorePatterns=mongo-diagnostic.integration-spec.ts
npm run lint -- --ignore-pattern test/integration/mongo-diagnostic.integration-spec.ts
npx tsc --noEmit --incremental false
npm run build
npm run test:browser
node --test test/support/chrome-browser.test.cjs
node test/support/chrome-browser.cjs --check
npm run test:deployment
```

El diagnóstico temporal continúa sin versionar y con una copia duradera externa;
se excluye explícitamente de lint e integración local. No se excluye ninguna prueba
funcional. En un checkout publicado no estará ese archivo y pueden utilizarse los
comandos normales sin las exclusiones.

Regresión frontend ejecutada con build previo y backend de pruebas:

```sh
cd apps/frontend
npm test
npm run build
npm run lint
npx tsc --noEmit --incremental false
node --test --test-concurrency=1 test/browser/cart.test.mjs test/browser/managed-orders.test.mjs test/browser/courier-deliveries.test.mjs test/browser/order-cancellation.test.mjs
```

Para el build local se fijó API_URL a loopback. El navegador obtiene URLs de
Testcontainers y puertos efímeros del backend temporal. No usa la demo estable.

Las pruebas nuevas utilizan servicios/HTTP reales, PostgreSQL y MongoDB temporales.
La simulación de una respuesta perdida ocurre después de escribir en MongoDB;
no reemplaza la persistencia principal por mocks. Se verifican los siete tipos,
actores, secuencias, rollback antes y después de escribir outbox, fallos de Mongo,
reinicios, reenvíos, creación concurrente, dos publicadores, concesiones vencidas,
reposición única, preparación contra cancelación, pool pequeño, documentos legacy,
validadores, metadatos e inexistencia de campos sensibles. Las pruebas observan
publicaciones simultáneas de pedidos distintos y verifican sus documentos reales.

### Resultados del cierre local — 19 de noviembre de 2026

| Verificación                                                             | Resultado real                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Outbox PostgreSQL/MongoDB aislada                                        | 21/21; además aprobó incluida en la integración final.                                           |
| Backend unitarias finales                                                | 767/767, 50 suites.                                                                              |
| Primera integración completa                                             | 871/871, 35 suites, antes del caso adicional de integridad y últimos controles.                  |
| Integración completa final                                               | **871/872**, 34 suites aprobadas y 1 fallida; socket hang up en Productos. No se marca aprobada. |
| Comprobación acotada posterior: Productos + outbox                       | 86/86, dos suites. No sustituye el resultado completo ni demuestra una causa corregida.          |
| Chrome MVC                                                               | 28/28.                                                                                           |
| Diagnósticos y launcher Chrome                                           | 42/42.                                                                                           |
| Preflight real Chrome                                                    | Aprobado; Chrome 158.0.8127.36.                                                                  |
| Artefacto compilado final                                                | 9/9, incluida carga de migración y módulos de bitácora.                                          |
| Copia con npm ci --omit=dev                                              | 9/9.                                                                                             |
| Copia sin Nest CLI, ts-node ni TypeScript en node_modules                | 9/9.                                                                                             |
| Frontend unitarias                                                       | 359/359.                                                                                         |
| Navegador frontend afectado: carrito, preparación, entregas, cancelación | 83/83, cuatro archivos ejecutados secuencialmente.                                               |
| Builds backend y frontend                                                | Aprobados.                                                                                       |
| TypeScript completo y ESLint backend/frontend                            | Aprobados; diagnóstico temporal excluido de ESLint.                                              |
| Prettier, enlaces locales y git diff --check                             | Aprobados en los archivos publicables.                                                           |

Cobertura: 96,33 % sentencias, 82,30 % ramas, 94,69 % funciones y 96,13 % líneas;
los cuatro umbrales configurados de 70 % aprobaron. Su alcance es la selección
existente de archivos de pedidos y entregas, no todo el backend ni el módulo outbox.

La recuperación automática requiere un proceso activo y un destino disponible.
Un evento FALLIDO necesita reparación y reactivación del operador; no se promete
que todo evento llegue sin intervención ante errores permanentes.

No se ejecutó nuevamente toda la batería de navegador frontend; se ejecutaron las
cuatro regresiones afectadas. La integración completa backend incluye los casos
HTTP/E2E de test/integration/http y migraciones sobre PostgreSQL temporal.

La instalación omit=dev puede mantener ts-node y TypeScript como peers transitivos
de TypeORM. Por eso se realizó además una prueba retirándolos físicamente solo de
la copia temporal, sin cambiar package.json, lockfile ni la instalación del proyecto.
La aplicación compilada y sus migraciones no requirieron esas herramientas.

Los logs de ejecución permanecen fuera del repositorio, en /private/tmp:
phase12d-final-outbox5.log, phase12d-final-unit3.log,
phase12d-final-integration-full.log, phase12d-final-integration-full2.log,
phase12d-final-isolated-regression.log, phase12d-final-chrome.log,
phase12d-final-launcher.log, phase12d-final-preflight.log,
phase12d-final-artifact2.log, phase12d-final-runtime-no-tools.log,
phase12d-final-front-unit.log y phase12d-final-front-browser.log.
No se incorporan esos logs al commit ni se utilizan como evidencias públicas.

### Incidencias históricas conservadas

El respaldo WIP tuvo 766/766 unitarias, pero sus pruebas de integración quedaron
bloqueadas primero por la preparación de una imagen MongoDB 8 y luego por el error
de metadata. Esos resultados no se cuentan como integración aprobada.

Durante este cierre una ejecución unitaria produjo 766/767: login MVC devolvió
401 en admin-http.spec.ts, caso de consulta inválida _csrf=extra. El fallo ocurrió
en el helper de acceso, antes del caso. No se modificó autenticación ni la
expectativa. Una ejecución posterior aprobada no demuestra su causa ni su solución.
Se conserva separado de NODE-7832, de incidentes previos con Node 24 y de los
socket hang up históricos, sin atribuir una causa no demostrada.

En la ejecución completa final, products.integration-spec.ts falló con socket hang
up en «ordena novedades por fecha real y desempata por ID antes de paginar».
Es un caso de lectura de productos, sin relación directa demostrada con la bitácora.
La ejecución anterior completa aprobó; el contraste posterior acotado Productos +
outbox aprobó 86/86. No se hicieron más reintentos completos, cambios de timeouts,
expectativas ni autenticación. Se clasifica como incidencia de transporte sin causa
demostrada, conservando el antecedente histórico sin afirmar que sea la misma causa.
No hubo fallo en los 21 escenarios nuevos de la integración final.

Recomendación: revisión mediante PR Draft y CI remoto antes de autorizar integración.
La aprobación local de otras suites no permite declarar verde la integración final.

### Alcance de publicación futura

Antes de producción: CI remoto del SHA final, autorización de migración PostgreSQL,
aprovisionamiento MongoDB compatible y verificación de permisos/índices/TLS reales.
El usuario runtime necesita lectura de índices, consulta y actualización; la cuenta
del aprovisionamiento necesita las operaciones DDL de colección, índice y validador.
No se comprobaron esos permisos ni se modificaron recursos remotos.

Un respaldo/restauración debe coordinar outbox, contadores y destino MongoDB.
No reiniciar contadores ni borrar eventos para ocultar discrepancias tras restaurar
una sola base. Si hay un ID o secuencia contradictoria, detener y reconciliar con
evidencia antes de reactivar ese pedido; no sobrescribir el historial.
