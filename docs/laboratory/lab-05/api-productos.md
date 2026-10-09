# API REST de productos

## Nueva política de seguridad de escrituras

POST, PATCH y DELETE requieren JWT y ADMIN o EMPRENDEDOR. ADMIN administra cualquier producto; EMPRENDEDOR solo los de sus tiendas. Se comprueban tienda de origen y destino al trasladar un producto. CLIENTE y REPARTIDOR reciben 403; productos o tiendas ajenos reciben 404. Los GET permanecen públicos. Guards por método y contexto obligatorio en servicio; no se cambia Auth. UPDATE/DELETE usan predicados SQL de propiedad y de destino, y la creación revalida la tienda bajo bloqueo en una transacción. Los métodos previos del repositorio usados por Orders se conservan.

JWT ausente, inválido o expirado: 401. Los errores reutilizan RFC 9457 Problem Details; inesperados: 500 seguro. Se conserva la validación, los DTOs, la paginación y el contrato de precio string.

La suite catalog-write-security.integration-spec.ts verifica permisos y propiedad con login real, PostgreSQL temporal y migraciones, sin desactivar guards. Las suites HTTP anteriores conservan sus contratos funcionales con JWT autorizado para escribir. Los resultados antiguos de este documento corresponden al bloque REST inicial, antes de esta nueva política.

## Base y reutilización

Base original del bloque REST: `develop` en `3dd7733ea1be2a96bee4d9069f6810892a319e55`, con Categorías
integrada por el PR #60. Se conservan ProductsController, ProductsService,
ProductsRepository, las entidades, migraciones y las consultas de Labs 3/4.

Se reutilizan `configureHttp()`, Problem Details, `PaginationQueryDto`,
`PaginationResult` y `createHttpTestApp()` sin modificar su implementación.
ProductsModule importa StoresModule y CategoriesModule para inyectar sus
repositorios ya existentes; no se duplican proveedores ni repositorios.

`HTTP → ProductsController → ProductsService → ProductsRepository → PostgreSQL`.
El servicio también consulta StoresRepository y CategoriesRepository para validar
relaciones. No hay consultas TypeORM en el controlador.

## Endpoints y compatibilidad

| Método | Ruta                   | Resultado                                                         |
| ------ | ---------------------- | ----------------------------------------------------------------- |
| GET    | `/api/v1/products`     | 200, página de DTOs                                               |
| GET    | `/api/v1/products/:id` | 200, DTO; 404 si no existe                                        |
| POST   | `/api/v1/products`     | 201, DTO y `Location: /api/v1/products/{idProducto}`              |
| PATCH  | `/api/v1/products/:id` | 200, DTO; 404 si no existe                                        |
| DELETE | `/api/v1/products/:id` | 204 sin cuerpo; 404 si no existe; 409 si tiene detalles de pedido |

El GET de colección cambia deliberadamente su cuerpo de array a `PaginationResult`
para cumplir el contrato compartido del Lab 5. Los clientes deben leer `content`.
Las pruebas HTTP de base se adaptan al sobre paginado y al método `search` usado
por el controlador, conservando las verificaciones de prefijo, validación y errores.
No se modifica el helper HTTP ni el filtro global.

La revisión de consumidores previa al commit buscó rutas de productos y llamadas
HTTP en backend, frontend, pruebas, documentación, scripts y ejemplos del
repositorio. La única expectativa HTTP anterior de array era
`http-foundation.integration-spec.ts`. El frontend contiene una página estática,
sin llamadas al catálogo. Las pruebas de servicio/repositorio consumen listas
internas que se conservan; las menciones documentales restantes describen rutas
o Problem Details, sin asumir un array de respuesta. No se encontró un consumidor
real incompatible que requiriera modificar otro módulo.

Los métodos internos `findAll`, `findAvailableByStore`, `findActiveByCategory` y
`findByIdsForUpdate` permanecen disponibles y conservan su comportamiento. Las
consultas fijas mantienen parámetros, orden por ID y, cuando corresponde,
bloqueo transaccional. Ningún endpoint devuelve directamente la entidad.

## DTOs, tipos y validación

Se conserva la carpeta `dto/` existente de Productos.

