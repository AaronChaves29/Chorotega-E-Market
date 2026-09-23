# Asignar repartidor y registrar entrega

## Objetivo y alcance

`DeliveriesService` implementa el proceso 3.2 de la
[propuesta de dominio](../lab-02/propuesta-dominio.md): asignar una entrega a un
pedido preparado, ocupar un repartidor disponible y registrar el inicio,
finalización o cancelación permitida de la entrega.

Este cierre corrige únicamente la concurrencia de `assignDelivery`, ejecuta la
validación de su entrada y formaliza las reglas combinables mediante Specification.
Las operaciones posteriores conservan su comportamiento. No cambia entidades,
migraciones, consultas del Lab 3, autenticación, API REST ni frontend.

La guía del Lab 4, página PDF 2, dice: «records de entrada y salida para cada
proceso; ninguna entidad JPA expuesta fuera del servicio; mapeo manual o con
MapStruct». Su descripción se refiere a los dos procesos originales. Ambos usan
DTOs de salida; no hay una exigencia inequívoca de refactorizar todos los servicios
preexistentes, por lo que ProductsService queda fuera de esta corrección.
Tampoco se exige explícitamente un tercer caso de uso que ejecute
`CONFIRMADO → PREPARANDO`; el pedido preparado es la precondición documentada
para asignar una entrega.

## Entrada, salida y mapper

`assignDelivery` recibe `AssignDeliveryDto`:

```typescript
{ idPedido: 1, idRepartidor: 2 }
```

Ambos identificadores deben ser números enteros positivos dentro del rango de
PostgreSQL `int`. El servicio utiliza `plainToInstance` y `validateSync` antes de
abrir la transacción, igual que OrdersService. Rechaza strings numéricos,
fracciones, cero, negativos, campos ausentes, estructuras inválidas y propiedades
adicionales. El rechazo de propiedades adicionales ya está establecido por
OrdersService y por el ValidationPipe global; no es una política nueva.

`InvalidAssignmentInputException` extiende `Error` y no depende de HTTP. Los
decoradores se ejecutan también al invocar directamente el caso de uso.

Las cuatro operaciones devuelven `DeliveryResponseDto`, con `idEntrega`,
`idPedido`, `idRepartidor`, `estado`, `fechaAsignacion` y `fechaEntrega`.
`DeliveryMapper.toResponseDto` selecciona esos campos manualmente y no devuelve
la entidad ni sus relaciones. `startDelivery`, `completeDelivery` y
`cancelDelivery` conservan su entrada existente mediante `idEntrega`.

## Reglas y excepciones

| Regla                                                      | Excepción                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| El pedido debe existir                                     | `OrderNotFoundException`                                         |
| El pedido debe estar PREPARANDO                            | `InvalidOrderStateException`                                     |
| La dirección debe contener texto                           | `InvalidDeliveryAddressException`                                |
| El barrio debe existir y estar ACTIVO                      | `NeighborhoodNotFoundException`, `InactiveNeighborhoodException` |
| El pedido no puede tener una entrega ASIGNADA o EN_CAMINO  | `ActiveDeliveryExistsException`                                  |
| El repartidor debe existir y estar DISPONIBLE              | `CourierNotFoundException`, `CourierNotAvailableException`       |
| Una operación posterior requiere una entrega existente     | `DeliveryNotFoundException`                                      |
| Iniciar/cancelar exige ASIGNADA; completar exige EN_CAMINO | `InvalidDeliveryStateException`                                  |

La propuesta prohíbe que un pedido tenga dos entregas activas y que un repartidor
ocupado reciba otra entrega. Esas reglas motivan los bloqueos. La actividad del
repartidor se representa mediante `disponibilidad`, que admite DISPONIBLE,
OCUPADO e INACTIVO; no se agrega una nueva regla de autorización.

La asignación marca entrega ASIGNADA y repartidor OCUPADO. El inicio marca entrega
y pedido EN_CAMINO. La finalización marca entrega ENTREGADA, pedido ENTREGADO,
fecha de entrega y repartidor DISPONIBLE. La cancelación solo admite ASIGNADA,
marca CANCELADA y libera el repartidor. No se recalculan precios ni tarifa del pedido.

## Transacción y concurrencia

Después de validar el DTO, `assignDelivery` abre `DataSource.transaction()`:

