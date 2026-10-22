# API REST de pedidos y detalles

## Base y alcance

Base: `develop` en `60df859de13aa69873a6fba06185a9523a406e3a`, con Usuarios REST
integrado. Rama: `feat/orders-rest-api`.

Se publican la compra transaccional existente y lecturas autorizadas de pedidos y
sus detalles. No se implementan PATCH/DELETE genéricos de pedidos, escrituras
individuales de detalles, cancelación ni otras transiciones HTTP.

| Método y ruta                            | Permisos                    | Respuesta                        |
| ---------------------------------------- | --------------------------- | -------------------------------- |
| GET /api/v1/orders                       | ADMIN, CLIENTE, EMPRENDEDOR | 200, página de OrderResponseDto  |
| GET /api/v1/orders/:id                   | ADMIN, CLIENTE, EMPRENDEDOR | 200, OrderResponseDto            |
| POST /api/v1/orders                      | Solo CLIENTE                | 201, OrderResponseDto y Location |
| GET /api/v1/orders/:id/details           | ADMIN, CLIENTE, EMPRENDEDOR | 200, OrderItemResponseDto[]      |
| GET /api/v1/orders/:id/details/:detailId | ADMIN, CLIENTE, EMPRENDEDOR | 200, OrderItemResponseDto        |

`@Controller('orders')` utiliza el prefijo global `/api/v1`. Los cinco endpoints
usan `JwtAuthGuard`, `RolesGuard` y los decoradores `@Roles` existentes.
REPARTIDOR recibe 403 en todos. ADMIN y EMPRENDEDOR también reciben 403 en POST.

## Arquitectura y compatibilidad

`OrdersHttpModule` importa `OrdersModule` y `AuthModule`, registra el controller
y `OrdersReadService`, y se incorpora en `AppModule`. No hay dependencia inversa
desde Auth ni desde el módulo transaccional hacia la capa HTTP.

POST delega directamente en `OrdersService.createAndConfirm(request.user.idUsuario,
input)`. `sub` es el correo y nunca se interpreta como identificador numérico.
La restricción de compra exclusiva para CLIENTE pertenece **solo al controlador
HTTP**: el servicio de dominio conserva su contrato original, que permite a un
comprador existente y activo sin exigir ese rol. Sus pruebas existentes no cambian.

Las lecturas siguen controller → OrdersReadService → OrdersRepository → PostgreSQL.
Se añaden `searchVisible` y `findVisibleWithDetails`; se mantienen intactos
`OrdersRepository.search`, `findAllWithDetails`, las operaciones heredadas y sus
consumidores. OrderDetailsRepository y su módulo tampoco cambian.

No se modifican Auth, JWT, Users, Stores, Products, Deliveries, entidades,
migraciones, dependencias ni infraestructura compartida de pruebas.

## Autorización en SQL

Los filtros se intersectan con un alcance obligatorio derivado del JWT:

- ADMIN: sin restricción de propietario.
- CLIENTE: `pedido.idCliente = :scopeUserId`.
- EMPRENDEDOR: INNER JOIN a la tienda y
  `tienda.idEmprendedor = :scopeUserId`, con su propietario actual.

Estos predicados se aplican en SQL antes de devolver resultados. Los parámetros
opcionales usan nombres distintos, por ejemplo `filter_idCliente`, y no pueden
sobrescribir `scopeUserId`. Filtrar un cliente o tienda fuera del alcance devuelve
una página vacía; no concede acceso.

El pedido individual combina ID y alcance en la misma consulta. El detalle
individual combina además `detalle.idDetalle = :detailId` con
`pedido.idPedido = :orderId`, mediante la relación pedido-detalles. Un detalle de
otro pedido no es visible aunque ambos pedidos sean accesibles para ADMIN.

Recursos inexistentes o ajenos producen 404 sin revelar su existencia. Un rol
prohibido produce 403; JWT ausente o inválido produce 401.

## DTOs y datos públicos

Se reutilizan sin cambios `CreateOrderDto`, `OrderResponseDto`,
`OrderItemResponseDto` y `OrderMapper`.

Entrada de compra:

```http
POST /api/v1/orders
Authorization: Bearer <token de CLIENTE>
Content-Type: application/json
```

```json
{
  "idBarrio": 1,
  "direccionEntrega": "Nicoya",
  "items": [{ "idProducto": 1, "cantidad": 2 }]
}
```

