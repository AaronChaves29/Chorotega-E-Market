# API REST de tiendas

## Alcance y arquitectura

Base original del bloque REST: `develop` en `a8b24f8b0937d85cf3388d6d8df375535e3bbec1`, con la base HTTP,
Categories REST, Products REST, paginación común, Testcontainers y seguridad JWT
integrados. Rama original: `feat/stores-rest-api`. La política actual se implementa en `fix/lab05-catalog-write-security`.

Flujo: HTTP → `StoresController` → `StoresService` → `StoresRepository` → PostgreSQL.
Antes existían la entidad, el módulo y el repositorio base, sin API de tiendas.
El módulo ahora importa `UsersModule` para comprobar relaciones mediante
`UsersRepository`; mantiene exportado `StoresRepository` y sus firmas previas.
Products y la transacción de Orders siguen usando `findById` sin cambios.

## Modelo y contratos

| Campo         | Tipo y restricción                               | Entrada                  |
| ------------- | ------------------------------------------------ | ------------------------ |
| idTienda      | INTEGER, PK `tienda_pkey`, generado              | Solo salida              |
| idEmprendedor | INTEGER obligatorio, FK a `usuario.id_usuario`   | Obligatorio en POST      |
| nombre        | VARCHAR(150), no vacío ni solo espacios          | Obligatorio en POST      |
| direccion     | VARCHAR(255), no vacía ni solo espacios          | Obligatorio en POST      |
| descripcion   | VARCHAR(500), nullable                           | Opcional; admite null    |
| telefono      | VARCHAR(20), nullable                            | Opcional; admite null    |
| horario       | VARCHAR(150), nullable                           | Opcional; admite null    |
| estado        | `ACTIVA` o `INACTIVA`, CHECK `chk_tienda_estado` | Opcional; default ACTIVA |
| fechaCreacion | TIMESTAMP con default de base de datos           | Solo salida              |

Los IDs de entrada deben ser enteros positivos de 32 bits. No hay UNIQUE de nombre
ni de propietario: un usuario puede tener varias tiendas y los nombres repetidos
son válidos. Se conserva `idx_tienda_emprendedor`.

`CreateStoreDto` valida la creación; `UpdateStoreDto` permite PATCH parcial real:
solo se actualizan campos enviados. Omitir un campo lo conserva; null solo se
admite en descripción, teléfono y horario. PATCH vacío devuelve la tienda actual.
La actualización usa UPDATE, sin reinsertar una tienda eliminada concurrentemente.

`StoreMapper` construye explícitamente `StoreResponseDto` con los nueve campos de
la tabla. De User solo se publica el identificador de la relación `idEmprendedor`.
No se devuelven `emprendedor`, `productos`, `pedidos`, correo, hash ni entidades.
La fecha se serializa como cadena ISO mediante HTTP.

## Endpoints y errores

`@Controller('stores')` utiliza el prefijo global para producir `/api/v1/stores`.

| Método y ruta             | Resultado                                            |
| ------------------------- | ---------------------------------------------------- |
| GET /api/v1/stores        | 200, `PaginationResult<StoreResponseDto>`            |
| GET /api/v1/stores/:id    | 200 DTO; 404 si falta                                |
| POST /api/v1/stores       | 201 DTO y `Location: /api/v1/stores/{idTienda}`      |
| PATCH /api/v1/stores/:id  | 200 DTO actualizado; 404 si falta                    |
| DELETE /api/v1/stores/:id | 204 sin body; 404 si falta; 409 si tiene referencias |

Se reutiliza Problem Details global: 400 por DTO, ID o query inválidos; 404 por
usuario requerido inexistente; 409 únicamente por FK de eliminación conocidas.
Errores inesperados se propagan al filtro global, que devuelve 500 seguro sin SQL,
stack ni detalles internos. No se inventan conflictos UNIQUE. La nueva elegibilidad del propietario para POST de ADMIN produce 422 si el usuario no es EMPRENDEDOR ACTIVO.