1. Obtiene las filas y los repositorios desde el EntityManager transaccional.
2. Bloquea el pedido con `pessimistic_write` (`SELECT ... FOR UPDATE`).
3. Evalúa preparación, dirección, barrio y ausencia de entrega activa.
4. Bloquea el repartidor y comprueba su disponibilidad actual.
5. Guarda la entrega y cambia el repartidor a OCUPADO.
6. Construye el DTO; el llamador lo recibe después del commit.

El orden fijo es pedido y después repartidor. Si dos asignaciones compiten por un
pedido, la segunda espera y luego detecta la entrega activa. Si corresponden a
pedidos distintos y al mismo repartidor, la segunda espera por este último y
después encuentra OCUPADO. No se intenta bloquear una entrega que aún no existe.
Los parámetros se vinculan mediante TypeORM; no se concatenan identificadores SQL.

Se reutilizan DeliveriesRepository y NeighborhoodsRepository construidos con
`manager.getRepository(...)`. Las lecturas bloqueantes usan los repositorios
TypeORM del mismo manager. No se cambia la base genérica ni los repositorios del
Lab 3. Se elimina la inyección global de NeighborhoodsRepository porque la
asignación necesita su instancia transaccional.

El diagnóstico anterior reproducía dos asignaciones exitosas. Las dos regresiones
nuevas también fallaron contra el servicio anterior, mostrando dos resultados
`fulfilled`; pasan después de la corrección. La garantía verificada corresponde
a llamadas concurrentes de asignación, no a escrituras arbitrarias fuera del servicio.

Las operaciones de iniciar, completar y cancelar conservan sus transacciones de
escritura existentes. Este cambio no refactoriza su estrategia de lecturas ni
pretende acreditar todos los posibles cruces concurrentes entre esas operaciones.

## Segundo patrón: Specification

**Problema:** para asignar una entrega, el pedido debe satisfacer conjuntamente
criterios independientes: estar preparado y tener dirección válida. Cada
incumplimiento debe conservar una explicación de negocio específica.

**Señal previa:** comprobaciones consecutivas de `estado` y `direccionEntrega`
dentro de `assignDelivery`, anteriores a cualquier escritura.

**Justificación:** usamos Specification porque la elegibilidad de un pedido para
reparto requiere combinar reglas independientes y explicar cuál se incumple.

`src/modules/deliveries/domain/delivery-assignment.specification.ts` contiene una
Specification pequeña con `isSatisfiedBy`, `assertSatisfiedBy` y composición
`and`. `preparedOrder.and(validDeliveryAddress)` produce `orderReadyForDelivery`,
que el servicio evalúa sobre el pedido bloqueado. AND usa cortocircuito y conserva
la primera excepción. Son reglas existentes, sin políticas ficticias, nuevas
dependencias ni una jerarquía de clases.

Strategy no tiene una señal de políticas intercambiables y Factory no tiene una
creación variable. State ya se utiliza en pedidos; Specification representa un
segundo patrón distinto con una necesidad presente en entregas.

## Pruebas y rollback

Se conservan las 14 unitarias anteriores de DeliveriesService. Se añaden 14 casos
de formato inválido y dos de recursos inexistentes. La prueba de asignación
comprueba los bloqueos, el uso del manager y la salida sin entidad. Tres pruebas
de Specification verifican la conjunción y el diagnóstico de cada criterio.

`test/integration/deliveries-concurrency.integration-spec.ts` reutiliza el helper
existente: PostgreSQL 16 temporal, puertos dinámicos, nueve entidades, migraciones
reales y `synchronize: false`, sin `.env`. Resuelve el módulo NestJS real con ese
DataSource. Sus dos casos son:

- Mismo pedido y repartidores distintos: una asignación confirma, otra recibe
  `ActiveDeliveryExistsException`; queda una entrega activa y solo un repartidor ocupado.
- Pedidos distintos y mismo repartidor: una confirma, otra recibe
  `CourierNotAvailableException`; queda una entrega y un repartidor ocupado.

Un QueryRunner mantiene un bloqueo temporal mientras arrancan ambos intentos.
La prueba consulta `pg_stat_activity` y espera que ambos estén bloqueados antes de
liberarlos. Así acredita contención real sin sustituir respuestas ni escrituras
del servicio. Libera el bloqueo en `finally`, espera las operaciones pendientes,
limpia solo las tablas temporales y cierra módulo, conexión y contenedor.

