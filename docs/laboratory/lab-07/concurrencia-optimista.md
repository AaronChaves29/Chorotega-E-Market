# Laboratorio 7: concurrencia optimista en productos

Implementación local del Bloque 4 sobre `866c3429a6a8976c622d1fd5351d609cb6c5f53b`,
en `feat/lab-07-security-concurrency`. No se ejecutaron migraciones ni operaciones
en servicios productivos.

## Requisito y operación elegida

La guía oficial `EIF509 Laboratorio 7 - Guía Completa.pdf`, página 2, apartado
«Qué entregar», pide versionado de una entidad, migración, conflicto 409 mediante
el manejador global y una prueba que lo provoque. La rúbrica de la página 3
asigna 2 puntos a concurrencia controlada. El PDF está disponible localmente en
Downloads; no se añade al repositorio.

La edición de productos tiene contención real: dos administradores pueden editar
el mismo stock o una compra puede descontarlo mientras se prepara una edición.
Se adapta `@Version` a `@VersionColumn` de TypeORM y la migración a TypeORM, de
acuerdo con el stack existente. Agregar el decorador sin comparar la versión al
escribir no evita una actualización perdida.

README y AUDITORIA-SEGURIDAD.md quedan para el bloque final, tal como se acordó.
No se modifican CI/CD, observabilidad, frontend ni el soporte de Chrome.

## Caminos de escritura revisados

- Creación REST y MVC: `ProductsService.create()` y
  `ProductsRepository.saveInAuthorizedStore()`. La versión inicial es 1.
- Edición REST: `ProductsService.update()` y
  `ProductsRepository.updateForActor()`. Exige versión esperada y propiedad.
- Compra: `OrdersService.createAndConfirm()` obtiene productos mediante
  `findByIdsForUpdate()`, con `FOR UPDATE` en orden ascendente por ID. Descuenta
  existencias y guarda mediante repositorios ligados al mismo EntityManager y
  transacción. TypeORM incrementa la columna de versión al hacer `save()`.
- Se retiró `ProductsRepository.updateById()`, un método sin consumidores actuales
  que permitía editar sin precondición. El guardado genérico sigue utilizándose
  para creación y para inventario bajo el bloqueo transaccional de pedidos.

No hay otros caminos actuales de modificación de existencias en el código de
producción inspeccionado. SQL manual, futuros métodos y futuras integraciones
deben respetar también la política de versión; el decorador no protege SQL externo.

## Columna y migración

`Product.version` utiliza `@VersionColumn({ type: 'int', default: 1 })`.
`1793296800000-AddProductVersion.ts` añade:

```sql
ALTER TABLE "producto" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
```

Los productos existentes reciben versión 1; se conservan IDs, precios y stock.
No se modifica ninguna migración anterior ni se ejecutan seeds. No se usa
`synchronize`. Se registra la nueva migración en las listas explícitas de
producción, Testcontainers y la prueba de navegador. El CLI existente también
la descubre por su patrón de archivos.

La prueba incremental revierte únicamente esta migración dentro de un contenedor
con datos, vuelve a aplicarla y comprueba que solo se ejecutó la migración nueva,
que conservó los registros y que una segunda ejecución no hace cambios.
La reversión elimina la columna; no debe ejecutarse en producción sin coordinar
una versión de aplicación compatible y respaldo. Este bloque no ejecuta esa reversión
fuera de la base efímera de pruebas.

## Contrato REST y compatibilidad

GET listado, GET detalle, POST y PATCH devuelven `version` como número entero en
`ProductResponseDto`. `precio` continúa siendo string. El mapper selecciona
campos explícitos y no expone relaciones.

PATCH `/api/v1/products/:id` requiere `version` en el body. Los campos del producto
siguen siendo opcionales: se conservan los omitidos. La versión debe ser un
entero entre 1 y 2147483647; no se convierte automáticamente desde string.

```http
PATCH /api/v1/products/42
Content-Type: application/json
Authorization: Bearer <token-obtenido-fuera-del-documento>

{"version": 1, "cantidadDisponible": 8}
```

Si guarda correctamente devuelve 200 y la versión 2. Un PATCH que solo envía
`version` también incrementa la versión: acepta y consume esa precondición aunque
no cambie otros campos. Repetirlo con la versión anterior produce conflicto.

Se eligió el body para reutilizar validación, DTO y OpenAPI existentes, sin añadir
encabezados condicionales ni modificar CORS. **Es un cambio obligatorio para los
clientes que editan**: PATCH sin versión devuelve 400. No se admite una versión
opcional ni se completa desde una lectura interna, porque permitiría sobrescribir
una edición preparada con datos antiguos.

La revisión del frontend actual encontró consultas GET de productos para crear
pedidos, pero ningún consumidor de PATCH de productos. No se modifican archivos
Next.js. Una futura pantalla de edición deberá conservar la versión recibida,
enviarla y, ante 409, recargar y pedir al usuario reconciliar sus cambios. No debe
reintentar automáticamente el mismo stock con una versión nueva.

