# Swagger/OpenAPI y colección HTTP

## Requisito y alcance

La guía oficial `EIF509 Laboratorio 5 - Guía Completa.pdf`, página 2, sección «Qué entregar», pide Swagger UI operativa y una colección Postman o `.http` en el repositorio. En la página 3, la rúbrica «OpenAPI y colección» exige que la colección ejercite todos los endpoints. La misma guía exige pruebas HTTP con Testcontainers para 201, 400, 401, 403, 404 y 422 como mínimo. La implementación utiliza el stack NestJS existente y su módulo oficial OpenAPI.

Se documentan las **35 combinaciones actuales de método y ruta**, sin agregar operaciones REST. Las rutas de documentación no se cuentan como operaciones de negocio. No existen POST ni DELETE de Users ni escrituras individuales de detalles de pedido.

Se instala únicamente `@nestjs/swagger` **11.4.7**, fijado sin rango. Sus peers admiten `@nestjs/core` y `@nestjs/common` `^11.0.1`; las versiones instaladas son 11.1.28. Se mantienen TypeORM 1.1.0, class-validator 0.15.1, class-transformer 0.5.1 y reflect-metadata 0.2.2. El lockfile no cambia versiones previamente instaladas. Swagger incluye `swagger-ui-dist`; no se necesita `swagger-ui-express` con el adaptador Express actual. Referencia: [introducción oficial de NestJS](https://docs.nestjs.com/openapi/introduction).

## Inicio y URLs

1. Sigue las instrucciones del README para instalar el backend, preparar una base PostgreSQL local y ejecutar sus migraciones reales. Las pruebas de este bloque crean sus propias bases temporales y no usan esa base ni sus seeds.
2. Configura las variables del backend para esa base local, con `DATABASE_SSL=false`, y una clave `JWT_SECRET` local privada. No guardes credenciales en Git. Para una base ya poblada, no vuelvas a cargar los seeds.
3. Desde `apps/backend`, ejecuta `npm run start:dev`.

Con el puerto predeterminado:

- Swagger UI: <http://localhost:3000/docs>.
- OpenAPI JSON: <http://localhost:3000/docs-json>.
- API REST: `http://localhost:3000/api/v1`.
- Health: `http://localhost:3000/api/database/health`.

Si usas otro `PORT`, cambia la URL. `configureOpenApi()` se ejecuta en `main.ts` después de `configureHttp()`. La especificación conserva los prefijos reales, incluida la exclusión de Health; la UI y el JSON se registran sin agregarles `/api/v1`. Se publica JSON OpenAPI 3.0.0; no se habilita una ruta YAML.

## Contrato documentado

| Recurso           | Operaciones | Entrada y respuesta                                                           |
| ----------------- | ----------: | ----------------------------------------------------------------------------- |
| Auth              |           1 | LoginDto → LoginResponseDto                                                   |
| Users             |           3 | Consulta paginada, detalle, UpdateUserDto → UserResponseDto                   |
| Stores            |           5 | Consulta, CreateStoreDto, UpdateStoreDto → StoreResponseDto                   |
| Categories        |           5 | Consulta, CreateCategoryDto, UpdateCategoryDto → CategoryResponseDto          |
| Products          |           5 | Consulta, CreateProductDto, UpdateProductDto → ProductResponseDto             |
| Orders y detalles |           5 | Consulta y CreateOrderDto con items → OrderResponseDto / OrderItemResponseDto |
| Deliveries        |           6 | Consulta y AssignDeliveryDto → DeliveryResponseDto                            |
| Neighborhoods     |           2 | Array / NeighborhoodResponseDto                                               |
| Couriers          |           2 | Array / CourierResponseDto                                                    |
| Health            |           1 | Estado de conexión con PostgreSQL                                             |
| Total             |          35 |                                                                               |

Los DTOs documentan requeridos, opcionales, enumeraciones, límites, valores predeterminados, patrones, tipos, fechas y campos nullable. Todos los PATCH conservan sus propiedades opcionales; en Users se admiten únicamente nombre, apellido y telefono. El precio de entrada de Products es numérico con dos decimales como máximo; precio, subtotal, tarifa y total de respuesta se serializan como string para conservar el contrato monetario. No se describen entidades TypeORM, relaciones completas, authId ni hashes de contraseña.

Los seis listados paginados explicitan `content`, `page`, `size`, `totalElements` y `totalPages`, con contenido referenciado al DTO correspondiente. `page` inicia en cero y `size` admite 1 a 100; ordenar y filtrar es opcional. Neighborhoods y Couriers devuelven arrays sin paginación. Los detalles de un pedido devuelven array o DTO individual según la ruta.

Las creaciones de recursos devuelven 201 con encabezado `Location`; el login devuelve 201 sin ese encabezado. DELETE de catálogo devuelve 204 sin cuerpo. Los errores conocidos tienen respuestas explícitas con `application/problem+json` y esquema `ProblemDetailsDto`: `type`, `title`, `status`, `detail`, `instance` y `errors` opcional. Los códigos se seleccionan por operación según las validaciones, permisos y excepciones existentes. Errores inesperados conservan 500 seguro; Health puede devolver 503. No se modifican el filtro ni las reglas de negocio.

## JWT y permisos

Ejecuta POST `/api/v1/auth/login` con correo y clave de una cuenta local de pruebas válida. La respuesta contiene `token`, `tipo` y `expiraEnSegundos`. La clave está marcada `writeOnly` en OpenAPI. Para una operación protegida, usa `Authorization: Bearer <token>`; en Swagger, pulsa **Authorize** e introduce únicamente el token, sin escribir de nuevo `Bearer`.

| Recurso                                                                    | Política vigente                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Users                                                                      | JWT y ADMIN                                                                             |
| Orders: POST                                                               | JWT y CLIENTE; idCliente se obtiene del token                                           |
| Orders: lecturas                                                           | JWT; ADMIN todos, CLIENTE propios, EMPRENDEDOR de sus tiendas; recursos ajenos 404      |
| Deliveries: lecturas                                                       | JWT; ADMIN todas, REPARTIDOR propias; alcance SQL antes de paginar y contar; ajenas 404 |
| Deliveries: asignar/cancelar                                               | JWT y ADMIN                                                                             |
| Deliveries: start/complete                                                 | JWT y REPARTIDOR propietario; ajenas 403                                                |
| Auth/login, Stores, Categories, Products, Neighborhoods, Couriers y Health | Públicos según el código actual                                                         |

Bearer se declara solo en los endpoints protegidos. Authorize facilita el envío del JWT; no sustituye los guards ni cambia permisos. Esta documentación refleja el acceso público actual del catálogo; no introduce una política de seguridad nueva.

## Colección `api.http`

La colección contiene **43 peticiones**, que cubren las 35 operaciones únicas: tres logins para distintos roles, las operaciones por recurso y seis ejemplos adicionales de errores 400, 401, 403, 404, 409 y 422. Cada bloque tiene nombre y un comentario `expected-status`; ese comentario indica el resultado esperado y no es una aserción automática de la extensión.

Para uso manual, abre `api.http` con [REST Client para VS Code](https://github.com/Huachao/vscode-restclient). Los JWT e identificadores de recursos nuevos se obtienen de respuestas de peticiones nombradas. Ejecuta los tres logins y después cada bloque en el orden del archivo. Las referencias de respuesta solo funcionan después de ejecutar la petición nombrada.

Configura localmente las variables de entorno `CHOROTEGA_ADMIN_PASSWORD`, `CHOROTEGA_CLIENT_PASSWORD` y `CHOROTEGA_COURIER_PASSWORD` en el entorno desde el que inicia VS Code. La colección las lee con `$processEnv`; no carga el `.env` del backend. Sustituye los correos de ejemplo por los de tus cuentas locales y ajusta `baseUrl`. No reemplaces esos valores por secretos reales en un archivo que vayas a publicar.

### Datos previos para ejecución manual

Los valores 1 y 2 son marcadores y deben reemplazarse por IDs reales; no se supone que coincidan con los seeds. Los seeds históricos por sí solos no garantizan cuentas aptas para login. Usa cuentas de prueba con contraseña válida mediante el mecanismo local de preparación existente; este bloque no incorpora registro ni creación de usuarios.

| Variable                            | Preparación necesaria                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| adminEmail/clientEmail/courierEmail | Cuentas ACTIVO con hash bcrypt válido y roles ADMIN, CLIENTE y REPARTIDOR respectivamente                         |
| userId                              | Usuario que ADMIN puede consultar y cuyo teléfono de prueba puede actualizarse                                    |
| entrepreneurId                      | Usuario EMPRENDEDOR existente                                                                                     |
| catalogStoreId/catalogCategoryId    | Tienda y categoría existentes, ambas ACTIVA, diferentes de los recursos temporales de CRUD                        |
| catalogProductId                    | Producto ACTIVO de esa tienda, con existencias suficientes para la compra                                         |
| neighborhoodId                      | Barrio ACTIVO con tarifa válida                                                                                   |
| courierId                           | Repartidor asociado al usuario courierEmail y DISPONIBLE                                                          |
| preparedOrderId                     | Pedido independiente en PREPARANDO, con dirección válida y barrio ACTIVO, sin entrega activa                      |
| cancellableDeliveryId               | Otra entrega ASIGNADA, con su repartidor OCUPADO; no la que se completará en la colección                         |
| existingCategoryName                | Nombre de una categoría existente para provocar el conflicto UNIQUE real                                          |
| otherStoreProductId                 | Producto ACTIVO y con existencias, perteneciente a otra tienda ACTIVA, para la regla de pedido de una sola tienda |

El pedido creado mediante POST queda CONFIRMADO. No puede usarse directamente como `preparedOrderId`: este bloque no añade una transición HTTP a PREPARANDO. Usa datos locales de pruebas previamente preparados. Los recursos temporales de CRUD se crean, consultan, actualizan y eliminan sin referencias; la compra usa productos base distintos. La colección escribe y deja persistidos un pedido confirmado y las transiciones de entregas; no es idempotente ni debe repetirse sin reponer las existencias y los datos de transición.

### Ejecución automática reproducible

La prueba `openapi.integration-spec.ts` prepara esos datos exclusivamente dentro de PostgreSQL temporal: cuentas de roles distintos con contraseña temporal, catálogo base, productos de dos tiendas, barrio, repartidores y pedidos PREPARANDO. La segunda asignación de entrega se prepara mediante el servicio real. Los IDs, correos y contraseñas se sustituyen en memoria; no se guardan ni se reutilizan fuera de la prueba.

Un ejecutor de pruebas procesa el subconjunto de sintaxis utilizado por el archivo: variables, referencias JSON de respuestas, método/ruta, Authorization y body JSON. Envía las **43 peticiones del archivo** con Supertest al mismo Nest real y comprueba cada código esperado, los 201 con Location, los 204 vacíos y Problem Details en errores. No sustituye guards ni autenticación. Esto comprueba los ejemplos bajo datos controlados; no garantiza el resultado al ejecutar manualmente con otra base o IDs distintos.

## Pruebas

Desde `apps/backend`, con Docker activo:

```bash
npm run test:integration -- --testPathPatterns=test/integration/http/openapi.integration-spec.ts
npm run test:integration
npm run test:integration -- --testPathPatterns=test/integration/http/security.integration-spec.ts
npm run test:e2e
```

La infraestructura usa PostgreSQL 16, migraciones reales y `synchronize: false`, sin cargar `.env` ni usar Supabase. El callback opcional del helper registra Swagger antes de `app.init()` y conserva el comportamiento anterior cuando no se proporciona.

La suite específica comprueba UI y script, JSON y versión OpenAPI, exactamente 35 operaciones, ausencia de rutas duplicadas, parámetros y opcionalidad, DTOs públicos, todas las referencias de componentes, respuestas paginadas, arrays, Bearer selectivo, contraseña writeOnly, importes string, campos nullable, PATCH parcial, Location, 204 sin contenido y errores Problem Details por operación. También comprueba cobertura estructural de la colección y ejecuta sus 43 peticiones. La revisión del JSON verifica estructura y referencias generadas; no introduce un validador externo adicional.

## Resultados locales del bloque

| Validación                                | Resultado                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Prettier                                  | Aprobado para TS/JSON del bloque, esta documentación y la sección nueva del README (formato por rango para preservar el resto) |
| ESLint completo                           | Aprobado sin modificar código fuera del bloque                                                                                 |
| TypeScript `--noEmit --incremental false` | Aprobado                                                                                                                       |
| `npm run build`                           | Aprobado                                                                                                                       |
| Unitarias completas                       | 283/283, 28 suites                                                                                                             |
| Cobertura existente                       | 283/283; statements 96,97%, branches 84,63%, functions 89,00%, lines 97,18%; todos los umbrales globales >=70%                 |
| Integración completa                      | 456/456, 17 suites, 39,039 s                                                                                                   |
| Seguridad HTTP                            | 5/5, 2,685 s                                                                                                                   |
| E2E                                       | 441/441, 10 suites, 28,795 s                                                                                                   |
| OpenAPI específica                        | 44/44, 2,684 s; incluye envío real de las 43 peticiones de la colección                                                        |
| `git diff --check`                        | Sin errores                                                                                                                    |

La cobertura corresponde al alcance existente de Orders/Deliveries, sin cambios de exclusiones ni umbrales. Las suites con Docker se ejecutaron en secuencia. La comparación del AST de los 36 controladores/DTOs modificados, eliminando solo las anotaciones e imports de Swagger, conserva íntegramente las declaraciones, validaciones y cuerpos funcionales anteriores.

La revisión de los servicios confirmó que Stores y Products documentan 409 únicamente en DELETE por referencias existentes; sus POST/PATCH no introducen ese código. Categories conserva el conflicto UNIQUE en POST/PATCH y el de FK en DELETE.

## Límites técnicos

Se preservan rutas, guards, validación global, repositorios, servicios de negocio, entidades, migraciones, estados y transacciones. Swagger es documentación; no genera endpoints de negocio nuevos ni modifica el flujo de autenticación. No se instala una extensión de editor ni se guarda configuración local. La prueba automática de la colección no pretende implementar todas las funciones de REST Client. La publicación y el CI remoto quedan para una revisión posterior.

La instalación npm informó 12 alertas de auditoría del árbol completo (4 moderadas, 6 altas y 2 críticas). No se ejecutó `audit fix`; la revisión de esas alertas queda como pendiente separado. La comparación del lockfile confirma que no cambió ninguna versión previa.