- `CreateProductDto`: idTienda, idCategoria, nombre, precio y cantidadDisponible
  obligatorios; descripción y estado opcionales.
- `UpdateProductDto`: únicamente los mismos campos editables, todos opcionales.
  No acepta ID del producto, fecha de publicación, relaciones anidadas ni valores
  de pedidos. `descripcion: null` limpia el texto; null no se acepta para los demás
  campos. Un PATCH vacío devuelve el producto sin modificarlo.
- `ProductSearchQueryDto`: extiende PaginationQueryDto con filtros y orden.
- `ProductResponseDto`: idProducto, idTienda, idCategoria, nombre, descripcion,
  precio, cantidadDisponible, estado y fechaPublicacion. `ProductMapper` selecciona
  esos campos y excluye tienda, categoria y detallesPedido como objetos relacionados.

Precio conserva el contrato anterior: número JSON de entrada y string tanto en
la salida como en persistencia. Se validan mínimo 0,01, máximo 99999999,99 y hasta dos decimales,
según numeric(10,2), evitando redondeos silenciosos y desbordamientos. El servicio
conserva la conversión a string; PostgreSQL puede devolver ceros decimales finales
(por ejemplo `2.50`), mientras que la respuesta inmediata de creación puede
conservar `2.5`. No se convierte el precio de salida a número.

Los identificadores y las existencias se limitan al rango INTEGER de PostgreSQL;
las existencias permiten cero. Nombre conserva las validaciones anteriores y
su máximo de 150 caracteres; descripción admite hasta 500. Estado permite ACTIVO,
INACTIVO y AGOTADO, con ACTIVO por defecto en creación. Las propiedades adicionales
se rechazan mediante ValidationPipe compartido.

No existe restricción de nombre único para productos: nombres repetidos siguen
permitidos. No se añade una prohibición de crear productos sin stock ni una
transición automática a AGOTADO. Se verifica la existencia de tienda y categoría,
sin inventar una regla de estado activo para esas relaciones.

PATCH envía solo campos presentes a UPDATE, sin reemplazar existencias, precio ni
estado por valores predeterminados. No reinserta un producto inexistente. La lectura
posterior devuelve el DTO actualizado; no se agrega control optimista de versiones.

## Filtros y Specifications

| Parámetro   | Criterio                                              | Reutilización                 |
| ----------- | ----------------------------------------------------- | ----------------------------- |
| idTienda    | Igualdad                                              | ProductStoreSpecification     |
| idCategoria | Igualdad                                              | ProductCategorySpecification  |
| estado      | ACTIVO, INACTIVO o AGOTADO                            | ProductStateSpecification     |
| disponible  | true: stock mayor que cero; false: stock igual a cero | AvailableProductSpecification |

Todos son opcionales y combinables mediante AND. Los valores se envían como
parámetros SQL. `disponible` acepta exactamente `true`/`false`; no significa por
sí solo que el producto esté activo. Para productos activos con stock se combinan
`estado=ACTIVO&disponible=true`. Si no se envía disponibilidad, no limita el stock.

La condición de estado se centraliza en ProductStateSpecification;
ActiveProductSpecification mantiene su constructor sin argumentos y reutiliza
esa implementación para ACTIVO. AvailableProductSpecification conserva su
comportamiento predeterminado positivo y permite consultar cero existencias.
Las pruebas anteriores de SQL y consultas reales siguen verificando compatibilidad.

## Paginación y orden

Se conserva el contrato `{ content, page, size, totalElements, totalPages }`:
`page` desde 0, `size` entre 1 y 100, predeterminado 20. QueryBuilder combina
Specifications, orden, skip/take y getManyAndCount en PostgreSQL; no pagina ni
filtra en memoria. Los totales corresponden al conjunto filtrado completo.

`sortBy` permite idProducto, nombre, precio, cantidadDisponible y estado;
`sortDirection` acepta ASC/DESC. El valor predeterminado es idProducto ASC.
Los otros campos desempatan por ID en la misma dirección. El nombre público de
existencias es `cantidadDisponible`, igual que en el modelo. Un mapa interno
selecciona columnas permitidas; no se interpolan columnas arbitrarias del cliente.
El precio se ordena numéricamente en PostgreSQL aunque el DTO lo devuelva como string.