`deliveries-rollback.integration-spec.ts` conserva su escenario y todas sus
aserciones: actualiza la entrega, provoca un error mediante trigger al actualizar
el pedido y verifica que entrega, pedido y repartidor mantienen sus valores
originales. Solo se adapta la construcción del servicio al parámetro eliminado.
El rollback de pedidos también sigue pasando. No se modifican migraciones para
provocar errores.

## Verificación local y cobertura

Resultados del 23 de septiembre de 2026 en `fix/delivery-assignment-consistency`:

| Comprobación                                     | Resultado                                |
| ------------------------------------------------ | ---------------------------------------- |
| Prettier, ESLint, TypeScript sin emisión y build | Aprobados                                |
| Unitarias totales                                | 109 aprobadas, 7 suites                  |
| Unitarias directamente de negocio Lab 4          | 95: pedidos 62; entregas 33              |
| Otras unitarias                                  | 14 del servicio/repositorio de productos |
| Integraciones totales                            | 15 aprobadas, 7 suites; 12,356 segundos  |
| Regresiones concurrentes nuevas                  | 2 aprobadas; antes fallaban ambas        |
| `git diff --check`                               | Sin errores                              |

La primera ejecución de integración tras retomar el trabajo falló por Docker
detenido. Se inició Docker y se repitió la suite sin cambiar pruebas para ocultar
el problema. ESLint detectó además una aserción de tipo redundante y formato en
la prueba nueva; se corrigieron antes de la validación final.

La configuración de cobertura existente incluye ambos procesos y archivos sin
cobertura. No se modifica la selección ni se mezclan integraciones con unitarias:

| Métrica    | Resultado         |
| ---------- | ----------------- |
| Statements | 96,37 % (319/331) |
| Branches   | 90,98 % (111/122) |
| Functions  | 92,85 % (52/56)   |
| Lines      | 96,22 % (306/318) |

Todas superan el umbral global existente de 70 %. Los reportes locales se generan
en `apps/backend/coverage/`, ignorado por Git.

## Evidencia de CI y revisión de rúbrica

Se verificó remotamente el [CI de develop](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/35816057244)
para `556eed10d0215e52215d964bbb14e5c7e13d8402`: estado `completed`, conclusión
`success`. Es evidencia de la base integrada; no acredita esta corrección local.
La rama todavía no se publica. Su CI queda pendiente de commit/push autorizados.
El workflow existente ya ejecuta unitarias con umbral de cobertura e integración;
descubre automáticamente la nueva suite. No necesita cambios.

| Requisito                                      | Evidencia                                           | Estado    |
| ---------------------------------------------- | --------------------------------------------------- | --------- |
| Dos procesos con reglas y excepciones          | OrdersService y DeliveriesService, pruebas de ambos | CUMPLIDO  |
| DTOs de entrada/salida y mapeo explícito       | CreateOrderDto, AssignDeliveryDto y ambos mappers   | CUMPLIDO  |
| Ninguno de los dos procesos devuelve entidades | Contratos y pruebas de salida                       | CUMPLIDO  |
| Dos patrones justificados                      | State en pedidos y Specification en entregas        | CUMPLIDO  |
| Transacción multi-paso                         | Pedido/detalles/inventario; entrega/repartidor      | CUMPLIDO  |
| Rollback real con Testcontainers               | Integraciones de pedidos y entregas aprobadas       | CUMPLIDO  |
| Mínimo ocho unitarias                          | 95 casos de negocio aprobados                       | CUMPLIDO  |
| Cobertura de negocio ≥70 %                     | Cuatro métricas verificadas                         | CUMPLIDO  |
| CI configurado con umbral                      | Workflow y configuración Jest existentes            | CUMPLIDO  |
| Documentación de ambos procesos                | Este documento y proceso-pedidos.md                 | CUMPLIDO  |
| Resultado remoto de esta corrección            | Pendiente de publicación autorizada                 | PENDIENTE |

Los requisitos técnicos están comprobados localmente. El resultado remoto del
cierre todavía no existe; tampoco se afirma haber efectuado la entrega en el aula
virtual ni verificado una defensa individual.
