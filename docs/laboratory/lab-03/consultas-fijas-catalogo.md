# Consultas fijas del catálogo

## Requisito y alcance

La guía del Laboratorio 3, página 2 del PDF (página impresa 1), apartado
«Qué entregar», pide cuatro consultas de negocio con su SQL generado documentado:
dos en JPQL y dos dinámicas con Criteria/Specifications. En el stack NestJS/TypeORM
del proyecto, las dos consultas fijas del catálogo se expresan con
QueryBuilder parametrizado. La guía no exige endpoints para estas consultas.

Este bloque agrega únicamente `findAvailableByStore` y `findActiveByCategory`
en `ProductsRepository` y delegaciones del mismo nombre en `ProductsService`.
No cambia el controlador, DTO, API existente, entidades, esquema ni migraciones.
Las consultas dinámicas y el caso N+1 se documentan por separado.

## Consulta 1: productos disponibles de una tienda

- Método: `ProductsRepository.findAvailableByStore(idTienda)`.
- Servicio: `ProductsService.findAvailableByStore(idTienda)`.
- Criterio: misma tienda, estado `ACTIVO` y cantidad disponible estrictamente mayor
  que cero. No basta con estar activo para aparecer en esta consulta.
- Orden: `idProducto ASC`, para obtener un resultado determinista.
- Ejecución documentada: `findAvailableByStore(1)`.

SQL capturado realmente durante la ejecución por el logger de TypeORM; se añaden
solo saltos de línea y sangría para facilitar su lectura:

```sql
SELECT
  "producto"."id_producto" AS "producto_id_producto",
  "producto"."id_tienda" AS "producto_id_tienda",
  "producto"."id_categoria" AS "producto_id_categoria",
  "producto"."nombre" AS "producto_nombre",
  "producto"."descripcion" AS "producto_descripcion",
  "producto"."precio" AS "producto_precio",
  "producto"."cantidad_disponible" AS "producto_cantidad_disponible",
  "producto"."estado" AS "producto_estado",
  "producto"."fecha_publicacion" AS "producto_fecha_publicacion"
FROM "producto" "producto"
WHERE "producto"."id_tienda" = $1
  AND "producto"."estado" = $2
  AND "producto"."cantidad_disponible" > $3
ORDER BY "producto"."id_producto" ASC
```

Parámetros posicionales: `[1, "ACTIVO", 0]`.

Resultado: dos productos, en este orden:

| idProducto | nombre              | idTienda | idCategoria | precio (string) | cantidadDisponible | estado |
| ---------- | ------------------- | -------- | ----------- | --------------- | ------------------ | ------ |
| 1          | Cafe Chorotega      | 1        | 1           | `4500.00`       | 18                 | ACTIVO |
| 2          | Artesania de madera | 1        | 2           | `8000.00`       | 9                  | ACTIVO |

## Consulta 2: productos activos de una categoría

- Método: `ProductsRepository.findActiveByCategory(idCategoria)`.
- Servicio: `ProductsService.findActiveByCategory(idCategoria)`.
- Criterio: misma categoría y estado `ACTIVO`. No se exige cantidad mayor que
  cero; un producto activo sin existencias también cumple este criterio.
- Orden: `idProducto ASC`.
- Ejecución documentada: `findActiveByCategory(1)`.

SQL real capturado, con saltos de línea y sangría añadidos:

```sql
SELECT
  "producto"."id_producto" AS "producto_id_producto",
  "producto"."id_tienda" AS "producto_id_tienda",
  "producto"."id_categoria" AS "producto_id_categoria",
  "producto"."nombre" AS "producto_nombre",
  "producto"."descripcion" AS "producto_descripcion",
  "producto"."precio" AS "producto_precio",
  "producto"."cantidad_disponible" AS "producto_cantidad_disponible",
  "producto"."estado" AS "producto_estado",
  "producto"."fecha_publicacion" AS "producto_fecha_publicacion"
FROM "producto" "producto"
WHERE "producto"."id_categoria" = $1
  AND "producto"."estado" = $2
ORDER BY "producto"."id_producto" ASC
```

Parámetros posicionales: `[1, "ACTIVO"]`.

