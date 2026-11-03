# Laboratorio 7: consistencia transaccional de entregas

Bloque 5 sobre `429537b77122161b3fbd1f88067f632aa773a5f9`, en
`feat/lab-07-security-concurrency`. Verificación local del 3 de noviembre de 2026,
con Node.js 22.22.0. No se realizaron operaciones en bases productivas.

## Diagnóstico inicial

`DeliveriesService.startDelivery()` y `completeDelivery()` abren una transacción
mediante `DataSource.transaction()`. Ambas bloquean la entrega y llaman a
`assertCourierOwnsDelivery()`. El helper, situado originalmente alrededor de la
línea 306, consultaba `this.couriersRepository.findByUserId(idUsuario)`.

Ese repositorio inyectado estaba ligado al administrador global del DataSource,
no al `manager` recibido por el callback. La transacción retenía una conexión y
su bloqueo mientras esperaba una consulta que podía necesitar otra conexión del
mismo pool. Con una sola conexión, la consulta no podía adquirirla antes de que
la transacción terminara, y la transacción esperaba precisamente esa consulta.

El fallo reproducido fue **agotamiento del pool con timeout de adquisición**, no
un deadlock PostgreSQL demostrado. Con más conexiones el defecto puede pasar
inadvertido, consumir conexiones adicionales y dejar la consulta fuera del
contexto transaccional. No se afirma que se haya reproducido una filtración de
datos o un cambio de propiedad concurrente.

## Revisión de las cuatro operaciones

| Operación    | Repositorios dentro del callback                                                     | Orden de bloqueos conservado  | Hallazgo                                        |
| ------------ | ------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------- |
| Asignación   | Pedido, barrio, entrega y repartidor obtenidos del manager                           | Pedido → repartidor           | No se encontró una consulta externa al manager. |
| Inicio       | Entrega y pedido transaccionales; propiedad antes por repositorio global             | Entrega → pedido              | Lectura externa en el helper de propiedad.      |
| Finalización | Entrega, pedido y repartidor transaccionales; propiedad antes por repositorio global | Entrega → pedido → repartidor | La misma lectura externa.                       |
| Cancelación  | Entrega y repartidor transaccionales                                                 | Entrega → repartidor          | No se encontró una consulta externa al manager. |

La lectura de propiedad no añade un bloqueo pesimista. Se conserva su posición
entre el bloqueo de la entrega y la validación/actualización posterior. Las
lecturas públicas/autorizadas fuera de estas transacciones continúan usando sus
repositorios habituales.

## Corrección mínima

Los dos métodos ahora pasan su `EntityManager` al helper:

```ts
await this.assertCourierOwnsDelivery(delivery, idUsuario, manager);
```

El helper utiliza el mismo repositorio concreto existente, ligado al manager:

```ts
const courier = await new CouriersRepository(
  manager.getRepository(Courier),
).findByUserId(idUsuario);
```

La creación del wrapper de repositorio es solo un objeto JavaScript: no crea
otro DataSource, conexión, pool ni transacción. Sus consultas usan el QueryRunner
y la conexión de la transacción existente. Es el patrón que el proyecto ya usa
en la asignación y en el proceso de pedidos.

