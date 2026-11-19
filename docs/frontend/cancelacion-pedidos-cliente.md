# Fase 12C — Cancelación de pedidos del cliente

## Base y alcance

Rama: `feature/cancelacion-pedidos-cliente`. Base: `b55dd1b3212688c61b9c2359672d2366d548ff03`, merge de #151 con [CI aprobado](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44469726123).

Se incorpora cancelación sobre los pedidos existentes, sin reconstruir compra, carrito, preparación o reparto. No cambia el esquema, no crea migraciones y no integra notificaciones ni MongoDB. No se modifican datos persistentes ni servicios productivos.

## Reglas y autorización

| Condición                                        | Resultado                                                 |
| ------------------------------------------------ | --------------------------------------------------------- |
| JWT ausente, inválido o vencido                  | 401                                                       |
| Rol distinto de CLIENTE                          | 403, también si se invoca directamente el servicio        |
| ID inválido                                      | 400                                                       |
| Pedido inexistente o de otro cliente             | 404 idéntico, sin revelar campos del pedido               |
| PENDIENTE sin entrega que lo impida              | CANCELADO, sin restauración de existencias                |
| CONFIRMADO sin entrega que lo impida             | CANCELADO y restauración del inventario descontado        |
| PREPARANDO, EN_CAMINO, ENTREGADO o CANCELADO     | 409, sin escrituras                                       |
| Entrega ASIGNADA, EN_CAMINO o ENTREGADA asociada | 409 incluso si el estado del pedido fuese incoherente     |
| Entrega CANCELADA histórica                      | No impide por sí sola cancelar un pedido todavía elegible |

El cliente procede exclusivamente de la identidad autenticada. No se acepta `idCliente`, `estado`, cantidades ni importes en el cuerpo. El guard usa la cuenta y rol actuales; el servicio vuelve a comprobar el rol y el propietario en la consulta transaccional.

La compra pública crea y confirma el pedido en una sola transacción: no produce PENDIENTE duraderos. En el modelo, el descuento corresponde a la confirmación. Por eso PENDIENTE no acredita inventario descontado y no se suma stock al cancelarlo. Se prueba esa rama con una unidad del servicio, sin introducir pendientes artificiales en el flujo público ni fabricar una compra pendiente para la integración. Registros históricos incoherentes necesitarían investigación independiente; no se reinterpretan aquí.

## Transacción y bloqueos

[OrderCancellationService](../../apps/backend/src/modules/orders/services/order-cancellation.service.ts) utiliza un único `DataSource.transaction` y únicamente repositorios del `EntityManager` de esa transacción:

1. Busca por ID y `idCliente` y bloquea el pedido con `pessimistic_write`.
2. Valida la transición y consulta entregas que impedirían cancelar.
3. Lee los detalles históricos. Para CONFIRMADO, agrupa cantidades por producto.
4. Bloquea todos esos productos en orden ascendente de ID, reutilizando `findByIdsForUpdate`.
5. Restaura cantidades y guarda cada producto bajo bloqueo. TypeORM incrementa su `VersionColumn`; una edición con versión anterior recibe 409.
6. Actualiza únicamente el estado del pedido y confirma la transacción.

Se mantienen precios, líneas, dirección, fechas e importes históricos. No se elimina el pedido. La restauración incluye productos actualmente inactivos: reponer existencias no los reactiva ni cambia su precio. Un producto inexistente o una cantidad que desborde el entero PostgreSQL impide confirmar y revierte todos los cambios.

**Orden compatible:** preparación y asignación bloquean primero el mismo pedido. Asignación exige PREPARANDO; no se modifica esa regla para permitir asignar un CONFIRMADO. Cancelación y preparación compiten por una sola transición válida. Contra asignación, desde CONFIRMADO puede ganar cancelación y la asignación se rechaza; desde PREPARANDO se rechaza cancelación y la asignación conserva su comportamiento.

Compra y cancelación usan el mismo orden ascendente de productos. La compra crea un pedido nuevo y no necesita bloquear el pedido que se cancela. La edición de stock se serializa sobre las filas de producto y comprueba su versión. Estas reglas evitan introducir una inversión de bloqueos en los caminos revisados; no constituyen una garantía universal frente a SQL externo, triggers futuros u otras operaciones no auditadas.

Dos cancelaciones del mismo pedido se serializan por su fila. Una confirma; la otra encuentra CANCELADO y recibe 409. Repetir tras perder la respuesta no restaura inventario nuevamente. No hay clave de idempotencia ni garantía de repetir un 200 idéntico: existe protección transaccional de una única transición por pedido.

## Contratos REST y BFF

### REST

`PATCH /api/v1/orders/:id/cancel`, JWT CLIENTE, sin cuerpo o con `{}`. Respuesta 200: `OrderResponseDto` existente con estado CANCELADO. Rechazos: 400, 401, 403, 404, 409 y 500 con RFC 9457 Problem Details. Los errores internos no se muestran en la interfaz.

OpenAPI pasa de **41 a 42 operaciones**. La colección [api.http](../laboratory/lab-05/api.http) pasa de **50 a 54 bloques**: compra independiente para cancelar, cancelación, lectura posterior y repetición rechazada. Se conserva el recorrido de entrega original. La integración ejecuta todos los bloques con JWT real y PostgreSQL temporal y contrasta el contrato generado.