MVC conserva sus dos casos actuales de listado y creación; no tiene formulario
de edición. La colección `docs/laboratory/lab-05/api.http` toma la versión de la
respuesta de GET para su PATCH. Swagger documenta el campo requerido y el 409.

## Actualización atómica y errores

La escritura hace un único UPDATE con valores parametrizados. Su condición
incluye el ID, la versión esperada, la propiedad de la tienda de origen y, en un
traslado realizado por EMPRENDEDOR, la propiedad de la tienda de destino. ADMIN
conserva administración global. La forma conceptual es:

```sql
UPDATE producto
SET cantidad_disponible = :stock, version = version + 1
WHERE id_producto = :id AND version = :versionEsperada
  -- Predicados EXISTS de propiedad cuando el actor es EMPRENDEDOR.
RETURNING *;
```

El incremento ocurre en PostgreSQL dentro de esa misma sentencia. `RETURNING`
construye la respuesta con la fila de esa escritura, evitando una segunda lectura
que pudiera observar otra modificación o un traslado posterior.

Si no se actualiza una fila, una consulta con alcance distingue un recurso no
visible de una versión obsoleta. El repositorio produce un error conocido de
versión; el servicio lo convierte a `ConflictException`. El filtro global existente
lo serializa como RFC 9457. Los errores desconocidos conservan el 500 seguro.

| Estado | Situación                                                           |
| ------ | ------------------------------------------------------------------- |
| 400    | ID, versión o campos del DTO inválidos; versión ausente.            |
| 401    | JWT ausente, inválido o identidad no vigente.                       |
| 403    | Rol sin permiso de escritura.                                       |
| 404    | Producto inexistente o ajeno; relación inexistente o no autorizada. |
| 409    | Producto autorizado cuya versión esperada ya no está vigente.       |

La validación HTTP ocurre antes del servicio: un DTO inválido puede producir 400
antes de comprobar si el recurso existe. Con entradas válidas, un usuario ajeno
recibe 404 aunque envíe una versión obsoleta.

