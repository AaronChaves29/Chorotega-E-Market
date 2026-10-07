import request from 'supertest';
import { ProductsModule } from '../../../src/modules/products/products.module';
import type { ProductResponseDto } from '../../../src/modules/products/dto/product-response.dto';
import type { PaginationResult } from '../../../src/common/pagination/pagination-result';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { OrderDetail } from '../../../src/modules/order-details/entities/order-detail.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

type ProductJson = Omit<ProductResponseDto, 'fechaPublicacion'> & {
  fechaPublicacion: string;
};

describe('Productos: API real con PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  let store: Store;
  let otherStore: Store;
  let category: Category;
  let otherCategory: Category;
  let owner: User;
  const path = '/api/v1/products';
  beforeAll(async () => {
    context = await createHttpTestApp([ProductsModule]);
  });
  beforeEach(async () => {
    const ds = context!.database.dataSource;
    owner = await ds.getRepository(User).save({
      authId: '00000000-0000-4000-8000-000000000001',
      nombre: 'Usuario',
      apellido: 'Prueba',
      correo: 'productos@example.test',
      rol: 'EMPRENDEDOR',
    });
    store = await ds.getRepository(Store).save({
      idEmprendedor: owner.idUsuario,
      nombre: 'Tienda A',
      direccion: 'Dirección',
    });
    otherStore = await ds.getRepository(Store).save({
      idEmprendedor: owner.idUsuario,
      nombre: 'Tienda B',
      direccion: 'Dirección',
    });
    category = await ds.getRepository(Category).save({ nombre: 'Categoría A' });
    otherCategory = await ds
      .getRepository(Category)
      .save({ nombre: 'Categoría B' });
  });
  afterEach(async () => {
    await context?.database.dataSource.query(
      `TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda, usuario RESTART IDENTITY`,
    );
  });
  afterAll(async () => {
    await context?.close();
  });
  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }
  function input() {
    return {
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Producto',
      precio: 10.25,
      cantidadDisponible: 3,
    };
  }
  async function create(
    overrides: Record<string, unknown> = {},
  ): Promise<ProductJson> {
    const response = await request(server())
      .post(path)
      .send({ ...input(), ...overrides })
      .expect(201);
    return response.body as ProductJson;
  }
  async function list(
    query: Record<string, string | number | boolean> = {},
  ): Promise<PaginationResult<ProductJson>> {
    const response = await request(server()).get(path).query(query).expect(200);
    return response.body as PaginationResult<ProductJson>;
  }
  function problem(response: request.Response, status: number) {
    expect(response.headers['content-type']).toMatch(
      /application\/problem\+json/,
    );
    expect(response.body).toMatchObject({
      type: 'about:blank',
      status,
      title: expect.any(String) as string,
      detail: expect.any(String) as string,
      instance: expect.any(String) as string,
    });
    expect(response.text).not.toMatch(
      /QueryFailedError|SELECT |INSERT INTO|DELETE FROM|driverError|stack|fk_detalle_producto|fk_producto_/,
    );
  }
  async function catalog() {
    const a = await create({ nombre: 'Alfa', precio: 10.25 });
    const b = await create({
      nombre: 'Beta',
      precio: 2.5,
      cantidadDisponible: 0,
    });
    const c = await create({
      nombre: 'Inactivo',
      precio: 100,
      estado: 'INACTIVO',
    });
    const d = await create({
      nombre: 'Otra tienda',
      idTienda: otherStore.idTienda,
    });
    const e = await create({
      nombre: 'Otra categoría',
      idCategoria: otherCategory.idCategoria,
    });
    const f = await create({
      nombre: 'Agotado',
      estado: 'AGOTADO',
      cantidadDisponible: 0,
    });
    const g = await create({ nombre: 'Alfa segundo', precio: 10.25 });
    return { a, b, c, d, e, f, g };
  }

  it('POST devuelve 201, Location utilizable, DTO y precio string', async () => {
    const response = await request(server())
      .post(path)
      .send(input())
      .expect(201);
    const product = response.body as ProductJson;
    expect(product).toEqual({
      ...input(),
      precio: '10.25',
      descripcion: null,
      estado: 'ACTIVO',
      idProducto: expect.any(Number) as number,
      fechaPublicacion: expect.any(String) as string,
    });
    expect(response.headers.location).toBe(`${path}/${product.idProducto}`);
    await request(server())
      .get(`${path}/${product.idProducto}`)
      .expect(200)
      .expect(product);
  });

  it.each([
    { precio: 0 },
    { precio: '10.25' },
    { precio: 1.001 },
    { precio: 100000000 },
    { cantidadDisponible: -1 },
    { cantidadDisponible: 0.5 },
    { cantidadDisponible: 2147483648 },
    { estado: 'INVALIDO' },
    { estado: null },
    { nombre: '' },
    { nombre: 'x'.repeat(151) },
    { descripcion: 'x'.repeat(501) },
    { idTienda: 0 },
    { idCategoria: 2147483648 },
    { idProducto: 42 },
  ])('POST rechaza entrada inválida %j', async (body) => {
    problem(
      await request(server())
        .post(path)
        .send({ ...input(), ...body })
        .expect(400),
      400,
    );
  });

  it.each(['idTienda', 'idCategoria'] as const)(
    'POST devuelve 404 para %s inexistente',
    async (field) => {
      problem(
        await request(server())
          .post(path)
          .send({ ...input(), [field]: 999 })
          .expect(404),
        404,
      );
      expect((await list()).totalElements).toBe(0);
    },
  );

  it('no inventa unicidad por nombre ni exige existencias positivas para crear', async () => {
    await create({ cantidadDisponible: 0 });
    await create({ cantidadDisponible: 0 });
    expect((await list()).totalElements).toBe(2);
  });

  it('GET inexistente devuelve 404', async () => {
    problem(await request(server()).get(`${path}/999`).expect(404), 404);
  });

  it.each(['abc', '1.5', '0', '-1', '2147483648'])(
    'rechaza ID %s',
    async (id) => {
      problem(await request(server()).get(`${path}/${id}`).expect(400), 400);
    },
  );

  it('PATCH actualiza parcialmente y permite limpiar descripción sin perder otros datos', async () => {
    const product = await create({ descripcion: 'Texto' });
    const response = await request(server())
      .patch(`${path}/${product.idProducto}`)
      .send({ descripcion: null, precio: 2.5 })
      .expect(200);
    expect(response.body).toEqual({
      ...product,
      descripcion: null,
      precio: '2.50',
    });
    await request(server())
      .get(`${path}/${product.idProducto}`)
      .expect(200)
      .expect(response.body as ProductJson);
    await request(server())
      .patch(`${path}/${product.idProducto}`)
      .send({})
      .expect(200)
      .expect(response.body as ProductJson);
  });

  it('PATCH permite cambiar relaciones existentes y campos editables', async () => {
    const product = await create();
    const changes = {
      idTienda: otherStore.idTienda,
      idCategoria: otherCategory.idCategoria,
      nombre: 'Nuevo',
      cantidadDisponible: 0,
      estado: 'AGOTADO',
    };
    await request(server())
      .patch(`${path}/${product.idProducto}`)
      .send(changes)
      .expect(200)
      .expect({ ...product, ...changes });
  });

  it('PATCH inexistente devuelve 404 sin insertar', async () => {
    problem(
      await request(server())
        .patch(`${path}/999`)
        .send({ nombre: 'Nuevo' })
        .expect(404),
      404,
    );
    expect((await list()).content).toEqual([]);
  });

  it.each(['idTienda', 'idCategoria'] as const)(
    'PATCH rechaza %s inexistente y conserva el producto',
    async (field) => {
      const product = await create();
      problem(
        await request(server())
          .patch(`${path}/${product.idProducto}`)
          .send({ [field]: 999 })
          .expect(404),
        404,
      );
      await request(server())
        .get(`${path}/${product.idProducto}`)
        .expect(200)
        .expect(product);
    },
  );

  it.each([
    { precio: null },
    { estado: null },
    { idCategoria: null },
    { cantidadDisponible: -1 },
    { precio: 1.001 },
    { fechaPublicacion: '2020-01-01' },
  ])('PATCH rechaza %j', async (body) => {
    const product = await create();
    problem(
      await request(server())
        .patch(`${path}/${product.idProducto}`)
        .send(body)
        .expect(400),
      400,
    );
  });

  it('DELETE devuelve 204 vacío y elimina un producto sin referencias', async () => {
    const product = await create();
    expect(
      (
        await request(server())
          .delete(`${path}/${product.idProducto}`)
          .expect(204)
      ).text,
    ).toBe('');
    await request(server()).get(`${path}/${product.idProducto}`).expect(404);
  });

  it('DELETE inexistente devuelve 404', async () => {
    problem(await request(server()).delete(`${path}/999`).expect(404), 404);
  });

  it('DELETE con detalle real devuelve 409 y conserva producto y detalle', async () => {
    const product = await create();
    const ds = context!.database.dataSource;
    const neighborhood = await ds
      .getRepository(Neighborhood)
      .save({ nombre: 'Barrio', tarifaEnvio: '0.00' });
    const order = await ds.getRepository(Order).save({
      idCliente: owner.idUsuario,
      idTienda: store.idTienda,
      idBarrio: neighborhood.idBarrio,
      direccionEntrega: 'Dirección',
      subtotal: '10.25',
      tarifaEnvio: '0.00',
      total: '10.25',
    });
    const detail = await ds.getRepository(OrderDetail).save({
      idPedido: order.idPedido,
      idProducto: product.idProducto,
      cantidad: 1,
      precioUnitario: '10.25',
      subtotal: '10.25',
    });
    problem(
      await request(server())
        .delete(`${path}/${product.idProducto}`)
        .expect(409),
      409,
    );
    await request(server())
      .get(`${path}/${product.idProducto}`)
      .expect(200)
      .expect(product);
    expect(
      await ds
        .getRepository(OrderDetail)
        .findOneBy({ idDetalle: detail.idDetalle }),
    ).not.toBeNull();
  });

  it('pagina con defaults, segunda página y página vacía manteniendo totales', async () => {
    const { a, b, c, d, e, f, g } = await catalog();
    const result = await list();
    expect(result).toMatchObject({
      page: 0,
      size: 20,
      totalElements: 7,
      totalPages: 1,
    });
    expect(result.content.map((p) => p.idProducto)).toEqual(
      [a, b, c, d, e, f, g].map((p) => p.idProducto),
    );
    const second = await list({ page: 1, size: 2 });
    expect(second).toMatchObject({
      page: 1,
      size: 2,
      totalElements: 7,
      totalPages: 4,
    });
    expect(second.content.map((p) => p.idProducto)).toEqual([
      c.idProducto,
      d.idProducto,
    ]);
    expect(await list({ page: 9, size: 2 })).toEqual({
      content: [],
      page: 9,
      size: 2,
      totalElements: 7,
      totalPages: 4,
    });
  });

  it('filtra por tienda usando su Specification', async () => {
    const { d } = await catalog();
    expect(
      (await list({ idTienda: otherStore.idTienda })).content.map(
        (p) => p.idProducto,
      ),
    ).toEqual([d.idProducto]);
  });

  it('filtra por categoría usando su Specification', async () => {
    const { e } = await catalog();
    expect(
      (await list({ idCategoria: otherCategory.idCategoria })).content.map(
        (p) => p.idProducto,
      ),
    ).toEqual([e.idProducto]);
  });

  it('combina todas las Specifications, orden y paginación', async () => {
    const { g } = await catalog();
    const result = await list({
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      estado: 'ACTIVO',
      disponible: true,
      size: 1,
      page: 1,
    });
    expect(result).toMatchObject({
      page: 1,
      size: 1,
      totalElements: 2,
      totalPages: 2,
    });
    expect(result.content.map((p) => p.idProducto)).toEqual([g.idProducto]);
  });

  it('disponible=false filtra cero stock sin confundirlo con estado', async () => {
    const { b, f, c } = await catalog();
    expect(
      (await list({ disponible: false })).content.map((p) => p.idProducto),
    ).toEqual([b.idProducto, f.idProducto]);
    expect(
      (await list({ estado: 'INACTIVO', disponible: true })).content.map(
        (p) => p.idProducto,
      ),
    ).toEqual([c.idProducto]);
  });

  it.each(['ASC', 'DESC'] as const)(
    'ordena precio numéricamente %s y desempata por ID',
    async (sortDirection) => {
      const first = await create({ precio: 10 });
      const second = await create({ precio: 2 });
      const third = await create({ precio: 10 });
      const ids =
        sortDirection === 'ASC'
          ? [second, first, third]
          : [third, first, second];
      expect(
        (await list({ sortBy: 'precio', sortDirection })).content.map(
          (p) => p.idProducto,
        ),
      ).toEqual(ids.map((p) => p.idProducto));
    },
  );

  it.each(['nombre', 'cantidadDisponible', 'estado'] as const)(
    'admite orden por %s',
    async (sortBy) => {
      const first = await create({
        nombre: 'B',
        cantidadDisponible: 2,
        estado: 'INACTIVO',
      });
      const second = await create({
        nombre: 'A',
        cantidadDisponible: 1,
        estado: 'ACTIVO',
      });
      expect((await list({ sortBy })).content.map((p) => p.idProducto)).toEqual(
        [second.idProducto, first.idProducto],
      );
    },
  );

  it.each([
    { sortBy: 'precio; DROP TABLE producto' },
    { sortDirection: 'desc' },
    { page: -1 },
    { page: 0.5 },
    { size: 0 },
    { size: 101 },
    { size: 'abc' },
    { estado: 'INVALIDO' },
    { disponible: 'yes' },
    { idTienda: 0 },
    { idCategoria: 'abc' },
    { extra: 'x' },
  ])('rechaza query inválida %j', async (query) => {
    problem(await request(server()).get(path).query(query).expect(400), 400);
  });
});
