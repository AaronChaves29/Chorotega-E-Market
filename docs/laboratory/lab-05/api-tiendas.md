# API REST de tiendas

## Alcance y arquitectura

Base: `develop` en `a8b24f8b0937d85cf3388d6d8df375535e3bbec1`, con la base HTTP,
Categories REST, Products REST, paginación común, Testcontainers y seguridad JWT
integrados. Rama: `feat/stores-rest-api`.

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
stack ni detalles internos. No se inventan conflictos UNIQUE ni reglas 422.

La relación con User se valida antes de crear o cambiar `idEmprendedor`.
Si el usuario desaparece después de validar, SQLSTATE `23503` con
`fk_tienda_emprendedor` se traduce también a 404. No se impone un rol de usuario
adicional: no existe esa política para Stores en el código integrado.

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

## Compatibilidad con seguridad

La seguridad integrada usa `AuthModule`, login en `POST /api/v1/auth/login`
(actualmente responde 201), bcrypt y JWT con `sub` (correo), `idUsuario`, `rol`
y las marcas temporales del token. Roles reales: ADMIN, CLIENTE, EMPRENDEDOR y
REPARTIDOR. La propiedad de User se llama `claveHash`, columna `clave_hash` nullable,
añadida por `AddPasswordHashToUser1791352458237`.

`JwtAuthGuard` valida Bearer, asigna `request.user` y produce 401 cuando falta el
token o no es válido. `RolesGuard` produce 403 si el rol no está permitido.
Son guards locales en Deliveries, sin guard global:

- POST deliveries y cancel: ADMIN.
- POST start/complete: REPARTIDOR, además se busca el repartidor por
  `request.user.idUsuario` y se compara con el asignado a la entrega.
- GET deliveries y detalle: ADMIN o REPARTIDOR.

Categories y Products son públicos. Stores también queda público: no se encontró
una política de autorización u ownership definida para este recurso. Su propietario
se recibe como `idEmprendedor`, no se deriva del JWT. No se copian las reglas de
Deliveries ni se agregan guards para fabricar respuestas 401/403. Login, JWT,
roles, User, migraciones y ownership de Deliveries no se modifican.

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
como regresión sin modificaciones.

Resultados locales del 7 de octubre de 2026:

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

## Fuera de alcance y hallazgos

No se define autorización propia de tiendas. Tampoco se modifica seguridad,
Swagger, frontend, MongoDB, dependencias, esquema, migraciones ni infraestructura
compartida. La cobertura existente mide Orders y Deliveries; no representa una
medición de cobertura de Stores y no se alteran sus umbrales o exclusiones.

Neighborhoods y Couriers todavía declaran `api/v1` en sus controladores, además del
prefijo global. Es un hallazgo separado; Deliveries ya usa `@Controller('deliveries')`
en este develop. No se corrigen esas rutas en este bloque.
