# API REST de entregas

Los endpoints de Deliveries conservan las rutas `/api/v1/deliveries`, los DTOs, las transacciones, los bloqueos y las reglas de transición existentes. Este bloque incorpora una **nueva política de lectura por propietario** y la traducción explícita de excepciones de negocio a HTTP. Antes de este cambio, las consultas permitían que un REPARTIDOR leyera entregas de otros repartidores.

## Permisos

Todos los endpoints utilizan `JwtAuthGuard`, `RolesGuard` y `@Roles`. Un JWT ausente o inválido produce 401. CLIENTE y EMPRENDEDOR reciben 403 en todas las operaciones.

| Método y ruta                          | ADMIN                       | REPARTIDOR                                    |
| -------------------------------------- | --------------------------- | --------------------------------------------- |
| GET `/api/v1/deliveries`               | Todas las entregas          | Solo entregas del usuario autenticado         |
| GET `/api/v1/deliveries/:id`           | Cualquier entrega existente | Solo entrega propia; ajena o inexistente: 404 |
| POST `/api/v1/deliveries`              | Asignar: 201 con `Location` | 403                                           |
| POST `/api/v1/deliveries/:id/start`    | 403                         | Iniciar entrega propia; ajena: 403            |
| POST `/api/v1/deliveries/:id/complete` | 403                         | Completar entrega propia; ajena: 403          |
| POST `/api/v1/deliveries/:id/cancel`   | Cancelar asignación         | 403                                           |

Un usuario REPARTIDOR sin fila asociada en `repartidor` recibe una página vacía en el listado y 404 en el detalle. Para las transiciones se conservan los permisos y las comprobaciones de propiedad anteriores.

## Lecturas autorizadas y paginación

El controlador utiliza exclusivamente `DeliveriesService.searchVisible()` y `findVisibleById()` para lecturas HTTP. El servicio obtiene el alcance a partir del `AuthenticatedUser` verificado por JWT, admite únicamente ADMIN o REPARTIDOR y selecciona campos mediante `DeliveryMapper`.

El repositorio aplica para REPARTIDOR el predicado parametrizado `repartidor.idUsuario = :scopeUserId`, mediante la relación entre entrega y repartidor. El identificador procede de `request.user.idUsuario`; no se acepta un identificador del cliente para establecer propiedad. Este predicado se combina con los demás filtros mediante `AND`, antes de ejecutar la paginación y `getManyAndCount()`. El total y el contenido corresponden al mismo alcance autorizado. En detalle se combina con `entrega.idEntrega = :idEntrega`.

Los métodos históricos `search()` y `findById()` mantienen sus firmas para consumidores internos. Ningún endpoint de Deliveries los utiliza para lecturas HTTP.

Se mantienen `PaginationQueryDto` y `PaginationResult`, `page` desde 0, `size` entre 1 y 100, y paginación en PostgreSQL. Los filtros combinables son `estado`, `idPedido`, `idRepartidor`, `fechaDesde` y `fechaHasta`. `idRepartidor` puede reducir el alcance, nunca ampliarlo. El ordenamiento admite únicamente `fechaAsignacion`, `fechaEntrega` o `idEntrega`, con ASC/DESC y desempate por `idEntrega` en la misma dirección. Por defecto se utiliza `fechaAsignacion DESC`.

## Contratos

La asignación recibe `AssignDeliveryDto`: `idPedido` e `idRepartidor`, enteros positivos hasta 2147483647. `ValidationPipe` rechaza campos adicionales y entradas inválidas. Los parámetros de ruta conservan `ParseIntPipe`.

Las respuestas seleccionan únicamente `idEntrega`, `idPedido`, `idRepartidor`, `estado`, `fechaAsignacion` y `fechaEntrega`. Las fechas se serializan como cadenas y `fechaEntrega` puede ser null. No se devuelven entidades ni relaciones completas. POST de asignación devuelve 201 y `Location: /api/v1/deliveries/:id`; las transiciones devuelven 200 con el DTO.

## Traducción de errores

`http/delivery-http-error.ts` adapta los errores únicamente en la capa HTTP, sin modificar las clases originales del dominio ni su comportamiento en invocaciones directas del servicio.

| Excepción                         | HTTP | Situación                                            |
| --------------------------------- | ---- | ---------------------------------------------------- |
| `InvalidAssignmentInputException` | 400  | Datos de asignación inválidos                        |
| `OrderNotFoundException`          | 404  | Pedido inexistente                                   |
| `CourierNotFoundException`        | 404  | Repartidor inexistente                               |
| `NeighborhoodNotFoundException`   | 404  | Barrio inexistente                                   |
| `DeliveryNotFoundException`       | 404  | Entrega inexistente o no visible en una lectura      |
| `InvalidOrderStateException`      | 409  | Pedido fuera de PREPARANDO                           |
| `InvalidDeliveryStateException`   | 409  | Transición incompatible con el estado actual         |
| `ActiveDeliveryExistsException`   | 409  | Pedido con una entrega activa                        |
| `CourierNotAvailableException`    | 409  | Repartidor no disponible                             |
| `InactiveNeighborhoodException`   | 422  | Barrio inactivo                                      |
| `InvalidDeliveryAddressException` | 422  | Dirección de entrega vacía                           |
| `DeliveryAccessDeniedException`   | 403  | Operación sin permiso, incluidas transiciones ajenas |
| Error inesperado                  | 500  | Error sin traducción conocida                        |