Resultado: `Cafe Chorotega`, idProducto `1`, idTienda `1`, idCategoria `1`,
precio `"4500.00"`, cantidad disponible `18` y estado `ACTIVO`.

Comprobaciones adicionales con el mismo SQL y distintos parámetros:

| Método                     | Parámetros enviados a PostgreSQL | Resultado                                                                        |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `findActiveByCategory(2)`  | `[2, "ACTIVO"]`                  | Artesania de madera, idProducto 2, precio `"8000.00"`, cantidad 9, estado ACTIVO |
| `findAvailableByStore(-1)` | `[-1, "ACTIVO", 0]`              | `[]`                                                                             |
| `findActiveByCategory(-1)` | `[-1, "ACTIVO"]`                 | `[]`                                                                             |

Los valores se envían separados del SQL; `$1`, `$2` y `$3` son sus posiciones.
Cambiar el identificador modifica los parámetros, no concatena valores en la
consulta. Ambas operaciones devuelven `Product[]` y conservan `precio` como string.

## Cómo se obtuvo la evidencia histórica

Comprobación realizada el 9 de septiembre de 2026, con TypeORM 1.1.0, en la base
local existente `chorotega_migrations_test`, host `localhost`, puerto `5432`,
`DATABASE_SSL=false`. Primero se comprobó que la base tenía las nueve tablas de
negocio, historial de migraciones y los dos productos ya sembrados.

Un script temporal creó un DataSource con `createDatabaseOptions` y una conexión
local explícita. Se conservó `synchronize: false` y `migrationsRun: false`, y se
forzó `default_transaction_read_only=on` en todas las conexiones. No se importó
`AppModule` ni se cargó `.env`, por lo que no se conectó a Supabase ni a MongoDB.

Se instanciaron `ProductsRepository` y `ProductsService` reales y se ejecutaron
los métodos del servicio. El callback `logQuery(query, parameters)` del logger de
TypeORM capturó el SQL y los parámetros enviados a PostgreSQL. Se comprobó una
sola sentencia por llamada, el resultado esperado a partir de los datos leídos,
el orden de los IDs y el tipo string del precio. Los productos quedaron iguales
antes y después de las consultas.

Docker Desktop estaba detenido; se inició y se levantó solo PostgreSQL utilizando
el volumen existente. El servicio queda encendido. No se recargaron seeds ni se
hicieron escrituras o modificaciones del esquema. El script y el JSON de captura
son temporales; esta documentación conserva la evidencia necesaria para revisión.

## Pruebas y comprobaciones

- `products.repository.spec.ts`: cuatro casos unitarios que construyen metadatos
  reales de TypeORM y capturan `getQueryAndParameters()` al interceptar `getMany`.
  No abren conexiones. Comprueban columnas de filtro, parámetros con distintos
  identificadores, el límite `> 0`, orden ascendente y ausencia del filtro de
  existencias en la consulta por categoría.
- `products.service.spec.ts`: nueve pruebas unitarias en total. Conservan las
  cinco anteriores y agregan delegación de ambas consultas con sus IDs, listas
  vacías y propagación de errores. Usan repositorios simulados.
- `npm test -- --runInBand`: dos suites, trece pruebas aprobadas.
- Prettier y ESLint sobre los cuatro archivos TypeScript afectados: correctos.
- `tsc --noEmit --incremental false -p tsconfig.json` y `npm run build`: correctos.
- Lecturas reales en PostgreSQL: las cinco llamadas documentadas pasaron.

La primera compilación detectó que faltaba instalar `mongodb`, ya declarado en el
lockfile por el trabajo integrado. Se ejecutó `npm ci` y las comprobaciones pasaron;
no se cambiaron `package.json`, el lockfile ni las versiones declaradas.

Los datos de aquella lectura contenían únicamente productos activos con existencias.
Los casos de inactivos y existencias cero ya se verifican con Testcontainers en
`catalog-repositories.integration-spec.ts`. La [validación final](validacion-final.md)
registra SQL, parámetros y resultados con los seeds actuales (existencias 17 y 8);
las cifras anteriores corresponden al escenario histórico del 9 de septiembre.
