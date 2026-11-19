# Bitácora de pedidos: PostgreSQL outbox y MongoDB

Fase 12D, basada en develop `1a6b98faa706c843a354e15fa556cf83a3898dd6`.
**WIP — implementación incompleta, respaldada sin autorización de integración ni producción.**
No tiene las validaciones finales aprobadas. Las secciones técnicas siguientes
explican el diseño y el código parcial; no acreditan garantías verificadas de extremo
a extremo. Este respaldo no autoriza ejecutar migraciones ni aprovisionamiento.
Fase 12D queda pausada mientras se prepara la demostración estable.

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

| Tipo | Actor autenticado | Cambio registrado |
| --- | --- | --- |
| PEDIDO_CONFIRMADO | CLIENTE | PENDIENTE → CONFIRMADO |
| PEDIDO_CANCELADO | CLIENTE propietario | CONFIRMADO/PENDIENTE → CANCELADO |
| PEDIDO_PREPARANDO | EMPRENDEDOR propietario | CONFIRMADO → PREPARANDO |
| ENTREGA_ASIGNADA | ADMIN | Entrega nueva → ASIGNADA |
| ENTREGA_CANCELADA | ADMIN | ASIGNADA → CANCELADA |
| ENTREGA_EN_CAMINO | REPARTIDOR propietario | Entrega ASIGNADA → EN_CAMINO; pedido PREPARANDO → EN_CAMINO |
| PEDIDO_ENTREGADO | REPARTIDOR propietario | Entrega EN_CAMINO → ENTREGADA; pedido EN_CAMINO → ENTREGADO |

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

El escritor obtiene `pg_try_advisory_xact_lock(512, pedidoId)` al final y actualiza
el contador con INSERT/ON CONFLICT. Si está ocupado, falla y revierte la operación;
no espera indefinidamente ni reintenta la operación comercial. Todos los emisores
deben conservar este protocolo y no hacer más consultas comerciales después.
Un rollback revierte el contador; la siguiente transición usa la secuencia correcta.
El orden por pedido se define por esta reserva transaccional, no por relojes ni UUID.
No se garantiza un orden global entre pedidos independientes.

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
`ultimaSecuencia`. Es obligatorio el índice único por pedido; el publicador
comprueba su existencia y falla de forma cerrada si falta.

El primer evento se crea mediante setOnInsert y upsert. Una colisión 11000 se
reconcilia consultando el documento; no se ignoran otros errores. En documentos
históricos solo se inicializa el contador a cero cuando no contienen eventos del
nuevo esquema. La inserción siguiente usa push condicionado por secuencia previa
y ausencia del eventoId. No se reemplaza el historial completo.

La lectura posterior comprueba exactamente un evento y su contenido. Si MongoDB
guarda pero se pierde la respuesta, el siguiente intento reconoce el mismo ID y
contenido sin agregarlo otra vez. Una contradicción de payload o secuencia falla.
El ACK utiliza writeConcern majority. Un índice multikey único sobre eventoId no
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
iniciar NestJS. La migración está registrada en producción y Testcontainers.
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

## Validación reproducible

Usar Node.js 22.22.0, Docker Desktop y únicamente los contenedores temporales del
soporte de pruebas. No cargar archivos privados .env ni apuntar a bases compartidas.

```sh
cd apps/backend
npm test -- --runInBand
npm run test:integration -- --testPathPatterns=order-audits-outbox
npm run test:integration
npm run lint
npx tsc --noEmit
npm run build
npm run test:browser
npm run test:deployment
```

Las pruebas nuevas utilizan servicios/HTTP reales, PostgreSQL y MongoDB temporales.
La simulación de una respuesta perdida ocurre **después** de escribir en MongoDB;
no reemplaza la persistencia principal por un mock. Se verifican documentos,
rollback, inventario, actores, concesiones y carreras reales.

### Resultados

Resultados históricos de las ejecuciones locales de Fase 12D, sin repetirlos para
este respaldo:

- Unitarias: 766/766 aprobadas; no prueban por sí solas la integración entre bases.
- Primer intento de integración: venció la preparación de MongoDB 8; los escenarios
  no completaron su ejecución.
- Segundo intento, MongoDB 7: los 14 escenarios quedaron bloqueados por el handshake
  `Missing required sub-document 'driver' in the client metadata document`.
- Se observaron metadatos vacíos bajo Jest y presentes fuera de Jest con Node 22.
  La causa interna permanece sin demostrar; no se declara corregida.
- Revisión posterior de TypeScript: error TS2339 en la prueba nueva, al acceder a
  `tipo` en una declaración de filas que no incluye ese campo.
- ESLint continúa con errores en la nueva integración. El diagnóstico temporal
  también tenía errores, pero está expresamente excluido del commit WIP.
- No aprobaron las validaciones finales de build, integración completa, Chrome MVC
  y artefacto correspondientes a esta implementación parcial.

El archivo temporal `mongo-diagnostic.integration-spec.ts` se conserva localmente
sin incluirlo en el respaldo Git y tiene una copia duradera fuera del repositorio.
No se incluyen logs, credenciales ni archivos de la demostración. Las pruebas verdes
del develop estable corresponden a otra versión y no validan este trabajo parcial.
No integrar, desplegar ni presentar esta bitácora como funcionalidad terminada.
