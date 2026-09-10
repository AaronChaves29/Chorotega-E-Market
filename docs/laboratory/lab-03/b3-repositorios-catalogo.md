# B3: repositorios concretos del catálogo

## Alcance

Este bloque implementa los cuatro repositorios del catálogo.
Se construye sobre B2, integrado en `upstream/develop` mediante el PR #27
(`4a60c91`), y reutiliza `TypeOrmBaseRepository` sin modificarla.

| Entidad    | Repositorio            | Condición de `whereId` | Módulo             |
| ---------- | ---------------------- | ---------------------- | ------------------ |
| `User`     | `UsersRepository`      | `{ idUsuario: id }`    | `UsersModule`      |
| `Store`    | `StoresRepository`     | `{ idTienda: id }`     | `StoresModule`     |
| `Category` | `CategoriesRepository` | `{ idCategoria: id }`  | `CategoriesModule` |
| `Product`  | `ProductsRepository`   | `{ idProducto: id }`   | `ProductsModule`   |

Todos los identificadores siguen siendo numéricos. Cada repositorio declara
su tipo mediante la propiedad de la entidad, por ejemplo `Product['idProducto']`.
Hereda `findAll`, `findById`, `save` y `deleteById` de la base genérica.

Cada módulo importa `TypeOrmModule.forFeature([Entidad])`, registra su repositorio
como proveedor y lo exporta. `AppModule` importa los cuatro módulos. Un futuro
módulo consumidor deberá importar el módulo que exporta el repositorio que
necesita. No se crearon servicios, controladores ni endpoints adicionales.

## Uso desde ProductsService

`ProductsService` ahora recibe `ProductsRepository` por inyección de NestJS.
Para listar, llama a `findAll`, heredado de la base. Para crear:

1. Conserva `idTienda` e `idCategoria` del DTO, convierte `precio` a string y
   aplica `descripcion: null` y `estado: 'ACTIVO'` cuando no se proporcionan.
2. Llama a `ProductsRepository.createEntity(data)` para construir un `Product`
   en memoria. Esta operación no consulta ni escribe en la base de datos.
3. Llama a `save(product)`, heredado de la base, y devuelve el resultado.

`NewProductData` usa `Pick<Product, ...>` para exigir los siete campos que prepara
el servicio. Conserva el precio como string y los IDs de tienda y categoría como
number; no incluye la PK generada, la fecha de publicación ni las relaciones.
Es un tipo de entrada de persistencia, no un nuevo DTO HTTP ni una validación en
ejecución. La API y el DTO existentes permanecen sin cambios.

El `Repository<Product>` de TypeORM permanece protegido dentro de la base.
Los servicios utilizan las operaciones públicas del repositorio concreto.

## Evidencia histórica de B3

- Prettier y ESLint sobre los archivos afectados: correctos.
- `npm run build` y `tsc --noEmit --incremental false -p tsconfig.json`: correctos.
- `npm test -- --runInBand`: cinco pruebas unitarias de `ProductsService`
  aprobadas. Las tres anteriores simulan ahora `ProductsRepository`; se agregan
  casos para los valores por defecto y para propagar un error al guardar.
- Comprobación temporal de tipos: `createEntity` exige los campos de entrada,
  conserva sus tipos y el repositorio interno no es accesible públicamente.
- Un módulo temporal de NestJS importa los cuatro módulos reales con una conexión
  TypeORM explícita a `localhost:5432/chorotega_migrations_test`, sin SSL y en
  modo de solo lectura. Un proveedor consumidor recibe los cuatro repositorios,
  comprobando también sus exportaciones entre módulos.
- Los repositorios recuperaron tres usuarios, una tienda, dos categorías y dos
  productos. `findById` encontró registros mediante cada clave real y devolvió
  `null` para identificadores inexistentes.
- `ProductsService.findAll` funcionó con su dependencia real. Los precios siguieron
  siendo string y las relaciones no se cargaron automáticamente.
- `ProductsRepository.createEntity` produjo una instancia de `Product` sin emitir
  SQL. Las cantidades de registros permanecieron iguales antes y después.

La comprobación temporal importa los módulos del catálogo con su propia
configuración; no arranca el servidor HTTP ni importa `AppModule`, para evitar
la carga de `.env`. No se conectó a Supabase ni se ejecutaron seeds, migraciones,
escrituras o eliminaciones. El script temporal no forma parte de la suite.

Las cinco pruebas unitarias usan mocks; no prueban persistencia real. La
verificación real de `save` y `deleteById` se incorporó después en las pruebas
con Testcontainers. Los resultados actuales están en la [validación final](validacion-final.md).

## Repositorios integrados

Además del catálogo, existen `NeighborhoodsRepository`, `OrdersRepository`,
`OrderDetailsRepository`, `CouriersRepository` y `DeliveriesRepository`, cada uno
con su módulo NestJS y su entidad PostgreSQL. Los nueve utilizan la base genérica.

`OrderAuditsRepository` implementa las operaciones específicas de la colección
MongoDB `bitacora_pedidos`: lectura por `pedidoId`, reemplazo con upsert y adición
de eventos. Utiliza `MongoDatabaseService` mediante `OrderAuditsModule` y no hereda
la implementación TypeORM.

Las cuatro consultas de negocio, la corrección N+1 y las seis pruebas funcionales
están integradas. Esta documentación conserva arriba la evidencia de B3 y no
representa el conteo de pruebas actual.