También se conservan 400 para validación de DTOs, consultas y parámetros, 401 para autenticación y 403 para roles prohibidos. El filtro global existente genera RFC 9457 Problem Details con `type`, `title`, `status`, `detail`, `instance` y, cuando corresponde, `errors`. Los errores desconocidos se propagan; el filtro devuelve el mensaje seguro `No fue posible completar la solicitud.` sin SQL, trazas ni objetos internos. No se convierten errores desconocidos automáticamente a 409 o 422.

## Pruebas y rollback

Las pruebas unitarias comprueban todas las traducciones, la conservación de las excepciones de dominio, la propagación de errores desconocidos, el alcance SQL, los parámetros separados para propietario y filtros, y la delegación del controlador a lecturas autorizadas con DTOs.

`test/integration/http/deliveries.integration-spec.ts` utiliza Nest real, Supertest, login real y PostgreSQL 16 temporal con Testcontainers y las migraciones reales. No sustituye ni desactiva guards. Cubre la matriz de permisos, JWT ausente/inválido, aislamiento bidireccional entre repartidores, usuario sin registro, filtros combinados, conteo, paginación, ASC/DESC, desempate, DTOs, 201 y Location, validaciones 400, recursos inexistentes 404, conflictos 409, reglas 422, persistencia y 403 en transiciones ajenas.

Para el 500 y rollback se instala un trigger temporal en la base de pruebas: al intentar actualizar el pedido a ENTREGADO, comprueba que la entrega ya fue escrita como ENTREGADA con fecha de entrega y provoca un fallo. Una secuencia temporal registra que ese paso se alcanzó; `nextval` no se revierte con la transacción. Tras la respuesta 500 se comprueba que la entrega vuelve a EN_CAMINO sin fecha, el pedido sigue EN_CAMINO y el repartidor sigue OCUPADO. El trigger, la función y la secuencia se eliminan después de cada caso. No se modifica ninguna migración ni se desactivan restricciones.

El caso `NeighborhoodNotFoundException` se verifica en la prueba unitaria del adaptador: la FK real impide crear un pedido con barrio inexistente. No se fabrican estados inválidos ni se eliminan FK para forzar ese escenario HTTP. Las pruebas existentes de concurrencia y rollback del dominio permanecen como regresiones adicionales.

La infraestructura no carga `.env`, no conecta a bases externas y cierra Nest, DataSource y contenedor al finalizar. Se utiliza una clave JWT temporal exclusiva de la suite y se restaura la variable anterior.

## Verificación local

Resultados de este bloque, sin cambiar la configuración de cobertura ni sus umbrales:

| Comprobación         | Comando en `apps/backend`                                                                           | Resultado                                  |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Formato              | Prettier `--check` sobre los archivos del bloque                                                    | Aprobado                                   |
| ESLint completo      | `eslint "{src,apps,libs,test}/**/*.ts"`                                                             | Aprobado                                   |
| TypeScript           | `tsc --noEmit --incremental false`                                                                  | Aprobado                                   |
| Compilación          | `npm run build`                                                                                     | Aprobado                                   |
| Unitarias completas  | `npm test -- --runInBand`                                                                           | 283/283, 28 suites                         |
| Cobertura existente  | `npm run test:cov -- --runInBand`                                                                   | 283/283; todos los umbrales globales >=70% |
| Integración completa | `npm run test:integration`                                                                          | 412/412, 16 suites, 40,295 s               |
| Seguridad HTTP       | `npm run test:integration -- --testPathPatterns=test/integration/http/security.integration-spec.ts` | 5/5                                        |
| E2E HTTP             | `npm run test:e2e`                                                                                  | 397/397, 9 suites, 31,126 s                |

Se agregaron 22 casos unitarios y 57 casos HTTP de Deliveries; los casos previos se conservaron. La suite HTTP nueva también aprobó aislada: 57/57, en 5,322 s. Las suites con Docker se ejecutaron en secuencia.

La cobertura global del comando existente corresponde a los archivos incluidos de Orders y Deliveries: statements **96,95%**, branches **84,87%**, functions **90,81%** y lines **97,17%**. No representa cobertura de toda la aplicación. Para `deliveries.service.ts`: statements 95,80%, branches 89,55%, functions 88,23% y lines 95,62%; el adaptador HTTP alcanzó 100% en las cuatro métricas.

## Fuera del alcance

Este bloque no incorpora Swagger/OpenAPI, nuevas transiciones, cambios de estados, paginación nueva, modificaciones de Auth/JWT, entidades, esquema, migraciones, dependencias ni contratos de otros recursos. La ejecución remota de CI queda para la publicación posterior.
