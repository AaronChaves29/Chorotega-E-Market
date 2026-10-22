# API REST de categorías

## Nueva política de seguridad de escrituras

POST, PATCH y DELETE requieren JWT y ADMIN. EMPRENDEDOR, CLIENTE y REPARTIDOR reciben 403. Los GET permanecen públicos. La autorización se aplica por método con JwtAuthGuard, RolesGuard y @Roles y se repite en el servicio con contexto obligatorio. Se conservan conflictos UNIQUE y FK reales.

JWT ausente, inválido o expirado: 401. Los errores reutilizan RFC 9457 Problem Details; inesperados: 500 seguro. Se conservan la validación, los DTOs, la paginación y los conflictos existentes.

La suite catalog-write-security.integration-spec.ts verifica permisos y propiedad con login real, PostgreSQL temporal y migraciones, sin desactivar guards. Las suites HTTP anteriores conservan sus contratos funcionales con JWT autorizado para escribir. Los resultados antiguos de este documento corresponden al bloque REST inicial, antes de esta nueva política.

## Base y reutilización

Implementación REST original sobre `develop` en `2d3ca485d66011bc40efbf7270678d5685db757b`.
Se reutilizan `configureHttp()`, el filtro Problem Details, `PaginationQueryDto`,
`PaginationResult`, el repositorio base y `createHttpTestApp()`. No se modifica
infraestructura compartida ni se agregan dependencias.

La organización `controllers/`, `services/`, `dtos/` y `mappers/`, el mapper
estático `toResponseDto`, `sortBy`/`sortDirection` y el encabezado `Location`
siguen las implementaciones recientes. El controlador usa `categories`, porque
`configureHttp()` ya añade `/api/v1`.

Hallazgo histórico del bloque inicial, ya corregido en develop: la inspección encontró prefijos `api/v1` repetidos en los controladores de
entregas, barrios y repartidores, además del prefijo global. Esa combinación
produciría rutas duplicadas. No se modifican esos módulos en este bloque; sus
pruebas unitarias actuales no verifican las rutas HTTP efectivas.

## Dominio y flujo

`HTTP → CategoriesController → CategoriesService → CategoriesRepository → PostgreSQL`.

La entidad y la migración real definen `idCategoria` como entero generado,
`nombre` obligatorio y único de hasta 100 caracteres, `descripcion` nullable de
hasta 255 caracteres y `estado` ACTIVA/INACTIVA, con ACTIVA como valor inicial.
`producto.id_categoria` referencia la categoría mediante `fk_producto_categoria`,
sin eliminación en cascada. Se mantienen entidad, esquema y migraciones.

## Endpoints

| Método | Ruta                     | Resultado                                                |
| ------ | ------------------------ | -------------------------------------------------------- |
| GET    | `/api/v1/categories`     | 200, colección paginada de DTOs                          |
| GET    | `/api/v1/categories/:id` | 200, DTO; 404 si no existe                               |
| POST   | `/api/v1/categories`     | 201, DTO y `Location: /api/v1/categories/{idCategoria}`  |
| PATCH  | `/api/v1/categories/:id` | 200, DTO; 404 si no existe                               |
| DELETE | `/api/v1/categories/:id` | 204 sin cuerpo; 404 si no existe; 409 si tiene productos |

Los identificadores deben ser enteros positivos dentro del rango de PostgreSQL
INTEGER. El parseo de ruta y la validación del rango producen 400 uniforme.

## DTOs y mapper

- `CreateCategoryDto`: nombre obligatorio, descripción y estado opcionales.
  Rechaza nombres vacíos o compuestos únicamente por espacios, longitudes
  excesivas, estados inválidos y propiedades adicionales. No transforma el nombre
  ni cambia las reglas de unicidad de PostgreSQL.
- `UpdateCategoryDto`: los tres campos son opcionales. Nombre y estado no aceptan
  null. `descripcion: null` borra la descripción. Un cuerpo vacío no cambia datos
  y devuelve el DTO existente, o 404 si no existe.
- `CategoryResponseDto`: exclusivamente `idCategoria`, `nombre`, `descripcion`
  y `estado`. `CategoryMapper` selecciona esos campos; no expone la entidad ni
  la relación `productos`.
- `CategorySearchQueryDto`: extiende la paginación compartida con filtros y orden.

PATCH construye un conjunto de cambios únicamente con los campos enviados y
utiliza UPDATE sobre esos campos. No reinserta una categoría inexistente ni
reemplaza otros campos con valores predeterminados. La respuesta se obtiene
mediante una lectura posterior; no se incorpora control de versiones concurrentes.

## Paginación, filtros y orden

Se conserva exactamente el contrato compartido:

```json
{
  "content": [],
  "page": 0,
  "size": 20,
  "totalElements": 0,
  "totalPages": 0
}
```