La relación con User se valida antes de crear. Para ADMIN, el propietario debe existir (404) y tener rol EMPRENDEDOR y estado ACTIVO (422); son los valores reales de `User`. Para EMPRENDEDOR, `idEmprendedor` debe coincidir con `request.user.idUsuario` (403 si no coincide). El identificador sigue siendo obligatorio. Si desaparece la relación antes de guardar, `23503` con `fk_tienda_emprendedor` conserva 404.

PATCH nunca transfiere la tienda, tampoco para ADMIN. Omitir `idEmprendedor` o repetir el actual está permitido; un valor diferente produce 403 antes de escribir cualquier campo. Esto evita alterar indirectamente la visibilidad de pedidos históricos.

DELETE es físico y conserva las restricciones `NO ACTION` existentes:
SQLSTATE `23503` con `fk_producto_tienda` o `fk_pedido_tienda` produce 409.
No borra productos ni pedidos. Las pruebas provocan ambos conflictos en PostgreSQL
y comprueban que permanecen la tienda y la fila relacionada. Otras restricciones
no se clasifican automáticamente como conflictos.

## Paginación, filtros y orden

Se reutilizan sin cambios `PaginationQueryDto` y `PaginationResult`:

```json
{ "content": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

Página desde cero; tamaño predeterminado 20 y límites de 1 a 100. QueryBuilder
aplica `skip/take` y `getManyAndCount` en PostgreSQL, sin paginación en memoria.

`StoreSearchQueryDto` permite combinar:

- `nombre`: coincidencia parcial ILIKE; `%`, `_` y `\` se escapan para tratarlos
  como caracteres literales, no comodines aportados por el cliente.
- `estado`: ACTIVA/INACTIVA.
- `idEmprendedor`: identificador real del usuario relacionado.

Todos los valores se pasan como parámetros. `sortBy` admite exclusivamente
`idTienda`, `nombre` y `estado`, mediante un mapa explícito de columnas;
`sortDirection` admite ASC/DESC. El default es `idTienda ASC`; los demás órdenes
se desempatan por ID en la misma dirección. No se añade Specification artificial.

## Seguridad de escrituras y propiedad

Nueva política aplicada a POST, PATCH y DELETE mediante `JwtAuthGuard`, `RolesGuard` y `@Roles('ADMIN', 'EMPRENDEDOR')` en cada método. `StoresModule` importa `AuthModule`; no se modifican Auth, JWT ni los guards. Todos los GET siguen públicos.

| Actor                            | Crear                             | Modificar/eliminar                           |
| -------------------------------- | --------------------------------- | -------------------------------------------- |
| ADMIN                            | Para EMPRENDEDOR ACTIVO existente | Cualquier tienda, sin transferir propietario |
| EMPRENDEDOR                      | Solo a su nombre                  | Solo sus tiendas, sin transferir propietario |
| CLIENTE / REPARTIDOR             | 403                               | 403                                          |
| JWT ausente, inválido o expirado | 401                               | 401                                          |

Los servicios reciben contexto autenticado obligatorio y verifican rol y propiedad incluso en invocaciones directas. Una tienda ajena devuelve 404. UPDATE y DELETE incluyen el propietario en el predicado SQL para EMPRENDEDOR; los métodos previos del repositorio se conservan para consumidores internos. Se preservan DTOs, PATCH parcial, respuestas 201/Location y 204 vacío, filtros, paginación y conflictos FK conocidos.

## Verificación

Las nuevas pruebas unitarias cubren mapeo explícito, creación, relación inexistente,
PATCH parcial, eliminación concurrente, constraints reconocidas, propagación de
errores inesperados y Location. Las pruebas HTTP usan Nest real, `configureHttp`,
Supertest y PostgreSQL 16 con las migraciones reales mediante el helper compartido.
No usan mocks funcionales, seeds globales ni una base externa. Las fixtures se
limpian entre casos y la aplicación, DataSource y contenedor se cierran al finalizar.

Se comprueban CRUD, DTOs, privacidad, validación, relaciones, nombres repetidos,
FK reales de productos y pedidos, paginación, filtros combinados, orden y entradas
inválidas. Las suites existentes de productos, pedidos y seguridad se ejecutan
como regresión. Las escrituras de las pruebas de catálogo ahora utilizan login y JWT reales, sin sustituir guards.

Resultados históricos del bloque REST original (7 de octubre de 2026; anteriores a esta política):

| Comprobación                                 | Resultado                              |
| -------------------------------------------- | -------------------------------------- |
| Prettier de los archivos del bloque          | Aprobado                               |
| ESLint completo, sin autofix global          | Aprobado                               |
| TypeScript `--noEmit --incremental false`    | Aprobado                               |
| `npm run build`                              | Aprobado                               |
| `npm test -- --runInBand`                    | 215 pruebas, 22 suites; 1,753 s        |
| Unitarias nuevas de Stores                   | 25 (24 de servicio y 1 de controlador) |
| `npm run test:cov -- --runInBand`            | 215 pruebas aprobadas; 1,899 s         |
| `npm run test:integration`                   | 200 pruebas, 12 suites; 23,393 s       |
| HTTP nuevas de Stores, ejecución focalizada  | 63 pruebas; 4,465 s                    |
| Suite HTTP de seguridad, ejecución explícita | 5 pruebas; 2,513 s                     |
| `npm run test:e2e`                           | 185 pruebas, 5 suites; 12,160 s        |
| `git diff --check`                           | Sin errores                            |
| `docker ps` después de las pruebas           | Sin contenedores activos               |

La cobertura configurada de Orders y Deliveries es: statements **95,85%**,
branches **87,22%**, functions **87,50%**, lines **96,20%**. Todos los indicadores
superan el umbral existente de 70%, sin modificar la configuración.

Las cinco pruebas HTTP de seguridad existentes verifican login válido, login
incorrecto (401), ausencia de token (401), JWT aceptado por el guard con rol
incorrecto (403) y rechazo de una entrega ajena (403, sin cambiar su estado).
Las cuatro pruebas unitarias de Auth también pasan dentro de las 215 unitarias.
Los totales de integración y e2e se solapan: no deben sumarse como casos distintos.

Fue necesario instalar las dependencias ya declaradas mediante `npm ci` y arrancar
Docker. No se cambiaron manifiestos ni lockfiles. La compilación y las pruebas
se ejecutaron después de completar esa preparación.

## Verificación de la nueva política

`catalog-write-security.integration-spec.ts` usa Nest, JWT emitidos mediante login real, PostgreSQL temporal y migraciones reales. Comprueba nueve escrituras, permisos, 401 para tokens ausentes/ inválidos/expirados, recursos ajenos 404, GET públicos, elegibilidad del propietario, transferencias rechazadas sin cambios parciales y visibilidad de Orders antes y después del rechazo. Las pruebas directas del servicio comprueban autorización sin depender de guards. Resultados actuales: 303 unitarias, 545 integraciones, 530 e2e, 88 regresiones HTTP de catálogo, 45 OpenAPI y 5 de seguridad HTTP, todas aprobadas. Los totales se solapan; no se suman. [Detalle de verificación](swagger-openapi.md#verificación-de-seguridad-del-catálogo).

## Fuera de alcance

No se modifican Auth, estados, entidades, migraciones, dependencias ni la lógica de pedidos. No se implementa un proceso de transferencia de tiendas. La cobertura existente mide Orders/Deliveries, no el catálogo; se conservan sus umbrales y exclusiones. Las rutas corregidas de Neighborhoods/Couriers y la seguridad de Deliveries ya están integradas y permanecen intactas.
