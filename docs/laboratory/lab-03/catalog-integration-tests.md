# Pruebas funcionales de integración del catálogo

## Alcance

`apps/backend/test/integration/catalog-repositories.integration-spec.ts` agrega
tres pruebas funcionales con los repositorios reales del catálogo y PostgreSQL 16.
Reutiliza `test/support/postgres-test-database.ts`, el DataSource de pruebas y las
migraciones reales `CreateInitialSchema1788732000000` y
`AlignTimestampDefaults1788998400000`, con `synchronize: false`.
No utiliza mocks ni modifica código de producción.

Después de actualizar `develop` (`ddf46df`) se encontraron dos pruebas de
infraestructura y ninguna prueba funcional de integración. Actualmente hay
seis funcionales (tres del catálogo y tres en `orders.integration-spec.ts`)
y tres de infraestructura, nueve en total, incluida la validación automática
del esquema.

## Casos cubiertos

1. **Operaciones de la base genérica mediante CategoriesRepository.** Inserta una
   categoría con `save`, la recupera con `findById` y `findAll`, actualiza su nombre
   y descripción conservando la clave primaria y comprueba que no se duplicó.
   `deleteById` devuelve `true` al eliminarla; la lectura posterior devuelve
   `null`. Repetir la eliminación y eliminar un identificador inexistente devuelven
   `false`.
2. **Productos disponibles de una tienda.** `findAvailableByStore` devuelve solo
   productos de esa tienda con estado `ACTIVO` y existencias mayores que cero.
   Excluye productos sin existencias, inactivos y de otra tienda. Los dos productos
   válidos se insertan con IDs 20 y 10, en ese orden, y se esperan como `[10, 20]`.
   Pertenecen a categorías distintas para comprobar que no se limita la categoría.
   Una tienda inexistente devuelve `[]`.
3. **Productos activos de una categoría.** `findActiveByCategory` incluye el
   producto activo con existencias y el activo con existencias cero, aunque sean
   de tiendas distintas. Excluye el inactivo y el de otra categoría. También se
   insertan los resultados válidos en orden 20, 10 y se esperan como `[10, 20]`.
   Una categoría inexistente devuelve `[]`.

Las dos consultas comprueban que el precio leído sigue siendo el string
`"1250.50"`. Los identificadores conservan los tipos numéricos de las entidades
actuales.

## Aislamiento y ciclo de vida

- `beforeAll` inicia un contenedor para las tres pruebas de esta suite. Los
  repositorios concretos reciben los repositorios de su DataSource real.
- El helper obtiene la URL dinámica directamente de Testcontainers, desactiva SSL
  y ejecuta las migraciones. No importa el DataSource de la CLI ni AppModule,
  no carga `.env` y no utiliza conexiones externas.
- Cada caso prepara sus datos mínimos. Las consultas usan un usuario, dos tiendas
  y dos categorías; todos respetan las claves foráneas y restricciones reales.
  No se cargan seeds globales ni se usa la base de desarrollo.
- Los productos del escenario se insertan con QueryBuilder y columnas explícitas,
  incluida `idProducto`, para conservar los IDs deterministas. Con TypeORM 1.1.0,
  `save` genera esa PK al insertar; por eso se usa esta preparación explícita.
  Las operaciones verificadas siguen siendo las de los repositorios reales.
- `afterEach` ejecuta `TRUNCATE ... RESTART IDENTITY` sobre las nueve tablas de
  negocio del contenedor, incluso si falla una aserción. Conserva
  `typeorm_migrations` y comprueba que ambas migraciones siguen registradas.
  No cambia ni elimina el esquema.
- `afterAll` llama a `stop()`, que cierra el DataSource y detiene y elimina el
  contenedor. El helper existente también limpia si falla la inicialización.
  Un cierre forzado del proceso depende de la limpieza auxiliar de Testcontainers.

El estado se limita a esta suite; no hay un singleton compartido entre archivos.
Las tres pruebas de infraestructura verifican tablas, migraciones, limpieza
(incluido un fallo intencional) y compatibilidad del esquema con los metadatos
TypeORM. No cuentan como pruebas funcionales.

## Ejecución local y CI

Requisitos: Node.js >=22.22.0, dependencias instaladas mediante `npm ci` y Docker
activo. Desde `apps/backend`:

```bash
npm test -- --runInBand
npm run test:integration
```

El primer comando ejecuta las unitarias sin Docker. El segundo descubre
`test/integration/**/*.integration-spec.ts`, en serie, con el timeout existente
de 180 segundos por prueba o hook y 120 segundos para iniciar PostgreSQL.
No necesita Docker Compose ni puertos fijos.

El job del backend en `.github/workflows/ci.yml` fija Node.js `22.22.0`, versión
[publicada oficialmente](https://nodejs.org/en/blog/release/v22.22.0) que cumple
`engines.node: >= 22.22` del paquete instalado `testcontainers` 12.1.0.
Conserva `npm ci`, lint, build, pruebas unitarias y las validaciones existentes de
migraciones y seeds sobre el servicio PostgreSQL propio del job. Agrega
`npm run test:integration` como paso independiente, sin ocultar fallos.
Testcontainers utiliza Docker del runner para crear sus propios recursos y no
consume ese servicio ni sus seeds. El job del frontend conserva su configuración.

La configuración de Jest ya descubre automáticamente los archivos nuevos que
cumplan el patrón y ejecuta las seis pruebas funcionales integradas sin una
lista manual de suites.

## Evidencia histórica del bloque de catálogo

Ejecución local del 10 de septiembre de 2026 con Node.js 26.0.0:

| Comprobación                                                | Resultado                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Prettier sobre los archivos modificados                     | Correcto; en Markdown se conserva el código de ejemplo existente    |
| ESLint sobre todo el TypeScript del backend                 | Correcto, sin errores ni advertencias                               |
| `npx tsc --noEmit --incremental false -p tsconfig.json`     | Correcto                                                            |
| `npm run build`                                             | Correcto                                                            |
| `npm test -- --runInBand`                                   | 13 unitarias aprobadas en 2 suites; 0,345 s                         |
| `npm run test:integration -- --runInBand`                   | 3 funcionales y 2 de infraestructura aprobadas en 2 suites; 4,569 s |
| Parseo del YAML de CI                                       | Correcto; un solo paso de integración y Node 22.22.0 en backend     |
| `git diff --check`                                          | Correcto                                                            |
| `docker ps` al terminar                                     | Ningún contenedor activo                                            |
| Filtro `chorotega.test-suite=integration` en `docker ps -a` | Ningún contenedor de pruebas restante                               |

La primera ejecución detectó que `save` no conservaba los IDs explícitos del
fixture. Se corrigió únicamente la preparación de datos con QueryBuilder y se
repitieron las verificaciones; los resultados de la tabla corresponden al código
corregido.

Los resultados anteriores pertenecen al bloque inicial del catálogo. La
[validación final](validacion-final.md) registra la ejecución conjunta de las seis
funcionales y tres de infraestructura, así como el CI anterior aprobado con
Node 22.22.0. La nueva migración solo alinea defaults; el CI del PR que incorpora
la tercera prueba de infraestructura debe confirmarse.