`page` es un entero desde 0; `size` es un entero entre 1 y 100, predeterminado 20.
`totalElements` cuenta las coincidencias de los filtros antes de paginar y
`totalPages` es el redondeo superior de total/tamaño. Una página fuera del
resultado devuelve `content: []` conservando los totales.

Filtros combinables:

- `nombre`: coincidencia parcial sin distinguir mayúsculas mediante ILIKE
  parametrizado. `%`, `_` y barra inversa se escapan como texto literal.
- `estado`: coincidencia exacta ACTIVA o INACTIVA.

`sortBy` permite `idCategoria`, `nombre` o `estado`; `sortDirection` acepta ASC o
DESC. Los valores predeterminados son `idCategoria` y ASC. El orden añade el
identificador como desempate cuando corresponde. Los nombres de columna salen
exclusivamente de un mapa interno; nunca se inserta una columna arbitraria del
cliente. QueryBuilder combina filtros, orden, `skip`, `take` y `getManyAndCount`:
la paginación ocurre en PostgreSQL, no mediante recortes en memoria.

Ejemplo: `/api/v1/categories?nombre=alf&estado=ACTIVA&page=1&size=1&sortBy=nombre&sortDirection=ASC`.

## Errores y eliminación

Se utiliza únicamente el filtro global existente y `application/problem+json`.

- 400: cuerpo, identificador, paginación, filtros o sort inválidos.
- 404: categoría inexistente en lectura, actualización o eliminación.
- 409 al crear/actualizar: código PostgreSQL 23505 **y** restricción
  `categoria_nombre_key`.
- 409 al eliminar: código PostgreSQL 23503 **y** restricción
  `fk_producto_categoria`.
- Cualquier otro fallo se propaga al mecanismo global; un fallo inesperado
  produce 500 seguro, sin publicar SQL ni detalles del driver.

La eliminación es física cuando no hay productos. Una prueba con usuario,
tienda y producto reales demuestra que la FK impide borrar y conserva tanto
categoría como producto. Las pruebas de duplicados usan la restricción real de
PostgreSQL en POST y PATCH. No se traduce cualquier error SQL a 409.

## Pruebas y aislamiento

Las nuevas unitarias verifican mapeo, defaults, PATCH, inexistencia, restricciones
conocidas, propagación de errores no clasificados y Location. Las pruebas HTTP
no usan mocks: ejecutan Nest, Supertest, el módulo real y PostgreSQL 16 temporal
con migraciones reales mediante el helper existente.

Los fixtures se insertan por HTTP o mediante el DataSource temporal. Entre casos
se vacían las nueve tablas de negocio del contenedor, conservando el historial
de migraciones. `afterAll` cierra aplicación, DataSource y contenedor. No se carga
`.env`, no se importan AppModule ni MongoDB, no se utilizan Supabase, bases locales,
Docker Compose, puertos fijos ni seeds.

La nueva suite cubre contratos de creación/lectura/PATCH/DELETE, datos inválidos,
conflictos reales, segunda página, páginas vacías, filtros combinados, orden en
ambas direcciones, desempate, consultas inválidas y tratamiento literal de
comodines/comillas. Las pruebas HTTP de la base continúan incluidas.

## Verificación local

El 6 de octubre de 2026:

- Antes de implementar: 151 unitarias en 15 suites aprobadas; ESLint aprobado.
- Después: 164 unitarias en 17 suites aprobadas, incluidas 13 nuevas de Categorías.
- Integración completa: 71 pruebas en 9 suites aprobadas; 16,886 segundos.
  Son las 28 integraciones existentes y 43 nuevas HTTP de Categorías.
- `npm run test:e2e`: 56 pruebas HTTP en 2 suites aprobadas, en 4,692 segundos.
  Repite las 13 HTTP de base y las 43 de Categorías; no son casos adicionales.
- Cobertura existente: statements 95,72 %, branches 88,69 %, functions 87,14 %,
  lines 96,07 %. No se cambiaron umbrales ni exclusiones; la selección sigue
  limitada a pedidos y entregas, no mide Categorías.
- TypeScript sin emisión, build, Prettier y ESLint aprobados tras corregir
  observaciones de tipado y formato en archivos nuevos.
- `git diff --check` sin errores y `docker ps` sin contenedores activos al finalizar.

## Fuera de alcance

No se modifica Auth, la emisión de JWT, entidades, migraciones, dependencias ni otros recursos. La nueva política agrega guards de escritura y autorización en el servicio; Swagger y la colección HTTP reflejan esos permisos. Los GET siguen públicos. La cobertura existente mide Orders/Deliveries y conserva su configuración. Las correcciones previas de rutas están integradas y no se alteran aquí.

La validación actual de seguridad está registrada en [Swagger/OpenAPI](swagger-openapi.md#verificación-de-seguridad-del-catálogo), incluyendo resultados, cobertura y límites técnicos.