No se aceptan `idCliente`, precios, subtotal, tarifa, total, estado ni propiedades
adicionales, tampoco dentro de `items`. La ValidationPipe global devuelve 400.
Los IDs y cantidades conservan los límites definidos en el DTO del dominio.

Ejemplo de respuesta (los valores e IDs dependen de los datos reales):

```http
HTTP/1.1 201 Created
Location: /api/v1/orders/1
```

```json
{
  "idPedido": 1,
  "idCliente": 2,
  "idTienda": 1,
  "idBarrio": 1,
  "estado": "CONFIRMADO",
  "fechaCreacion": "2026-01-01T10:00:00.000Z",
  "direccionEntrega": "Nicoya",
  "subtotal": "0.20",
  "tarifaEnvio": "1.25",
  "total": "1.45",
  "items": [
    {
      "idDetalle": 1,
      "idProducto": 1,
      "cantidad": 2,
      "precioUnitario": "0.10",
      "subtotal": "0.20"
    }
  ]
}
```

Listado y detalle usan el mismo mapper. No devuelven entidades completas,
relaciones internas, authId, hashes ni datos adicionales del comprador, tienda o
producto. Los detalles se ordenan por idDetalle; ordenar las líneas para la
respuesta no implica paginar pedidos en memoria.

## Compra y conservación de integridad

Se mantienen sin cambios `createAndConfirm`, `OrderTransaction`, los bloqueos y
el orden de persistencia:

1. Validar DTO y productos duplicados.
2. Validar comprador y barrio dentro de la transacción.
3. Bloquear productos por ID ascendente mediante FOR UPDATE.
4. Validar productos, tiendas, pertenencia a una sola tienda y existencias.
5. Calcular con centavos `bigint`, precios y tarifa del servidor.
6. Guardar pedido PENDIENTE y detalles, descontar inventario y confirmar.
7. Devolver el DTO cuando termina correctamente la transacción.

Los importes mantienen strings compatibles con numeric(10,2), sin operaciones
monetarias de punto flotante. Los detalles conservan precios históricos.
Las FK `fk_detalle_pedido`, `fk_detalle_producto`, UNIQUE
`uq_detalle_pedido_producto` y CHECK de cantidad, precio y subtotal siguen intactos.

## Consultas, filtros y paginación

`OrderSearchQueryDto` extiende `PaginationQueryDto`; se reutiliza
`PaginationResult<OrderResponseDto>`. Página desde cero, tamaño por defecto 20,
rango de tamaño de 1 a 100. Los metadatos cuentan únicamente pedidos visibles.

Filtros combinables y parametrizados: `estado`, `idCliente`, `idTienda`, `idBarrio`,
`fechaDesde` y `fechaHasta`. Los estados son los seis existentes del modelo.
Las fechas son ISO 8601 representables como instantes; los límites son inclusivos
(`>=` y `<=`). Se rechaza un rango invertido. Una fecha sin hora representa su
inicio a las 00:00 UTC, no el final del día; para un intervalo explícito se
recomiendan timestamps con zona horaria.

`sortBy` permite solo `idPedido`, `fechaCreacion`, `estado` y `total`;
`sortDirection` acepta ASC/DESC. Default: fechaCreacion DESC, idPedido DESC.
Los órdenes alternativos se desempatan por idPedido en la misma dirección.
Los nombres de columna proceden de un mapa fijo, nunca del SQL enviado por el cliente.

QueryBuilder aplica `skip/take/getManyAndCount` con JOIN a detalles. TypeORM pagina
por identificadores de pedido en PostgreSQL y recupera sus líneas completas,
sin paginación de arrays ni una consulta por pedido. Las pruebas comprueban que
el JOIN no duplica los totales ni recorta líneas y observan las consultas para
páginas de distintos tamaños. No se cargan relaciones de usuario o producto; el
JOIN a tienda solo se necesita para delimitar el acceso de EMPRENDEDOR.

## Traducción de errores

`rethrowOrderHttpError` adapta únicamente las excepciones conocidas de la compra
a HttpException. El filtro global existente serializa Problem Details.
No se modifican las excepciones del dominio ni se replica el proceso de compra.