Ejemplo: `/api/v1/products?idTienda=1&idCategoria=2&estado=ACTIVO&disponible=true&page=0&size=10&sortBy=precio&sortDirection=ASC`.

## Errores e integridad referencial

- 400: DTO, identificador, paginación, filtro u orden inválidos.
- 401: JWT ausente, inválido o expirado al escribir.
- 403: rol sin permiso de escritura.
- 404: producto o tienda ajenos para EMPRENDEDOR; producto, tienda o categoría inexistente. La validación de relaciones ocurre
  antes de guardar; también se reconocen código 23503 y restricciones
  fk_producto_tienda/fk_producto_categoria al escribir para cubrir una eliminación
  concurrente después de validar.
- 409: exclusivamente código 23503 y fk_detalle_producto al eliminar.
- 500 seguro: errores inesperados, conservando el filtro global.

No se añade una excepción 422 artificial: este recurso no tiene una regla existente
que requiera esa traducción. No se convierten indiscriminadamente errores SQL a 409.

DELETE es físico cuando no hay referencias. La FK real de detalle_pedido impide
borrar productos usados por pedidos. Una prueba crea usuario, tienda, categoría,
producto, barrio, pedido y detalle en PostgreSQL temporal; verifica 409 y la
persistencia del producto y del detalle. No se modifican relaciones ni migraciones.

## Pruebas e aislamiento

Las nuevas pruebas de servicio verifican mapeo, relaciones, PATCH, desaparición
concurrente, conflictos conocidos y propagación de errores inesperados. Se prueba
Location en el controlador y las nuevas variantes de Specifications. Las unitarias
anteriores conservan las consultas fijas, defaults y conversión de precio.

Las pruebas HTTP funcionales no usan mocks: Nest real, Supertest y PostgreSQL 16
con migraciones reales mediante el helper existente. Fixtures deterministas,
sin seeds; limpieza de tablas de negocio entre casos conservando migraciones;
cierre de aplicación, DataSource y contenedor en afterAll. No se carga .env,
no se usa Supabase, base local, Docker Compose ni puertos fijos.

Se verifican creación/Location/DTO, validación y límites, relaciones inexistentes,
GET, PATCH parcial y cambios de relaciones, DELETE/404/409 real, paginación,
Specifications individuales y combinadas, disponibilidad independiente del estado,
orden numérico ASC/DESC con desempate y parámetros inválidos.

## Verificación local

El 6 de octubre de 2026:

- Prettier, ESLint, TypeScript sin emisión y build aprobados. Se corrigieron
  observaciones de formato en los archivos de pruebas afectados.
- Unitarias completas en la revisión final: 182 aprobadas en 19 suites; 18 casos
  adicionales frente a la base integrada de Categorías. Se conservaron los 61
  casos HTTP y se añadieron cuatro regresiones unitarias para pérdida de relaciones
  durante PATCH y propagación de otras FK durante INSERT/UPDATE. Estas últimas
  simulan fallos del repositorio; no se presentan como carreras reales en PostgreSQL.
- Cobertura existente: statements 95,72 %, branches 88,69 %, functions 87,14 %,
  lines 96,07 %. Umbrales y exclusiones sin cambios; mide pedidos/entregas,
  no la nueva API de Productos.
- Integración completa: 132 pruebas en 10 suites aprobadas, 21,723 segundos;
  71 existentes y 61 nuevas HTTP de Productos.
- `npm run test:e2e`: 117 pruebas HTTP en 3 suites aprobadas, 7,746 segundos.
  Son las 56 HTTP anteriores y las 61 de Productos, repetidas desde el mismo
  conjunto de integración; no son casos adicionales.
- `git diff --check`: sin errores. `docker ps`: sin contenedores activos al finalizar.

## Fuera de alcance

No se modifica Auth, la transacción de pedidos, las entidades, migraciones ni dependencias. La cobertura configurada sigue midiendo Orders/Deliveries. Las correcciones previas de rutas y Swagger están integradas; el contrato OpenAPI y api.http se actualizan únicamente para reflejar esta nueva seguridad de escritura.

La validación actual de seguridad está registrada en [Swagger/OpenAPI](swagger-openapi.md#verificación-de-seguridad-del-catálogo), incluyendo resultados, cobertura y límites técnicos.
