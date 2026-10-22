# Validación final del Laboratorio 3

## Resultado y base auditada

Resultado: **listo: validación automática aprobada con cero diferencias de
esquema**. Pasan 13 pruebas unitarias y nueve de integración (seis funcionales
y tres de infraestructura). La ejecución remota del nuevo PR sigue por confirmar;
el CI verde citado abajo corresponde a la auditoría integrada anterior.
Fecha: 10 de septiembre de 2026.
Base auditada: develop, commit `9bdbd6e7371da172ea7ba0268b1ee614e7aa2d4d`.
Se partió de un árbol limpio, se actualizó por avance directo y se creó
`docs/lab3-final-validation`.

La guía «EIF509 Laboratorio 3 - Guía Completa», página PDF 2 (impresa 1),
«Qué entregar», exige entidades completas, repositorio genérico y específicos
incluido MongoDB, cuatro consultas con SQL, evidencia N+1 y seis pruebas con
Testcontainers en CI. La página PDF 3 desarrolla la rúbrica y prohíbe editar
migraciones aplicadas. La adaptación a NestJS/TypeORM está documentada en
[ADR-001](../../adr/ADR-001-Seleccion-Stack-Tecnologico.md).

## Validación automática del esquema

Base de esta comprobación: `develop` en `f8fa94f`, con la auditoría anterior
integrada; rama `test/typeorm-schema-validation`.

La nueva prueba
`apps/backend/test/integration/typeorm-schema-validation.integration-spec.ts`
reutiliza `withPostgresTestDatabase`: inicia PostgreSQL 16 con puerto dinámico,
crea el DataSource exclusivo y aplica las dos migraciones reales. Mantiene
`synchronize: false`, comprueba nueve metadatos y que ninguna entidad quede
excluida de la comparación mediante `metadata.synchronize: false`.

En TypeORM 1.1.0 existe la API:

```typescript
const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
```

`log()` consulta el esquema, activa el registro SQL en memoria y devuelve el DDL
propuesto sin ejecutarlo. La prueba lanza un error con todas las consultas y sus
parámetros si `upQueries` no está vacío. No filtra ni normaliza resultados para
aceptarlos. El helper destruye el DataSource y detiene el contenedor en `finally`,
incluso cuando esta comprobación falla.

El patrón existente `test/integration/**/*.integration-spec.ts` descubre la
prueba automáticamente. El workflow ya ejecuta `npm run test:integration`; no
necesita otro paso. Cualquier diferencia que aparezca en el futuro hará fallar
la prueba y el paso de integración de CI.

### Diagnóstico anterior a la nueva migración

Consultas capturadas antes de aplicar la nueva migración, todas con parámetros `[]`:

```sql
ALTER TABLE "pedido" ALTER COLUMN "fecha_creacion" SET DEFAULT now()
ALTER TABLE "entrega" ALTER COLUMN "fecha_asignacion" SET DEFAULT now()
ALTER TABLE "usuario" ALTER COLUMN "fecha_creacion" SET DEFAULT now()
ALTER TABLE "tienda" ALTER COLUMN "fecha_creacion" SET DEFAULT now()
ALTER TABLE "producto" ALTER COLUMN "fecha_publicacion" SET DEFAULT now()
```

| Entidad  | Archivo dentro de apps/backend/src/modules | Propiedad        | Columna física             |
| -------- | ------------------------------------------ | ---------------- | -------------------------- |
| Order    | orders/entities/order.entity.ts            | fechaCreacion    | pedido.fecha_creacion      |
| Delivery | deliveries/entities/delivery.entity.ts     | fechaAsignacion  | entrega.fecha_asignacion   |
| User     | users/entities/user.entity.ts              | fechaCreacion    | usuario.fecha_creacion     |
| Store    | stores/entities/store.entity.ts            | fechaCreacion    | tienda.fecha_creacion      |
| Product  | products/entities/product.entity.ts        | fechaPublicacion | producto.fecha_publicacion |

Las cinco entidades declaran `default: () => 'CURRENT_TIMESTAMP'`, igual que
la migración inicial. No hay un mapeo faltante demostrado. La comparación textual
del driver produce ruido entre expresiones equivalentes en PostgreSQL:

- `PostgresDriver.normalizeDefault` llama a `normalizeDatetimeFunction` y convierte
  el default de metadatos `CURRENT_TIMESTAMP` a `now()`.
- `PostgresQueryRunner` conserva `CURRENT_TIMESTAMP` al leer el default real.
- `PostgresDriver.defaultEqual` compara las representaciones textuales.

