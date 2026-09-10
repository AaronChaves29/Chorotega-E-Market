# B2: repositorio base genérico

## Requisito y alcance

La guía del Laboratorio 3 pide un repositorio base genérico y repositorios
específicos por entidad, incluido el subdominio MongoDB. No enumera operaciones
obligatorias ni exige contratos separados de lectura y escritura. La adaptación
a NestJS y TypeORM sigue la aprobación documentada en
[ADR-001](../../adr/ADR-001-Seleccion-Stack-Tecnologico.md).

Para este bloque se eligen cuatro operaciones comunes. Esta selección es una
decisión del proyecto, no una lista de métodos impuesta por el profesor:

| Operación        | Resultado                                                              |
| ---------------- | ---------------------------------------------------------------------- |
| `findAll()`      | Lista de entidades; lista vacía si no hay registros.                   |
| `findById(id)`   | Entidad o `null` si no existe.                                         |
| `save(entity)`   | Entidad guardada; TypeORM inserta o actualiza según su clave primaria. |
| `deleteById(id)` | `true` si eliminó un registro; `false` si no existía.                  |

`BaseRepository<TEntity, TId>` es el contrato independiente del ORM.
`TypeOrmBaseRepository<TEntity, TId>` comparte la implementación para TypeORM.
El subdominio MongoDB dispone de `OrderAuditsRepository`, con operaciones
específicas por `pedidoId`. No hereda la base TypeORM ni implementa este contrato
CRUD: usa el driver MongoDB y devuelve `void` en `save`.

La base no agrega filtros de negocio, paginación ni endpoints. Los nueve
repositorios PostgreSQL la utilizan; `ProductsService` inyecta `ProductsRepository`.

## Genéricos e identificadores

`TEntity` representa la entidad y `TId` el tipo de su identificador. Por ejemplo,
para productos son `Product` y `Product['idProducto']` (actualmente `number`).
El compilador conserva esos tipos en los parámetros y resultados.

Las claves del catálogo son `idUsuario`, `idTienda`, `idCategoria` e
`idProducto`, todas numéricas. No se supone que exista una propiedad `id`.
Cada repositorio concreto implementa `whereId` para traducir el identificador
a su columna de entidad. Este método debe devolver exclusivamente la condición
de la clave primaria completa, nunca un filtro vacío o de negocio.

Extracto del patrón utilizado por `ProductsRepository` en NestJS:

```typescript
@Injectable()
export class ProductsRepository extends TypeOrmBaseRepository<
  Product,
  Product["idProducto"]
> {
  constructor(@InjectRepository(Product) repository: Repository<Product>) {
    super(repository);
  }

  protected whereId(id: Product["idProducto"]): FindOptionsWhere<Product> {
    return { idProducto: id };
  }
}
```

El módulo registra el repositorio concreto como proveedor y conserva
`TypeOrmModule.forFeature([Product])`. El servicio inyecta ese proveedor.
La interfaz genérica no es un token de inyección: los tipos TypeScript no existen
en ejecución. La clase base recibe el repositorio por constructor y no abre
conexiones por su cuenta.

Para guardar un producto nuevo, el repositorio concreto lo construye mediante
`createEntity`, que usa `repository.create(...)`, y luego se pasa a `save`.
`create` solo construye el objeto;
`save` persiste los datos. El precio de `Product` continúa siendo `string`.

## Comportamiento y límites

Las lecturas no solicitan relaciones automáticamente. `save` conserva la
semántica de TypeORM: no es una operación exclusiva de inserción ni una
actualización que falle cuando el registro no existe.

`deleteById` elimina físicamente; no cambia `estado`. Las claves foráneas pueden
impedir la eliminación. Los errores de PostgreSQL se propagan al llamador, sin
convertirse en `false`. Esta base no decide reglas de autorización, bajas lógicas
ni respuestas HTTP.

La implementación no cambia cascadas, esquema, migraciones ni configuración de
conexión. La base TypeORM se utiliza para los repositorios PostgreSQL; no se
afirma compatibilidad de su implementación con MongoDB.

La persistencia se verifica con Testcontainers mediante `CategoriesRepository`.
Las pruebas unitarias existentes de `ProductsService` usan mocks y no sustituyen esas pruebas de integración.

## Evidencia histórica de B2

- `npm run build` y `tsc --noEmit --incremental false -p tsconfig.json`: correctos.
- ESLint y Prettier sobre los archivos nuevos: correctos.
- `npm test -- --runInBand`: pasan las tres pruebas unitarias existentes de
  `ProductsService`; no son pruebas del repositorio base.
- Comprobación temporal de tipos: un ejemplo con `Product` implementa el contrato
  y rechaza identificadores string, precio numérico y una condición `{ id: 1 }`.
- Comprobación temporal contra `chorotega_migrations_test`, en
  `localhost:5432`, con SSL desactivado y conexiones de solo lectura: `findAll`
  recuperó dos productos y tres usuarios; `findById` encontró registros mediante
  `idProducto` e `idUsuario` y devolvió `null` para identificadores inexistentes.
  El precio siguió siendo string y las relaciones no se cargaron automáticamente.

Las comprobaciones temporales no forman parte de la suite ni se agregan al
repositorio. No se cargó `.env` ni se ejecutaron escrituras contra PostgreSQL;
la verificación real de `save` y `deleteById` se incorporó después en
`catalog-repositories.integration-spec.ts`. Véase la [validación final](validacion-final.md).
