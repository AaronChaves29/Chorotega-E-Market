import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from '@jest/globals';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { CategoriesRepository } from '../../src/modules/categories/repositories/categories.repository';
import { Product } from '../../src/modules/products/entities/product.entity';
import { ProductsRepository } from '../../src/modules/products/repositories/products.repository';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { StoresRepository } from '../../src/modules/stores/repositories/stores.repository';
import { User } from '../../src/modules/users/entities/user.entity';
import { UsersRepository } from '../../src/modules/users/repositories/users.repository';
import {
  type PostgresTestDatabase,
  startPostgresTestDatabase,
} from '../support/postgres-test-database';

describe('Repositorios del catálogo: integración funcional', () => {
  let database: PostgresTestDatabase | undefined;
  let categories: CategoriesRepository;
  let products: ProductsRepository;
  let stores: StoresRepository;
  let users: UsersRepository;

  beforeAll(async () => {
    database = await startPostgresTestDatabase();
    const { dataSource } = database;
    categories = new CategoriesRepository(dataSource.getRepository(Category));
    products = new ProductsRepository(dataSource.getRepository(Product));
    stores = new StoresRepository(dataSource.getRepository(Store));
    users = new UsersRepository(dataSource.getRepository(User));
  });

  afterEach(async () => {
    if (!database) return;
    // Solo tablas de negocio de este contenedor; se conserva el historial de migraciones.
    await database.dataSource.query(`
      TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor,
        barrio, producto, categoria, tienda, usuario RESTART IDENTITY
    `);
    expect(
      await database.dataSource.query<{ name: string }[]>(
        'SELECT name FROM typeorm_migrations ORDER BY id',
      ),
    ).toEqual([
      { name: 'CreateInitialSchema1788732000000' },
      { name: 'AlignTimestampDefaults1788998400000' },
    ]);
  });

  afterAll(async () => {
    await database?.stop();
  });

  async function createCatalog() {
    const owner = await users.save(
      Object.assign(new User(), {
        authId: '00000000-0000-4000-8000-000000000001',
        nombre: 'Comerciante',
        apellido: 'Prueba',
        correo: 'catalogo@example.test',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      } satisfies Partial<User>),
    );
    const firstStore = await stores.save(
      Object.assign(new Store(), {
        idEmprendedor: owner.idUsuario,
        nombre: 'Tienda principal',
        direccion: 'Dirección de prueba 1',
        estado: 'ACTIVA',
      } satisfies Partial<Store>),
    );
    const otherStore = await stores.save(
      Object.assign(new Store(), {
        idEmprendedor: owner.idUsuario,
        nombre: 'Otra tienda',
        direccion: 'Dirección de prueba 2',
        estado: 'ACTIVA',
      } satisfies Partial<Store>),
    );
    const firstCategory = await categories.save(
      Object.assign(new Category(), { nombre: 'Alimentos', estado: 'ACTIVA' }),
    );
    const otherCategory = await categories.save(
      Object.assign(new Category(), { nombre: 'Artesanías', estado: 'ACTIVA' }),
    );
    return { firstStore, otherStore, firstCategory, otherCategory };
  }

  async function saveProduct(
    idProducto: Product['idProducto'],
    store: Store,
    category: Category,
    cantidadDisponible: number,
    estado = 'ACTIVO',
  ): Promise<void> {
    const product = products.createEntity({
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      nombre: `Producto ${idProducto}`,
      descripcion: null,
      precio: '1250.50',
      cantidadDisponible,
      estado,
    });
    // save genera la PK al insertar. El fixture incluye explícitamente esa columna
    // para comprobar el orden independientemente del orden de inserción.
    product.idProducto = idProducto;
    await database!.dataSource
      .createQueryBuilder()
      .insert()
      .into(Product, [
        'idProducto',
        'idTienda',
        'idCategoria',
        'nombre',
        'descripcion',
        'precio',
        'cantidadDisponible',
        'estado',
      ])
      .values(product)
      .execute();
  }

  it('inserta, lee, actualiza y elimina una categoría mediante la base genérica', async () => {
    expect(await categories.findAll()).toEqual([]);
    const category = await categories.save(
      Object.assign(new Category(), {
        nombre: 'Categoría inicial',
        descripcion: null,
        estado: 'ACTIVA',
      }),
    );
    const id = category.idCategoria;
    expect(id).toBeGreaterThan(0);
    expect(await categories.findById(id)).toEqual(category);
    expect(await categories.findAll()).toEqual([category]);

    category.nombre = 'Categoría actualizada';
    category.descripcion = 'Descripción actualizada';
    const updated = await categories.save(category);
    expect(updated.idCategoria).toBe(id);
    expect(await categories.findById(id)).toMatchObject({
      idCategoria: id,
      nombre: 'Categoría actualizada',
      descripcion: 'Descripción actualizada',
    });
    expect(await categories.findAll()).toEqual([updated]);

    expect(await categories.deleteById(id)).toBe(true);
    expect(await categories.findById(id)).toBeNull();
    expect(await categories.findAll()).toEqual([]);
    expect(await categories.deleteById(id)).toBe(false);
    expect(await categories.deleteById(-1)).toBe(false);
  });

  it('devuelve solo productos activos con existencias de la tienda, ordenados por ID', async () => {
    const { firstStore, otherStore, firstCategory, otherCategory } =
      await createCatalog();
    await saveProduct(20, firstStore, firstCategory, 5);
    await saveProduct(10, firstStore, otherCategory, 1);
    await saveProduct(30, firstStore, firstCategory, 0);
    await saveProduct(40, firstStore, firstCategory, 5, 'INACTIVO');
    await saveProduct(50, otherStore, firstCategory, 5);

    const result = await products.findAvailableByStore(firstStore.idTienda);
    expect(result.map((product) => product.idProducto)).toEqual([10, 20]);
    expect(result.map((product) => product.precio)).toEqual([
      '1250.50',
      '1250.50',
    ]);
    expect(await products.findAvailableByStore(-1)).toEqual([]);
  });

  it('devuelve productos activos de la categoría incluso sin existencias, ordenados por ID', async () => {
    const { firstStore, otherStore, firstCategory, otherCategory } =
      await createCatalog();
    await saveProduct(20, otherStore, firstCategory, 0);
    await saveProduct(10, firstStore, firstCategory, 5);
    await saveProduct(30, firstStore, firstCategory, 5, 'INACTIVO');
    await saveProduct(40, firstStore, otherCategory, 5);

    const result = await products.findActiveByCategory(
      firstCategory.idCategoria,
    );
    expect(result.map((product) => product.idProducto)).toEqual([10, 20]);
    expect(result.map((product) => product.cantidadDisponible)).toEqual([5, 0]);
    expect(result.map((product) => product.precio)).toEqual([
      '1250.50',
      '1250.50',
    ]);
    expect(await products.findActiveByCategory(-1)).toEqual([]);
  });
});