Ejemplo de conflicto, sin SQL ni detalles internos:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "El producto cambió desde su lectura. Consulte la versión vigente antes de volver a editar.",
  "instance": "/api/v1/products/42"
}
```

## Compatibilidad con compras y transacciones

Se conservan la lógica de pedidos, los bloqueos pesimistas, el orden de adquisición
y el cálculo monetario exacto. El guardado de inventario incrementa la versión
por los metadatos TypeORM; las pruebas verifican ese comportamiento real.

- Si la compra bloquea primero, una edición espera. Al confirmar la compra,
  PostgreSQL reevalúa la condición de versión de la edición, que recibe 409 y no
  repone silenciosamente las unidades vendidas.
- Si la edición guarda primero, la compra espera y lee el stock y la versión
  vigentes al adquirir `FOR UPDATE`. Descuenta de ese stock e incrementa otra vez
  la versión.
- Si falla la confirmación después de guardar detalles e inventario, la misma
  transacción revierte pedido, detalles, stock e incremento de versión.

No se añaden bloqueos explícitos en la edición ni bloqueos de múltiples recursos.
El UPDATE adquiere su bloqueo de fila habitual. No hay reintentos automáticos.
La comparación en PostgreSQL funciona también entre distintas instancias de la
aplicación conectadas a la misma base; no depende de contadores en memoria.

## Pruebas reproducibles

`product-optimistic-concurrency.integration-spec.ts` usa NestJS, JWT real,
Supertest y PostgreSQL 16 temporal con las migraciones reales. Incluye:

- Dos sesiones leen versión 1: la primera guarda y la segunda recibe 409 sin
  sobrescribir; recargar la versión permite guardar después.
- Dos PATCH simultáneos: exactamente uno guarda y el otro recibe 409.
- Ausencia, null, cero, negativos, fracciones, strings y desbordamiento de versión.
- Conservación de 401, 403 y 404, incluso con versión obsoleta en recursos ajenos.
- PATCH de solo versión.
- Compra que bloquea primero y edición HTTP que espera: stock 5 → 3, versión 1 → 2,
  compra confirmada y edición rechazada.
- Edición transaccional que guarda primero y compra HTTP que espera: stock
  5 → 9 → 7, versión 1 → 2 → 3.

Las pruebas coordinan conexiones/transacciones reales y comprueban esperas en
`pg_stat_activity`. No sustituyen la persistencia por mocks. En el primer orden
se usa un spy que ejecuta el método SQL original y una barrera para mantener el
bloqueo hasta observar el UPDATE esperando; no cambia el resultado de negocio.
Las barreras no introducen esperas fijas para decidir quién gana. El segundo
orden mantiene la escritura real del repositorio en una transacción explícita.

`orders-business.integration-spec.ts` también comprueba la versión tras compra,
competencia por la última unidad y rollback posterior a escrituras reales.
`product-version-migration.integration-spec.ts` demuestra la actualización de datos
existentes. Las regresiones conservan los controles previos de propiedad, incluidos
traslados y cambios de propiedad mientras una escritura espera.

Comandos desde `apps/backend` con Node.js 22.22.0:

```sh
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
npm run test:cov -- --runInBand
npm run test:integration
npm run test:integration -- --testPathPatterns='product-optimistic-concurrency|product-version-migration|orders-business'
npm run test:browser
npm run test:deployment
```

Resultados locales finales con Node.js 22.22.0:

| Comprobación                                                                          | Resultado                                                      |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ESLint completo                                                                       | Aprobado                                                       |
| TypeScript sin emisión ni incremental                                                 | Aprobado                                                       |
| Build                                                                                 | Aprobado                                                       |
| Unitarias completas y cobertura existente                                             | 509/509, 39 suites                                             |
| Integración completa final                                                            | 634/634, 25 suites, aproximadamente 103 s                      |
| Selección inicial de concurrencia, migración, productos, propiedad, pedidos y esquema | 167/167, 6 suites                                              |
| Casos nuevos de concurrencia HTTP                                                     | 13/13, incluidos en la integración                             |
| Caso nuevo de migración con datos existentes                                          | 1/1, incluido en la integración                                |
| Chrome MVC                                                                            | 9 escenarios aprobados; Node cuenta 10 con el contenedor padre |
| Artefacto compilado                                                                   | 8/8; carga las cuatro migraciones JS                           |

Se añaden ocho casos unitarios y catorce de integración respecto al Bloque 3.
La cobertura de negocio configurada previamente conserva statements 97.50 %,
branches 84.63 %, functions 92.00 % y lines 97.74 %, sin alterar umbrales ni
exclusiones. Esa medición corresponde a pedidos y entregas, no a cobertura global
de productos.

Incidencias de ejecución:

- La primera ejecución unitaria dentro del sandbox no pudo abrir los sockets
  locales de Supertest (`listen EPERM`), con 461/509 aprobadas. La repetición
  con permiso para esos sockets aprobó 509/509 sin modificar las pruebas.
- La primera integración completa terminó 633/634 por `socket hang up` en
  `stores.integration-spec.ts`, caso PATCH con `productos: []`. Stores aislado
  aprobó 63/63 y la repetición completa aprobó 634/634. No se modificó Stores
  ni se demostró la causa del incidente; no se presenta como corregido.
- Chrome no presentó el incidente `Browser.getVersion` en esta ejecución. No se
  afirma una corrección de ese incidente ni un resultado remoto de GitHub Actions.

## Límites y pendientes

Antes de desplegar debe aplicarse la nueva migración por el mecanismo existente.
No se verificó ni modificó ninguna base remota. La aplicación nueva necesita la
columna; no debe publicarse saltando las migraciones.

Un 409 requiere reconciliación explícita del cliente. Una edición que cambia el
stock después de leer la versión vigente sigue siendo una operación administrativa
intencional; el mecanismo evita datos obsoletos, no decide el stock correcto por el
operador. DELETE no incorpora precondición de versión en este bloque.

No se afirma que CI haya ejecutado estos cambios sin publicar. El incidente previo
de arranque de Chrome se registrará por separado si aparece, sin modificar su
soporte ni atribuirlo a esta implementación sin evidencia.

## Archivos del bloque

La modificación local previa de `.gitignore` no forma parte de esta implementación.

- `apps/backend/src/database/migrations/1793296800000-AddProductVersion.ts`
- `apps/backend/src/database/production-migrations.spec.ts`
- `apps/backend/src/database/production-migrations.ts`
- `apps/backend/src/modules/products/dto/product-response.dto.ts`
- `apps/backend/src/modules/products/dto/update-product.dto.ts`
- `apps/backend/src/modules/products/entities/product.entity.ts`
- `apps/backend/src/modules/products/exceptions/product-version-conflict.error.ts`
- `apps/backend/src/modules/products/mappers/product.mapper.ts`
- `apps/backend/src/modules/products/products-rest.service.spec.ts`
- `apps/backend/src/modules/products/products.controller.ts`
- `apps/backend/src/modules/products/products.service.ts`
- `apps/backend/src/modules/products/repositories/products.repository.spec.ts`
- `apps/backend/src/modules/products/repositories/products.repository.ts`
- `apps/backend/test/browser/admin-mvc.browser.test.cjs`
- `apps/backend/test/deployment/compiled-deployment.test.cjs`
- `apps/backend/test/integration/catalog-repositories.integration-spec.ts`
- `apps/backend/test/integration/http/catalog-write-security.integration-spec.ts`
- `apps/backend/test/integration/http/openapi.integration-spec.ts`
- `apps/backend/test/integration/http/product-optimistic-concurrency.integration-spec.ts`
- `apps/backend/test/integration/http/products.integration-spec.ts`
- `apps/backend/test/integration/orders-business.integration-spec.ts`
- `apps/backend/test/integration/orders.integration-spec.ts`
- `apps/backend/test/integration/postgres-infrastructure.integration-spec.ts`
- `apps/backend/test/integration/product-version-migration.integration-spec.ts`
- `apps/backend/test/integration/production-migrations.integration-spec.ts`
- `apps/backend/test/support/postgres-test-database.ts`
- `docs/laboratory/lab-05/api.http`
- `docs/laboratory/lab-07/concurrencia-optimista.md`