| Excepción o situación                                                                            | HTTP       |
| ------------------------------------------------------------------------------------------------ | ---------- |
| DTO, parámetro, query o InvalidOrderInputException                                               | 400        |
| JWT ausente/inválido; identidad inválida detectada al leer                                       | 401        |
| Rol no autorizado                                                                                | 403        |
| Pedido/detalle ausente o no visible                                                              | 404        |
| OrderProductNotFoundException                                                                    | 404        |
| InsufficientOrderStockException, InvalidOrderTransitionException                                 | 409        |
| DuplicateOrderProductException, MixedOrderStoresException                                        | 422        |
| BuyerUnavailableException, OrderNeighborhoodUnavailableException, OrderStoreUnavailableException | 422        |
| OrderProductInactiveException, InvalidOrderAmountException                                       | 422        |
| Error inesperado o SQL no clasificado                                                            | 500 seguro |

Las excepciones de disponibilidad existentes agrupan ausencia e inactividad de
comprador, barrio o tienda. Se mantiene su significado de recurso no habilitado
para comprar (422), sin repetir consultas para inferir una causa distinta. La
excepción específica de producto inexistente sí permite una traducción a 404.
Los errores de persistencia no se convierten genéricamente a 409 y no exponen SQL,
stack ni mensajes internos. El rechazo de una compra hace rollback mediante la
transacción original.

## Pruebas

Las unitarias nuevas comprueban contexto confiable, Location, delegación,
traducciones, selección de campos, alcance, IDs y fechas. La prueba unitaria del
controller aísla la importación de JwtService con la convención existente del
repositorio; no es una prueba de autenticación.

Las HTTP usan Nest, Supertest, PostgreSQL 16 y migraciones reales mediante el
helper compartido. Obtienen tokens con login real, sin guards desactivados ni
mocks funcionales. Cubren permisos de los cinco endpoints, compras, aislamiento
por comprador y tienda, pertenencia de detalles, DTOs, dinero, inventario,
rollback ante fallo SQL, paginación, filtros y orden. La observación del logger
SQL no cambia el resultado de las consultas.

Las tres integraciones transaccionales existentes siguen cubriendo precios
históricos, rollback después de escrituras reales y concurrencia sin sobreventa;
se reutilizan sin modificarlas. Las nuevas HTTP verifican también la respuesta
500 segura y ausencia de escrituras parciales en la frontera HTTP.

Resultados locales del bloque:

| Comprobación                                    | Resultado                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Prettier de archivos del bloque                 | Sin diferencias de formato                                        |
| ESLint completo                                 | Sin errores                                                       |
| TypeScript `--noEmit --incremental false`       | Sin errores                                                       |
| `npm run build`                                 | Correcto                                                          |
| `npm test -- --runInBand`                       | 261 pruebas, 26 suites aprobadas                                  |
| `npm run test:cov -- --runInBand`               | 261 pruebas, 26 suites aprobadas; umbrales existentes satisfechos |
| `npm run test:integration`                      | 343 pruebas, 14 suites aprobadas; 34,063 s                        |
| Seguridad HTTP (`security.integration-spec.ts`) | 5 pruebas aprobadas                                               |
| `npm run test:e2e`                              | 328 pruebas, 7 suites aprobadas; 22,296 s                         |

Se agregaron 32 pruebas unitarias y 69 HTTP. Los totales de integración, seguridad
y e2e se solapan: no representan pruebas distintas que deban sumarse. La suite
completa mantiene las regresiones de Auth, Usuarios, Tiendas, Productos, Entregas
y del proceso transaccional de pedidos.

Cobertura global del conjunto configurado actualmente para Orders y Deliveries:
statements **96,74%**, branches **84,58%**, functions **90,32%** y lines **96,97%**.
No se cambiaron exclusiones ni umbrales. Estos porcentajes no representan la
cobertura de todo el backend ni garantizan ese porcentaje para cada archivo.

Observación de la revisión final: una ejecución de integración recibió 401 en
Products para `disponible=yes`, donde se esperaba 400. No volvió a reproducirse:
el caso específico devolvió 400 en cinco ejecuciones, Products aprobó las
repeticiones completas y dos ejecuciones posteriores de integración aprobaron
343/343 pruebas cada una. La causa sigue sin demostrarse; no se atribuye a Orders
ni se considera corregida. La instrumentación temporal fue retirada y no se
modificaron Products, Auth ni el filtro global como resultado de la investigación.

## Límites y pendientes

No se publica cancelación, cambio genérico de estado ni edición independiente de
líneas. Esas operaciones requieren casos de negocio específicos. No se añade
Swagger ni se modifica frontend o MongoDB.

Se conserva el modelo de JWT actual: roles en el token y ausencia de revocación
inmediata. La compra sí comprueba comprador activo dentro de la transacción;
no se añaden políticas nuevas de desactivación a las lecturas ni se modifica Auth.