La [documentación de transacciones de TypeORM](https://typeorm.io/docs/transactions/)
requiere utilizar el administrador proporcionado por la transacción para sus
operaciones. No se cambian el nivel de aislamiento ni la configuración del pool
productivo.

Se mantienen el constructor público y los proveedores del servicio para no
refactorizar consumidores ni módulos. No se modifican controladores, DTOs,
repositorios compartidos ni reglas de dominio.

## Atomicidad y seguridad conservadas

- Asignación guarda entrega y disponibilidad del repartidor en una transacción.
- Inicio guarda entrega y pedido en una transacción.
- Finalización guarda entrega, pedido y disponibilidad del repartidor en una
  transacción.
- Cancelación guarda entrega y disponibilidad del repartidor en una transacción;
  conserva el pedido en PREPARANDO según el flujo actual.
- Un usuario ajeno o sin repartidor asociado sigue recibiendo
  `DeliveryAccessDeniedException` (403 en HTTP), sin escrituras.
- Los guards JWT/roles y el alcance SQL de lectura permanecen intactos. ADMIN
  asigna/cancela; REPARTIDOR propietario inicia/completa.
- Los estados y errores existentes se conservan. Un timeout técnico no se
  reclasifica artificialmente como conflicto de negocio.

Cada operación tiene su propia transacción; no se afirma que todo el ciclo de
vida, compuesto por varias solicitudes, sea una sola transacción.

## Reproducción antes y después

Se añadió primero una prueba sobre el servicio original, sin modificarlo. La
base se creó exclusivamente con PostgreSQL 16 Testcontainers y las cuatro
migraciones reales, incluida la versión de productos.

El DataSource de operaciones utiliza `poolSize: 1`, `extra.max: 1` y
`connectionTimeoutMillis: 500`. Los repositorios inyectados y los transaccionales
pertenecen a ese mismo DataSource. El observador de pruebas es independiente y
solo prepara fixtures, coordina bloqueos y verifica resultados en el mismo contenedor.

Comando focalizado desde `apps/backend`, antes de la corrección:

```sh
npm run test:integration -- --testPathPatterns=deliveries-transactions.integration-spec -t='asigna, inicia y completa con un pool'
```

Resultado: **un caso ejecutado y fallido**, once casos no seleccionados por `-t`.
La asignación guardó correctamente; el inicio falló con
`timeout exceeded when trying to connect`, originado en `pg-pool`.
No se confundió una selección vacía con una reproducción.

Después se corrigió únicamente el servicio y se conservó la expectativa de éxito
del caso. El flujo asignar → iniciar → completar termina correctamente usando la
única conexión; el PID PostgreSQL antes/después permanece igual.

## Pruebas añadidas y ajustadas

`deliveries-transactions.integration-spec.ts` incorpora doce casos reales:

1. Asignación, inicio y finalización con pool de una conexión.
2. Cancelación y liberación del repartidor con una conexión.
3. Propiedad en inicio: rechazo de otro repartidor y de usuario sin registro.
4. La misma comprobación de propiedad en finalización.
5. Rollback de asignación después de insertar la entrega.
6. Rollback de inicio después de actualizar la entrega.
7. Rollback de finalización después de actualizar entrega y pedido.
8. Rollback de cancelación después de actualizar la entrega.
9. Dos inicios concurrentes de una misma entrega: una transición aceptada.
10. Dos finalizaciones concurrentes: una transición aceptada.
11. Inicio contra cancelación concurrentes: un resultado coherente.
12. `lock_timeout` real: rollback, liberación de la conexión y reintento explícito.

Los fallos de rollback se provocan con triggers exclusivos del contenedor. Antes
de lanzar el error, cada trigger exige observar las escrituras previas de esa
operación. Después se verifica que todos los registros vuelven a sus valores
anteriores. No se cambian tablas de negocio ni migraciones del proyecto.

Para concurrencia se usa un pool de dos conexiones, se bloquea la entrega desde
una conexión observadora y se espera evidencia de ambas operaciones bloqueadas
en `pg_stat_activity` antes de liberarla. No se decide el ganador mediante una
espera fija. La adquisición está limitada a 500 ms, los bloqueos ordinarios de
estos DataSources a 2000 ms y las sentencias a 4000 ms. El caso de timeout usa
un DataSource adicional temporal con `lock_timeout=100ms`. La limpieza de DataSources,
QueryRunners, triggers y contenedores se realiza mediante callbacks de cierre y
bloques finally, también si falla una aserción.

Las unitarias existentes se ajustan para simular la consulta de propiedad en el
repositorio del EntityManager. Se conserva el caso donde la autorización pasa,
pero el repartidor no aparece en la lectura bloqueada posterior. Una aserción
adicional exige que el repositorio global nunca se consulte durante los casos.
No se eliminan escenarios ni se debilitan expectativas de autorización.

Las suites preexistentes de asignación concurrente conservan sus dos casos:
un pedido con dos repartidores y un repartidor para dos pedidos. La suite HTTP
real conserva roles, JWT, propiedad, errores y persistencia/rollback.

## Archivos del bloque

- `apps/backend/src/modules/deliveries/services/deliveries.service.ts`:
  pasa el manager a la lectura de propiedad.
- `apps/backend/src/modules/deliveries/services/deliveries.service.spec.ts`:
  adapta los mocks y comprueba que no se usa el repositorio global.
- `apps/backend/test/integration/deliveries-transactions.integration-spec.ts`:
  doce regresiones PostgreSQL de pool, concurrencia y atomicidad.
- `docs/laboratory/lab-07/transacciones-entregas.md`: diagnóstico y evidencia.

## Validaciones

Resultados locales finales con Node.js 22.22.0:

| Comprobación                                             | Resultado                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| Prettier de los tres archivos TypeScript y del documento | Aprobado                                                         |
| ESLint completo                                          | Aprobado                                                         |
| TypeScript sin emisión ni incremental                    | Aprobado                                                         |
| Build del backend                                        | Aprobado                                                         |
| Unitarias focalizadas de entregas                        | 73/73, 6 suites                                                  |
| Unitarias completas con cobertura existente              | 533/533, 43 suites                                               |
| Integración focalizada de entregas                       | 72/72, 4 suites                                                  |
| Integración completa final                               | 646/646, 26 suites, aproximadamente 103 s                        |
| Chrome MVC                                               | 9 escenarios aprobados; TAP 10/10 incluyendo el contenedor padre |
| Artefacto compilado                                      | 9/9                                                              |
| git diff --check                                         | Sin errores                                                      |

Los 72 casos focalizados incluyen los 12 nuevos, los 57 HTTP existentes, los dos
casos previos de asignación concurrente y el rollback previo. Son un subconjunto
de los 646 casos de integración, no pruebas adicionales para sumar otra vez.
No se eliminaron pruebas. La cobertura existente de pedidos/entregas conserva
statements 97.50 %, branches 84.63 %, functions 92.00 % y lines 97.74 %, con los
umbrales y exclusiones originales.

La primera integración completa terminó con 645/646: el login de preparación de
un caso de `users.integration-spec.ts` esperaba 201 y recibió 401 antes de probar
PATCH de `nombre` con espacios. Users aislado aprobó 74/74 y la repetición completa
aprobó 646/646. No se modificaron Auth, Users, JWT, guards ni expectativas para
conseguirlo. La causa de esa incidencia sigue sin demostrarse; no se atribuye ni
se presenta como corregida por este bloque.

Docker estaba apagado al inicio. Se inició Docker Desktop localmente y las suites
con PostgreSQL temporal y Chrome pudieron ejecutarse. Al finalizar, docker ps no
mostró contenedores temporales de estas pruebas; se conservó el contenedor local
preexistente. El incidente Chrome/Browser.getVersion no se reprodujo. No se
modificó su soporte ni se afirma una corrección de ese incidente.

Comandos desde `apps/backend` con Node.js 22.22.0:

```sh
npx --no-install prettier --check src/modules/deliveries/services/deliveries.service.ts src/modules/deliveries/services/deliveries.service.spec.ts test/integration/deliveries-transactions.integration-spec.ts
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
npm run test:cov -- --runInBand
npm run test:integration
npm run test:integration -- --testPathPatterns='deliveries-transactions|deliveries-concurrency|deliveries-rollback|http/deliveries.integration'
npm run test:browser
npm run test:deployment
```

También se comprueban formato de este documento, `git diff --check`, limpieza de
contenedores y conservación exacta de la modificación previa de `.gitignore`.

## Límites y pendientes

La reproducción y las regresiones usan PostgreSQL local temporal, no Supabase
ni su pooler. No se realizó una prueba de carga productiva, de fallos de red o de
todas las posibles combinaciones de bloqueos del sistema. El resultado no
significa que cualquier deadlock sea imposible.

El uso del manager elimina la segunda adquisición de conexión en esta lectura;
un pool saturado por otras operaciones aún puede agotar su tiempo de espera.
No se introducen reintentos automáticos ni se modifican timeouts de producción.
Los timeouts controlados del documento pertenecen únicamente a los tests.

No se modifican los bloques 1–4, la migración de productos, logging JSON, eventos
de seguridad, health, CI/CD ni scripts/configuración de despliegue. El despliegue
sigue bloqueado por `false`. No se ejecutaron migraciones remotas ni se inició
el Bloque 6. Este resultado local no implica validación de un commit nuevo en CI.