Se comprobó con el driver instalado que `CURRENT_TIMESTAMP`, `current_timestamp`
y `now()` como funciones default de metadatos producen todos `now()`. Por tanto,
cambiar únicamente las cinco declaraciones a `now()` no resolvería el problema.
No se alteraron metadatos, la migración inicial ni dependencias.

Fuentes: [driver oficial TypeORM 1.1.0](https://github.com/typeorm/typeorm/blob/1.1.0/src/driver/postgres/PostgresDriver.ts)
y [equivalencia documentada por PostgreSQL 16](https://www.postgresql.org/docs/16/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

### Corrección versionada

Se agrega `apps/backend/src/database/migrations/1788998400000-AlignTimestampDefaults.ts`.
Su método `up` establece `now()` en los cinco defaults identificados arriba,
sin actualizar datos ni cambiar tipos, nulabilidad, índices o relaciones.
`down` restaura `CURRENT_TIMESTAMP` en esas mismas columnas. La migración inicial
permanece intacta y la semántica temporal sigue siendo el inicio de la transacción.

`postgres-test-database.ts` registra explícitamente ambas migraciones, en orden.
Las pruebas de limpieza e infraestructura ahora exigen ambos registros en
`typeorm_migrations`. La configuración normal de la CLI ya descubre la nueva
migración mediante el patrón existente; no se cambió el workflow ni se ejecutó
la CLI contra bases persistentes. Una base existente debe aplicar esta migración
por el proceso habitual de despliegue; esta ejecución solo la aplicó en contenedores.

La prueba compara el `upQueries` original completo y exige longitud cero.
No hay filtros de SQL, listas de diferencias permitidas, normalización de
resultados, mocks del schema builder ni sincronización automática.

### Resultado exacto después de la corrección

Comandos ejecutados desde `apps/backend`: Prettier sobre archivos afectados,
`npm run lint`, `npx tsc --noEmit --incremental false -p tsconfig.json`,
`npm run build`, `npm test -- --runInBand` y `npm run test:integration`.

| Comprobación                               | Resultado                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Prettier, npm run lint, TypeScript y build | Correctos                                                                      |
| npm test -- --runInBand                    | 2 suites, 13 unitarias aprobadas, 0 fallidas; 0,613 s                          |
| npm run test:integration                   | 4 suites aprobadas; 9 pruebas aprobadas, 0 fallidas; 7,451 s                   |
| Funcionales                                | 6 aprobadas: 3 catálogo y 3 pedidos                                            |
| Infraestructura                            | 3 aprobadas: esquema/migraciones, limpieza ante fallo y compatibilidad TypeORM |
| Diferencias finales                        | `upQueries = []`; 0 operaciones propuestas                                     |
| git diff --check                           | Correcto                                                                       |
| Recursos temporales                        | Sin contenedores activos ni contenedores etiquetados restantes                 |

Se comprobó adicionalmente `up → down → up` en otro contenedor temporal:

- Tras `up`: cero diferencias.
- Tras `undoLastMigration()`: los cinco defaults vuelven a `CURRENT_TIMESTAMP`
  según `information_schema.columns`, y el schema builder propone las cinco
  operaciones originales.
- Tras `runMigrations()`: cero diferencias y ninguna migración pendiente.

Esta comprobación temporal de reversión no aumenta el conteo de pruebas Jest.
La ejecución inicial en rojo (ocho aprobadas y una fallida) demostró que la prueba
no acepta las diferencias. La ejecución actual en verde demuestra que las dos
migraciones producen un esquema que TypeORM no propone modificar.

## Matriz de requisitos

Las rutas de esta matriz son relativas a la raíz. `src/` y `test/` se refieren
al backend, dentro de `apps/backend/`.

| Requisito                                                       | Archivos                                                                                                                            | Evidencia                                                                               | Estado   | Corrección necesaria                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| Nueve entidades, tablas y columnas                              | `src/modules/*/entities/*.entity.ts`                                                                                                | 9 tablas y 61 columnas; comparación contra PostgreSQL recién migrado                    | Completo | Ninguna                                                                                    |
| PK, FK, restricciones, índices, defaults                        | Entidades y `src/database/migrations/1788732000000-CreateInitialSchema.ts`                                                          | 9 PK, 11 FK, 6 UNIQUE, 20 CHECK, 8 índices adicionales                                  | Completo | Diferencias equivalentes de defaults explicadas abajo                                      |
| Relaciones directas e inversas sin carga automática ni cascadas | Las nueve entidades                                                                                                                 | 22 relaciones con inversa; eager y cascadas desactivados en metadatos                   | Completo | Ninguna                                                                                    |
| Validación automática equivalente a ddl-auto=validate           | `test/integration/typeorm-schema-validation.integration-spec.ts`, `src/database/migrations/1788998400000-AlignTimestampDefaults.ts` | upQueries vacío tras ambas migraciones; prueba descubierta por CI                       | Completo | Defaults alineados por una nueva migración; inicial intacta                                |
| Contrato y base genérica                                        | `src/common/repositories/base.repository.ts`, `typeorm-base.repository.ts`                                                          | Genéricos entidad/ID; CRUD real mediante CategoriesRepository                           | Completo | Ninguna                                                                                    |
| Nueve repositorios PostgreSQL                                   | `src/modules/*/repositories/*.repository.ts`                                                                                        | Cada whereId utiliza su PK real y hereda la base                                        | Completo | Ninguna                                                                                    |
| Repositorio MongoDB                                             | `src/modules/order-audits/repositories/order-audits.repository.ts`                                                                  | Lectura real por pedidoId; save con upsert y appendEvent implementados                  | Completo | No comparte el contrato CRUD de TypeORM; la guía no exige esa interfaz para MongoDB        |
| Registro e inyección NestJS                                     | `src/modules/*/*.module.ts`, `src/app.module.ts`, `src/database/mongodb/*.ts`                                                       | 10 repositorios resueltos mediante módulos reales; lecturas en ambos motores            | Completo | Ninguna                                                                                    |
| Dos consultas fijas                                             | `src/modules/products/repositories/products.repository.ts`, `products.service.ts`                                                   | SQL parametrizado, filtros y resultados; 3 pruebas funcionales del catálogo             | Completo | Actualizada documentación histórica                                                        |
| Dos consultas dinámicas                                         | `src/modules/orders/repositories/orders.repository.ts`, `src/modules/deliveries/repositories/deliveries.repository.ts`              | search de pedidos y entregas, parámetros y resultados reales                            | Completo | Añadida evidencia con seeds actuales                                                       |
| N+1 anterior y corrección                                       | OrdersRepository, OrderDetailsRepository, `docs/laboratory/lab-03/n-plus-one.md`                                                    | 5 SELECT antes y 1 después, mismos pedidos y detalles                                   | Completo | Escenario actual diferenciado del histórico                                                |
| PostgreSQL 16 temporal, URL dinámica y migraciones              | `test/support/postgres-test-database.ts`                                                                                            | Imagen postgres:16, DataSource exclusivo, synchronize:false, runMigrations              | Completo | Ninguna                                                                                    |
| Aislamiento y limpieza                                          | `test/integration/catalog-repositories.integration-spec.ts`, `orders.integration-spec.ts`                                           | TRUNCATE de negocio tras cada prueba; historial conservado; stop en afterAll            | Completo | Corregida ausencia de limpieza entre pruebas de pedidos y cierre seguro si falla el inicio |
| Seis pruebas funcionales                                        | Las dos suites funcionales anteriores                                                                                               | 3 catálogo + 3 pedidos, aprobadas                                                       | Completo | Ninguna prueba nueva; corregidos hooks                                                     |
| Infraestructura separada                                        | `test/integration/postgres-infrastructure.integration-spec.ts`, `typeorm-schema-validation.integration-spec.ts`                     | 3 pruebas aprobadas; no cuentan dentro de las seis funcionales                          | Completo | Ninguna                                                                                    |
| CI y Node compatible                                            | `.github/workflows/ci.yml`, `apps/backend/package.json`                                                                             | Node 22.22.0; npm ci, lint, build, unitarias e integración; frontend preservado         | Completo | Ninguna                                                                                    |
| Sintaxis CI y Compose                                           | `.github/workflows/ci.yml`, `docker-compose.yml`                                                                                    | Parseo YAML sin duplicados y docker compose config --quiet                              | Completo | Ninguna                                                                                    |
| Migración inicial e historial                                   | `src/database/data-source.ts`, migración inicial y helper                                                                           | TypeORM crea typeorm_migrations y registra la migración real                            | Completo | No se ejecutó la CLI que carga .env                                                        |
| Seeds separados y coherentes                                    | `database/postgres/seeds/V1__seed_initial_data.sql`, `database/mongodb/seeds/seed-bitacora-pedidos.js`                              | 4 pedidos y 4 bitácoras, IDs 1–4, en motores temporales nuevos                          | Completo | Corregidas cifras antiguas del README                                                      |
| Healthchecks                                                    | `docker-compose.yml`                                                                                                                | pg_isready y ping con mongosh, intervalos y reintentos configurados                     | Completo | Se validó configuración; no se arrancó Compose                                             |
| JSON Schema e índice único MongoDB                              | `database/mongodb/seeds/seed-bitacora-pedidos.js`                                                                                   | Validador strict/error e índice uq_bitacora_pedido_id; rechazos 121 y 11000 comprobados | Completo | Ninguna                                                                                    |
| Explicación de 3FN                                              | `docs/laboratory/lab-02/documento-tecnico.md`, apartado 3.1                                                                         | Separación de entidades, datos históricos y excepciones de importes derivados           | Completo | Corregida afirmación de 3FN estricta para todas las columnas                               |

## Mapeo y repositorios

| Entidad      | Archivo de entidad                                          | Tabla          | PK física / propiedad        | Repositorio             |
| ------------ | ----------------------------------------------------------- | -------------- | ---------------------------- | ----------------------- |
| User         | `src/modules/users/entities/user.entity.ts`                 | usuario        | id_usuario / idUsuario       | UsersRepository         |
| Store        | `src/modules/stores/entities/store.entity.ts`               | tienda         | id_tienda / idTienda         | StoresRepository        |
| Category     | `src/modules/categories/entities/category.entity.ts`        | categoria      | id_categoria / idCategoria   | CategoriesRepository    |
| Product      | `src/modules/products/entities/product.entity.ts`           | producto       | id_producto / idProducto     | ProductsRepository      |
| Neighborhood | `src/modules/neighborhoods/entities/neighborhood.entity.ts` | barrio         | id_barrio / idBarrio         | NeighborhoodsRepository |
| Order        | `src/modules/orders/entities/order.entity.ts`               | pedido         | id_pedido / idPedido         | OrdersRepository        |
| OrderDetail  | `src/modules/order-details/entities/order-detail.entity.ts` | detalle_pedido | id_detalle / idDetalle       | OrderDetailsRepository  |
| Courier      | `src/modules/couriers/entities/courier.entity.ts`           | repartidor     | id_repartidor / idRepartidor | CouriersRepository      |
| Delivery     | `src/modules/deliveries/entities/delivery.entity.ts`        | entrega        | id_entrega / idEntrega       | DeliveriesRepository    |

Los repositorios anteriores se encuentran en `src/modules/<módulo>/repositories/`
y se registran y exportan desde `<módulo>.module.ts`, con
`TypeOrmModule.forFeature([Entidad])`. Todos los IDs PostgreSQL son numéricos;
`precio`, `precioUnitario`, subtotales, totales y tarifas numeric se conservan
como strings. `ProductsService` delega en ProductsRepository, cuya base conserva
findAll, findById, save y deleteById. createEntity construye el producto sin SQL.
MongoDB usa OrderAuditsModule, MongoDatabaseModule y el driver MongoDB.

Se revisaron los nombres de columnas, tipos, longitudes, nulabilidad y defaults
contra el esquema real. Las 11 relaciones propietarias tienen FK y relación
inversa. Ninguna de las 22 relaciones activa eager o cascadas. En esta adaptación
las relaciones se solicitan explícitamente; no son propiedades Promise que
consulten automáticamente al accederlas.

`synchronize: false` evita cambios automáticos; **no equivale por sí solo a
`ddl-auto=validate`**. Esta auditoría contrastó metadatos y esquema mediante
`dataSource.driver.createSchemaBuilder().log()`, sin ejecutar su DDL.
En la auditoría anterior, antes de agregar AlignTimestampDefaults, el resultado
contenía únicamente cinco propuestas equivalentes de defaults:

```sql
ALTER TABLE "pedido" ALTER COLUMN "fecha_creacion" SET DEFAULT now();
ALTER TABLE "entrega" ALTER COLUMN "fecha_asignacion" SET DEFAULT now();
ALTER TABLE "usuario" ALTER COLUMN "fecha_creacion" SET DEFAULT now();
ALTER TABLE "tienda" ALTER COLUMN "fecha_creacion" SET DEFAULT now();
ALTER TABLE "producto" ALTER COLUMN "fecha_publicacion" SET DEFAULT now();
```

La migración y las entidades expresan CURRENT_TIMESTAMP, que TypeORM normaliza
como now(). PostgreSQL documenta ambas formas como
[equivalentes](https://www.postgresql.org/docs/16/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).
La migración adicional alinea ahora esos cinco defaults y la prueba exige cero
operaciones. La validación automática se realiza en integración/CI sobre PostgreSQL
recién migrado; no al arrancar la aplicación ni contra cualquier base externa.

## SQL real de las cuatro consultas

Auditoría complementaria en PostgreSQL temporal recién migrado. Se cargó el seed
actual **una sola vez en la base vacía**, dentro de una transacción. Esto no forma
parte de los fixtures de las seis pruebas funcionales, que no usan seeds globales.
Un logger de TypeORM capturó las sentencias y sus parámetros; los resultados se
proyectan a IDs y datos técnicos para evitar información personal.

### Consulta 1: findAvailableByStore(1)

```sql
SELECT "producto"."id_producto" AS "producto_id_producto", "producto"."id_tienda" AS "producto_id_tienda", "producto"."id_categoria" AS "producto_id_categoria", "producto"."nombre" AS "producto_nombre", "producto"."descripcion" AS "producto_descripcion", "producto"."precio" AS "producto_precio", "producto"."cantidad_disponible" AS "producto_cantidad_disponible", "producto"."estado" AS "producto_estado", "producto"."fecha_publicacion" AS "producto_fecha_publicacion" FROM "producto" "producto" WHERE "producto"."id_tienda" = $1 AND "producto"."estado" = $2 AND "producto"."cantidad_disponible" > $3 ORDER BY "producto"."id_producto" ASC
```

Parámetros: `[1,"ACTIVO",0]`.

Resultado:

```json
[
  {
    "id": 1,
    "stock": 17,
    "precio": "4500.00"
  },
  {
    "id": 2,
    "stock": 8,
    "precio": "8000.00"
  }
]
```

### Consulta 2: findActiveByCategory(1)

```sql
SELECT "producto"."id_producto" AS "producto_id_producto", "producto"."id_tienda" AS "producto_id_tienda", "producto"."id_categoria" AS "producto_id_categoria", "producto"."nombre" AS "producto_nombre", "producto"."descripcion" AS "producto_descripcion", "producto"."precio" AS "producto_precio", "producto"."cantidad_disponible" AS "producto_cantidad_disponible", "producto"."estado" AS "producto_estado", "producto"."fecha_publicacion" AS "producto_fecha_publicacion" FROM "producto" "producto" WHERE "producto"."id_categoria" = $1 AND "producto"."estado" = $2 ORDER BY "producto"."id_producto" ASC
```

Parámetros: `[1,"ACTIVO"]`.

Resultado:

```json
[
  {
    "id": 1,
    "stock": 17,
    "precio": "4500.00"
  }
]
```

### Consulta 3: OrdersRepository.search({estado:'ENTREGADO',idBarrio:1})

```sql
SELECT "pedido"."id_pedido" AS "pedido_id_pedido", "pedido"."id_cliente" AS "pedido_id_cliente", "pedido"."id_tienda" AS "pedido_id_tienda", "pedido"."id_barrio" AS "pedido_id_barrio", "pedido"."fecha_creacion" AS "pedido_fecha_creacion", "pedido"."estado" AS "pedido_estado", "pedido"."subtotal" AS "pedido_subtotal", "pedido"."tarifa_envio" AS "pedido_tarifa_envio", "pedido"."total" AS "pedido_total", "pedido"."direccion_entrega" AS "pedido_direccion_entrega", "cliente"."id_usuario" AS "cliente_id_usuario", "cliente"."auth_id" AS "cliente_auth_id", "cliente"."nombre" AS "cliente_nombre", "cliente"."apellido" AS "cliente_apellido", "cliente"."correo" AS "cliente_correo", "cliente"."telefono" AS "cliente_telefono", "cliente"."rol" AS "cliente_rol", "cliente"."estado" AS "cliente_estado", "cliente"."fecha_creacion" AS "cliente_fecha_creacion", "tienda"."id_tienda" AS "tienda_id_tienda", "tienda"."id_emprendedor" AS "tienda_id_emprendedor", "tienda"."nombre" AS "tienda_nombre", "tienda"."descripcion" AS "tienda_descripcion", "tienda"."direccion" AS "tienda_direccion", "tienda"."telefono" AS "tienda_telefono", "tienda"."horario" AS "tienda_horario", "tienda"."estado" AS "tienda_estado", "tienda"."fecha_creacion" AS "tienda_fecha_creacion", "barrio"."id_barrio" AS "barrio_id_barrio", "barrio"."nombre" AS "barrio_nombre", "barrio"."tarifa_envio" AS "barrio_tarifa_envio", "barrio"."estado" AS "barrio_estado" FROM "pedido" "pedido" LEFT JOIN "usuario" "cliente" ON "cliente"."id_usuario"="pedido"."id_cliente"  LEFT JOIN "tienda" "tienda" ON "tienda"."id_tienda"="pedido"."id_tienda"  LEFT JOIN "barrio" "barrio" ON "barrio"."id_barrio"="pedido"."id_barrio" WHERE "pedido"."estado" = $1 AND "pedido"."id_barrio" = $2 ORDER BY "pedido"."fecha_creacion" DESC, "pedido"."id_pedido" DESC
```

Parámetros: `["ENTREGADO",1]`.

Resultado:

```json
[
  {
    "id": 4,
    "estado": "ENTREGADO",
    "barrio": 1
  }
]
```

### Consulta 4: DeliveriesRepository.search({estado:'ENTREGADA',idRepartidor:1})

```sql
SELECT "entrega"."id_entrega" AS "entrega_id_entrega", "entrega"."id_pedido" AS "entrega_id_pedido", "entrega"."id_repartidor" AS "entrega_id_repartidor", "entrega"."estado" AS "entrega_estado", "entrega"."fecha_asignacion" AS "entrega_fecha_asignacion", "entrega"."fecha_entrega" AS "entrega_fecha_entrega", "pedido"."id_pedido" AS "pedido_id_pedido", "pedido"."id_cliente" AS "pedido_id_cliente", "pedido"."id_tienda" AS "pedido_id_tienda", "pedido"."id_barrio" AS "pedido_id_barrio", "pedido"."fecha_creacion" AS "pedido_fecha_creacion", "pedido"."estado" AS "pedido_estado", "pedido"."subtotal" AS "pedido_subtotal", "pedido"."tarifa_envio" AS "pedido_tarifa_envio", "pedido"."total" AS "pedido_total", "pedido"."direccion_entrega" AS "pedido_direccion_entrega", "repartidor"."id_repartidor" AS "repartidor_id_repartidor", "repartidor"."id_usuario" AS "repartidor_id_usuario", "repartidor"."medio_transporte" AS "repartidor_medio_transporte", "repartidor"."disponibilidad" AS "repartidor_disponibilidad" FROM "entrega" "entrega" LEFT JOIN "pedido" "pedido" ON "pedido"."id_pedido"="entrega"."id_pedido"  LEFT JOIN "repartidor" "repartidor" ON "repartidor"."id_repartidor"="entrega"."id_repartidor" WHERE "entrega"."estado" = $1 AND "entrega"."id_repartidor" = $2 ORDER BY "entrega"."fecha_asignacion" DESC, "entrega"."id_entrega" DESC
```

Parámetros: `["ENTREGADA",1]`.

Resultado:

```json
[
  {
    "id": 2,
    "pedido": 4,
    "estado": "ENTREGADA"
  }
]
```

Por tienda se exige ACTIVO y stock > 0; por categoría solo ACTIVO. Ambas
ordenan por idProducto ASC. Las búsquedas dinámicas agregan únicamente los
filtros presentes y ordenan por fecha descendente y luego por su ID descendente.
Cada llamada anterior ejecutó exactamente un SELECT. La evidencia histórica
permanece en [consultas fijas](consultas-fijas-catalogo.md) y
[consultas dinámicas](consultas-dinamicas.md), con sus escenarios diferenciados.

## N+1 reproducido

Antes: findAll de pedidos seguido de findByOrderId para cada pedido.
Se capturaron 5 SELECT: uno para cuatro pedidos y cuatro para sus detalles.

```sql
SELECT "Order"."id_pedido" AS "Order_id_pedido", "Order"."id_cliente" AS "Order_id_cliente", "Order"."id_tienda" AS "Order_id_tienda", "Order"."id_barrio" AS "Order_id_barrio", "Order"."fecha_creacion" AS "Order_fecha_creacion", "Order"."estado" AS "Order_estado", "Order"."subtotal" AS "Order_subtotal", "Order"."tarifa_envio" AS "Order_tarifa_envio", "Order"."total" AS "Order_total", "Order"."direccion_entrega" AS "Order_direccion_entrega" FROM "pedido" "Order"
SELECT "OrderDetail"."id_detalle" AS "OrderDetail_id_detalle", "OrderDetail"."id_pedido" AS "OrderDetail_id_pedido", "OrderDetail"."id_producto" AS "OrderDetail_id_producto", "OrderDetail"."cantidad" AS "OrderDetail_cantidad", "OrderDetail"."precio_unitario" AS "OrderDetail_precio_unitario", "OrderDetail"."subtotal" AS "OrderDetail_subtotal" FROM "detalle_pedido" "OrderDetail" WHERE (("OrderDetail"."id_pedido" = $1))
```

Parámetros: primera consulta `[]`; consulta de detalles repetida con
`[1]`, `[2]`, `[3]`, `[4]`.

Después: OrdersRepository.findAllWithDetails usa leftJoinAndSelect.
Se capturó un SELECT con parámetros `[]`:

```sql
SELECT "pedido"."id_pedido" AS "pedido_id_pedido", "pedido"."id_cliente" AS "pedido_id_cliente", "pedido"."id_tienda" AS "pedido_id_tienda", "pedido"."id_barrio" AS "pedido_id_barrio", "pedido"."fecha_creacion" AS "pedido_fecha_creacion", "pedido"."estado" AS "pedido_estado", "pedido"."subtotal" AS "pedido_subtotal", "pedido"."tarifa_envio" AS "pedido_tarifa_envio", "pedido"."total" AS "pedido_total", "pedido"."direccion_entrega" AS "pedido_direccion_entrega", "detalle"."id_detalle" AS "detalle_id_detalle", "detalle"."id_pedido" AS "detalle_id_pedido", "detalle"."id_producto" AS "detalle_id_producto", "detalle"."cantidad" AS "detalle_cantidad", "detalle"."precio_unitario" AS "detalle_precio_unitario", "detalle"."subtotal" AS "detalle_subtotal" FROM "pedido" "pedido" LEFT JOIN "detalle_pedido" "detalle" ON "detalle"."id_pedido"="pedido"."id_pedido" ORDER BY "pedido"."id_pedido" ASC
```

Resultado idéntico antes y después:

```json
[
  {
    "id": 1,
    "details": 2
  },
  {
    "id": 2,
    "details": 1
  },
  {
    "id": 3,
    "details": 1
  },
  {
    "id": 4,
    "details": 1
  }
]
```

El JOIN carga los detalles en la consulta inicial y TypeORM agrupa las filas por
pedido. Recorrer detalles ya cargados no dispara una consulta por pedido.
findByOrderId sigue siendo válido para consultar un pedido conocido; el N+1
aparece al llamarlo en un bucle. La prueba funcional de pedidos verifica el
resultado del JOIN; el conteo 5→1 procede de esta auditoría complementaria, no de
una aserción de conteo en esa prueba.

## Datos y correcciones heredadas

| Tabla          | Registros del seed actual |
| -------------- | ------------------------: |
| barrio         |                         2 |
| detalle_pedido |                         5 |
| pedido         |                         4 |
| entrega        |                         2 |
| repartidor     |                         1 |
| usuario        |                         3 |
| tienda         |                         1 |
| producto       |                         2 |
| categoria      |                         2 |

Los productos quedan con stock 17 y 8. MongoDB temporal contiene cuatro documentos
con pedidoId `[1,2,3,4]`, exactamente los pedidos PostgreSQL. La colección tiene
JSON Schema con campos obligatorios pedidoId/eventos, validación strict/error y
el índice único `uq_bitacora_pedido_id`. Una inserción sin eventos falló con
código 121; un pedidoId duplicado falló con 11000. No se modificaron seeds ni se
leyeron o escribieron bases persistentes.

La configuración Compose conserva healthchecks de PostgreSQL y MongoDB. La
verificación de su sintaxis no demuestra el estado de volúmenes locales existentes;
no fue necesario iniciarlos para esta auditoría.

El documento técnico explica la separación en 3FN de categoría/producto,
barrio/pedido y usuario/repartidor, además de precio y tarifa históricos.
Se precisa que subtotal del detalle y total del pedido son importes derivados
almacenados, excepciones controladas mediante CHECK. La igualdad entre subtotal
del pedido y suma de detalles debe mantenerla la lógica transaccional; no se
atribuye al esquema una restricción entre tablas que no existe.

## Pruebas y comandos de la auditoría anterior

Desde `apps/backend`:

```bash
npm ci --cache <directorio-temporal-de-cache> --no-audit --no-fund
npm run lint
npx tsc --noEmit --incremental false -p tsconfig.json
npm run build
npm test -- --runInBand
npm run test:integration
```

Desde la raíz también se ejecutaron:

```bash
docker compose config --quiet
git diff --check
git status --short
docker ps
docker ps -a --filter label=chorotega.test-suite
```

El workflow y Compose se analizaron con `js-yaml` (rechazo de claves duplicadas),
y se comprobó que no hubiera nombres de pasos duplicados en cada job.

El directorio temporal de caché no forma parte del repositorio. npm ci instaló
863 paquetes en aproximadamente 9 segundos; emitió avisos de deprecación de
inflight y glob, sin fallos ni modificaciones del lockfile.

| Tipo                 | Archivo bajo apps/backend                                     | Pruebas aprobadas |
| -------------------- | ------------------------------------------------------------- | ----------------: |
| Unitarias            | src/modules/products/products.service.spec.ts                 |                 9 |
| Unitarias            | src/modules/products/repositories/products.repository.spec.ts |                 4 |
| Funcionales catálogo | test/integration/catalog-repositories.integration-spec.ts     |                 3 |
| Funcionales pedidos  | test/integration/orders.integration-spec.ts                   |                 3 |
| Infraestructura      | test/integration/postgres-infrastructure.integration-spec.ts  |                 2 |

Las tres pruebas de pedidos verifican persistencia y lectura de un pedido,
búsqueda por estado/barrio y recuperación con detalles mediante JOIN. La primera
utiliza Repository<Order> real de TypeORM; las otras utilizan OrdersRepository.
Las de catálogo verifican CRUD genérico, disponibilidad por tienda y activos por
categoría, con inactivos, stock cero, ausencia de coincidencias y orden inverso de
inserción. Las dos de infraestructura comprueban esquema/migraciones y limpieza
ante éxito o fallo intencional. `test/app.e2e-spec.ts` es una prueba e2e heredada,
fuera de ambos comandos; no se cuenta como aprobada ni se ejecutó porque importa
AppModule y su configuración de entorno.

| Comprobación local (Node 26.0.0)            | Resultado                                                    |
| ------------------------------------------- | ------------------------------------------------------------ |
| npm ci                                      | Correcto, 863 paquetes                                       |
| npm run lint                                | Correcto, sin errores ni advertencias de ESLint              |
| TypeScript sin emisión                      | Correcto                                                     |
| Build backend                               | Correcto                                                     |
| Unitarias                                   | 2 suites, 13 aprobadas, 0 fallidas; 0,501 s                  |
| Integración                                 | 3 suites, 8 aprobadas, 0 fallidas; 6,17 s                    |
| Desglose de integración                     | 6 funcionales + 2 de infraestructura                         |
| YAML workflow y Compose                     | Válidos, sin claves duplicadas; pasos sin nombres duplicados |
| docker compose config --quiet               | Correcto                                                     |
| Auditoría complementaria                    | Mapeos, 10 proveedores, 4 consultas, N+1 y seeds verificados |
| git diff --check                            | Correcto                                                     |
| Contenedores después de pruebas y auditoría | 0 activos y 0 contenedores con etiqueta chorotega.test-suite |

Se aplicó Prettier a los archivos afectados; en Markdown se desactiva el formateo
de lenguajes incrustados para conservar los ejemplos históricos. Las validaciones
funcionales anteriores ya incluyen la corrección de aislamiento de pedidos.
Las modificaciones posteriores son documentales; no requieren repetir consultas
sobre bases temporales sin cambios de código.

## CI confirmado de la auditoría anterior

El [run 34524662009](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/34524662009)
corresponde al commit auditado de develop y terminó en success. La API pública
confirma success para los jobs Build Backend y Build Frontend y para cada paso,
incluido «Ejecutar pruebas de integración con Testcontainers».
El workflow usa Node 22.22.0 en backend, compatible con el requisito >=22.22 del
paquete Testcontainers instalado, y ejecuta npm ci, lint, build, unitarias e
integración. Conserva las validaciones de migraciones y seeds en su servicio
PostgreSQL independiente; las pruebas usan sus propios contenedores.

El patrón `test/integration/**/*.integration-spec.ts` descubre las tres suites
integradas sin listas manuales. No hay continue-on-error en el job o el paso de
integración. El workflow se activa en PR hacia develop; el push de esta rama
`docs/` no coincide con los filtros de push actuales. La ejecución remota de
esta revisión deberá confirmarse al abrir el PR.

## Cambios y límites de la auditoría anterior

- Corregidos únicamente los hooks de aislamiento y cierre de orders.integration-spec.ts.
- Actualizados los conteos y pendientes documentales, las referencias personales,
  los escenarios históricos y la precisión de normalización.
- Sin cambios de código de producción, dependencias, esquema, migraciones o seeds.
- No se cargó el .env del backend ni se conectó a Supabase. El módulo NestJS de
  auditoría utilizó configuración explícita con ignoreEnvFile y skipProcessEnv,
  y los diez módulos reales, sin importar AppModule.
- Se cerraron DataSource, clientes MongoDB y contenedores, incluso mediante bloques
  finally en la auditoría complementaria. No quedaron recursos temporales activos.

La comprobación automática ya está aprobada en la suite de integración mediante
la nueva migración de defaults, tal como se documenta al principio. No se
modificaron entidades ni la migración inicial. Queda comprobar el CI de este PR;
el run citado de la auditoría anterior no incluye la nueva prueba. Las ramas
`test/` no activan los filtros actuales de push, pero un PR hacia develop sí.