### Next.js

- `PATCH /api/orders/[id]/cancel`: sesión HttpOnly y rol CLIENTE, origen exacto, JSON, objeto vacío, ID válido y ausencia de parámetros desconocidos. Antes de escribir consulta el pedido propio; NestJS decide elegibilidad bajo bloqueo.
- `GET /api/orders/[id]`: consulta segura del estado real para resolver respuestas ambiguas. Comprueba rol y propietario y no escribe.
- Ambos proyectan campos explícitos, usan `no-store`, eliminan la cookie rechazada en 401 y no devuelven JWT, mensajes SQL ni errores originales. El BFF no acepta identidad del navegador ni habilita acceso a pedidos ajenos.

## Historial del cliente

La tarjeta ofrece **Cancelar pedido** solo en PENDIENTE o CONFIRMADO, sujeto a validación definitiva del backend. La confirmación es explícita y puede abandonarse con **Volver**, sin escribir.

Una referencia síncrona impide dobles envíos; durante el PATCH se muestra carga. Tras un 200 coherente se reconsulta el listado. Los 409, 403 y 404 tienen mensajes propios. Errores de red/5xx o respuestas contradictorias no se muestran como cancelación confirmada.

Ante incertidumbre no hay reenvío automático: se ofrece **Consultar estado del pedido**, que realiza solo GET. Una respuesta válida actualiza el historial y permite revisar las acciones correspondientes al estado actual; una nueva cancelación requeriría otra confirmación explícita. Incluso si se recarga o se usa otra pestaña, el backend impide restaurar dos veces el mismo pedido. El bloqueo de UI no se presenta como exclusión distribuida.

La confirmación se renderiza como sección accesible con nombre, controles nativos y estados anunciados; no se declara un modal que requiera atrapar el foco. No se cambian login, cookies, carrito ni las rutas de los demás roles.

## Pruebas y resultados

Node.js 22.22.0; Chrome local; PostgreSQL efímero mediante Testcontainers. Se reutilizan guards, filtros y servicios reales.

- Unitarias backend finales: **744/744**, 49 suites. Incluyen autorización directa, PENDIENTE sin descuento, estados rechazados, delegación del controlador y cuerpo vacío.
- Unitarias frontend: **359/359**. Incluyen sesión, roles, origen, parámetros, identidad manipulada, 400/401/403/404/409/500, red, proyección y consulta sin mutaciones.
- Integración backend completa: **851/851**, **34 suites**, 148,325 s. Incluye **19 casos nuevos de cancelación** y el OpenAPI actualizado.
- Pruebas reales de concurrencia: cancelación duplicada, cancelación/preparación, cancelación/asignación desde ambos estados, cancelación/edición optimista y cancelación/compra. Comprueban estados y stock neto, sin sustituir PostgreSQL por mocks.
- Rollback real: un trigger temporal del contenedor falla al restaurar el segundo producto; se verifican inventario, versiones y estado intactos. El trigger se elimina en `finally`. Nunca se ejecuta en una base externa.
- Chrome MVC existente: **28/28**. Artefacto compilado del backend: **9/9**.
- Primera nueva suite Chrome: **5/5**. Comprueba confirmación, volver sin escribir, doble clic y pérdida de respuesta después de una cancelación real seguida de lectura GET.
- Primera batería completa de navegador frontend: **238/238**, 13 archivos. Después se precisaron mensajes 409/403/404 y se añadió un caso Chrome de preparación durante la confirmación; esta primera cifra no se presenta como validación de ese ajuste posterior.

Validación final sobre el último build: **239/239** pruebas de navegador frontend, **13 archivos**, 80,122 s; incluye **6/6** de la suite nueva (un escenario padre y cinco subpruebas), ahora con preparación durante la confirmación y respuesta HTTP 409 visible. Unitarias frontend finales: **359/359**. ESLint, TypeScript y builds de ambos proyectos, Prettier y `git diff --check`: aprobados. No se ejecutó una suite E2E separada del backend adicional a la integración completa ni pruebas contra proveedores productivos. No se modifican timeouts ni se añaden reintentos automáticos. Los logs y capturas sintéticas de las regresiones permanecen fuera del repositorio.

Durante implementación, una ejecución focalizada falló por nombres repetidos en fixtures sujetos a UNIQUE y por una referencia mal formada en la colección; se corrigieron fixtures e interpolación. Otra ejecución focalizada verificó el flujo funcional y señaló que faltaba normalizar la variable nueva en el chequeo estático de la colección. Se corrigió siguiendo su mecanismo existente; la integración completa posterior aprobó. Estos errores de implementación son independientes de los antecedentes intermitentes de 401, `socket hang up` y Chrome, cuya causa histórica no se declara corregida.

## Reproducción local

Con dependencias existentes, Node.js 22.22.0, Docker Desktop y Chrome disponibles:

```sh
cd apps/backend
npm test -- --runInBand
npm run test:integration
npm run test:browser
npm run lint
npx --no-install tsc --noEmit
npm run build
```

```sh
cd apps/frontend
npm test
npm run lint
npx --no-install tsc --noEmit
npm run build
npm run test:browser -- --test-concurrency=1
```

No ejecutar arranque productivo, migraciones remotas, conversiones de datos ni operaciones sobre Supabase/Atlas para reproducir estas pruebas.
