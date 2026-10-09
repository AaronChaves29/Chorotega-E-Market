import { CatalogHttpAuth } from '../../support/catalog-http-auth';
import request from 'supertest';
import { CategoriesModule } from '../../../src/modules/categories/categories.module';
import type { CategoryResponseDto } from '../../../src/modules/categories/dtos/category-response.dto';
import type { PaginationResult } from '../../../src/common/pagination/pagination-result';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Categorías: API real con PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const path = '/api/v1/categories';
  const auth = new CatalogHttpAuth();
  let token: string;
  beforeAll(async () => {
    await auth.prepare();
    context = await createHttpTestApp([CategoriesModule]);
  });
  beforeEach(async () => {
    token = await auth.loginAdmin(context!.database.dataSource, server());
  });
  afterEach(async () => {
    await context?.database.dataSource.query(`
      TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor,
      barrio, producto, categoria, tienda, usuario RESTART IDENTITY
    `);
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      auth.restore();
    }
  });
  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }
  async function create(
    nombre = 'Alimentos',
    estado = 'ACTIVA',
  ): Promise<CategoryResponseDto> {
    const response = await request(server())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre, estado, descripcion: 'Descripción' })
      .expect(201);
    return response.body as CategoryResponseDto;
  }
  async function fixtures() {
    await create('Beta', 'INACTIVA');
    await create('Alfa');
    await create('Alfarería');
    await create('Gamma');
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
      /QueryFailedError|SELECT |INSERT INTO|DELETE FROM|driverError|stack|categoria_nombre_key|fk_producto_categoria/,
    );
  }

  it('crea con 201, Location utilizable y contrato DTO exacto', async () => {
    const response = await request(server())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Alimentos' })
      .expect(201);
    const category = response.body as CategoryResponseDto;
    expect(category).toEqual({
      idCategoria: expect.any(Number) as number,
      nombre: 'Alimentos',
      descripcion: null,
      estado: 'ACTIVA',
    });
    expect(response.headers.location).toBe(`${path}/${category.idCategoria}`);
    await request(server())
      .get(`${path}/${category.idCategoria}`)
      .expect(200)
      .expect(category);
  });

  it.each([
    {},
    { nombre: '' },
    { nombre: '   ' },
    { nombre: null },
    { nombre: 4 },
    { nombre: 'x'.repeat(101) },
    { nombre: 'A', descripcion: 'x'.repeat(256) },
    { nombre: 'A', estado: 'ACTIVO' },
    { nombre: 'A', estado: null },
    { nombre: 'A', idCategoria: 99 },
  ])('rechaza creación inválida %j', async (body) => {
    problem(
      await request(server())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400),
      400,
    );
  });

  it('devuelve 404 para una categoría inexistente', async () => {
    problem(await request(server()).get(`${path}/999`).expect(404), 404);
  });

  it.each(['abc', '1.5', '0', '-1', '2147483648'])(
    'rechaza identificador %s',
    async (id) => {
      problem(await request(server()).get(`${path}/${id}`).expect(400), 400);
    },
  );

  it('PATCH conserva campos omitidos y permite borrar la descripción con null', async () => {
    const category = await create();
    const updated = { ...category, descripcion: null };
    await request(server())
      .patch(`${path}/${category.idCategoria}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ descripcion: null })
      .expect(200)
      .expect(updated);
    await request(server())
      .get(`${path}/${category.idCategoria}`)
      .expect(200)
      .expect(updated);
    await request(server())
      .patch(`${path}/${category.idCategoria}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200)
      .expect(updated);
  });

  it('PATCH modifica nombre y estado sin reemplazar descripción', async () => {
    const category = await create();
    await request(server())
      .patch(`${path}/${category.idCategoria}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Nuevo', estado: 'INACTIVA' })
      .expect(200)
      .expect({ ...category, nombre: 'Nuevo', estado: 'INACTIVA' });
  });

  it.each([{ nombre: null }, { estado: null }, { productos: [] }])(
    'PATCH rechaza %j',
    async (body) => {
      const category = await create();
      problem(
        await request(server())
          .patch(`${path}/${category.idCategoria}`)
          .set('Authorization', `Bearer ${token}`)
          .send(body)
          .expect(400),
        400,
      );
    },
  );

  it('PATCH inexistente devuelve 404 sin insertar', async () => {
    problem(
      await request(server())
        .patch(`${path}/999`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Nuevo' })
        .expect(404),
      404,
    );
    const response = await request(server()).get(path).expect(200);
    expect(response.body).toMatchObject({ content: [], totalElements: 0 });
  });

  it('DELETE devuelve 204 vacío y la categoría desaparece', async () => {
    const category = await create();
    const response = await request(server())
      .delete(`${path}/${category.idCategoria}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    expect(response.text).toBe('');
    await request(server()).get(`${path}/${category.idCategoria}`).expect(404);
  });

  it('DELETE inexistente devuelve 404', async () => {
    problem(
      await request(server())
        .delete(`${path}/999`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404),
      404,
    );
  });

  it('rechaza nombres duplicados en POST y PATCH con la restricción real', async () => {
    await create('Duplicada');
    problem(
      await request(server())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Duplicada' })
        .expect(409),
      409,
    );
    const other = await create('Otra');
    problem(
      await request(server())
        .patch(`${path}/${other.idCategoria}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Duplicada' })
        .expect(409),
      409,
    );
    await request(server())
      .get(`${path}/${other.idCategoria}`)
      .expect(200)
      .expect(other);
  });

  it('DELETE con un producto real devuelve 409 y conserva ambas filas', async () => {
    const category = await create();
    const ds = context!.database.dataSource;
    const user = await ds.getRepository(User).save({
      authId: '00000000-0000-4000-8000-000000000001',
      nombre: 'Usuario',
      apellido: 'Prueba',
      correo: 'categoria@example.test',
      rol: 'EMPRENDEDOR',
    });
    const store = await ds.getRepository(Store).save({
      idEmprendedor: user.idUsuario,
      nombre: 'Tienda',
      direccion: 'Dirección',
    });
    const product = await ds.getRepository(Product).save({
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Producto',
      precio: '10.00',
      cantidadDisponible: 1,
    });
    problem(
      await request(server())
        .delete(`${path}/${category.idCategoria}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409),
      409,
    );
    await request(server())
      .get(`${path}/${category.idCategoria}`)
      .expect(200)
      .expect(category);
    expect(
      await ds
        .getRepository(Product)
        .findOneBy({ idProducto: product.idProducto }),
    ).not.toBeNull();
  });

  it('lista con defaults y metadatos compartidos', async () => {
    await fixtures();
    const response = await request(server()).get(path).expect(200);
    const page = response.body as PaginationResult<CategoryResponseDto>;
    expect(page).toMatchObject({
      page: 0,
      size: 20,
      totalElements: 4,
      totalPages: 1,
    });
    expect(page.content.map((item) => item.nombre)).toEqual([
      'Beta',
      'Alfa',
      'Alfarería',
      'Gamma',
    ]);
    expect(Object.keys(page.content[0]).sort()).toEqual([
      'descripcion',
      'estado',
      'idCategoria',
      'nombre',
    ]);
  });

  it('pagina en PostgreSQL y conserva el total incluso fuera de rango', async () => {
    await fixtures();
    const first = (await request(server()).get(`${path}?size=2`).expect(200))
      .body as PaginationResult<CategoryResponseDto>;
    const second = (
      await request(server()).get(`${path}?size=2&page=1`).expect(200)
    ).body as PaginationResult<CategoryResponseDto>;
    expect(first.content.map((x) => x.nombre)).toEqual(['Beta', 'Alfa']);
    expect(second.content.map((x) => x.nombre)).toEqual(['Alfarería', 'Gamma']);
    expect(second).toMatchObject({
      page: 1,
      size: 2,
      totalElements: 4,
      totalPages: 2,
    });
    await request(server()).get(`${path}?size=2&page=9`).expect(200).expect({
      content: [],
      page: 9,
      size: 2,
      totalElements: 4,
      totalPages: 2,
    });
  });

  it('combina nombre, estado, paginación y orden', async () => {
    await fixtures();
    await create('Alfabeto', 'INACTIVA');
    const response = await request(server())
      .get(path)
      .query({
        nombre: 'ALF',
        estado: 'ACTIVA',
        page: 1,
        size: 1,
        sortBy: 'nombre',
        sortDirection: 'ASC',
      })
      .expect(200);
    const page = response.body as PaginationResult<CategoryResponseDto>;
    expect(page).toMatchObject({
      page: 1,
      size: 1,
      totalElements: 2,
      totalPages: 2,
    });
    expect(page.content.map((x) => x.nombre)).toEqual(['Alfarería']);
  });

  it.each([
    ['ASC', ['Alfa', 'Alfarería', 'Beta', 'Gamma']],
    ['DESC', ['Gamma', 'Beta', 'Alfarería', 'Alfa']],
  ] as const)('ordena nombre %s', async (sortDirection, names) => {
    await fixtures();
    const response = await request(server())
      .get(path)
      .query({ sortBy: 'nombre', sortDirection })
      .expect(200);
    expect(
      (response.body as PaginationResult<CategoryResponseDto>).content.map(
        (x) => x.nombre,
      ),
    ).toEqual(names);
  });

  it('desempata por ID al ordenar estado', async () => {
    await fixtures();
    const response = await request(server())
      .get(path)
      .query({ sortBy: 'estado', sortDirection: 'DESC' })
      .expect(200);
    expect(
      (response.body as PaginationResult<CategoryResponseDto>).content.map(
        (x) => x.nombre,
      ),
    ).toEqual(['Beta', 'Gamma', 'Alfarería', 'Alfa']);
  });

  it('trata comodines y comillas como datos del filtro', async () => {
    await create('100% local');
    await create('Otro');
    const response = await request(server())
      .get(path)
      .query({ nombre: '%' })
      .expect(200);
    expect(
      (response.body as PaginationResult<CategoryResponseDto>).content.map(
        (x) => x.nombre,
      ),
    ).toEqual(['100% local']);
    const injected = await request(server())
      .get(path)
      .query({ nombre: "' OR 1=1 --" })
      .expect(200);
    expect(injected.body).toMatchObject({ content: [], totalElements: 0 });
  });

  it.each([
    { page: -1 },
    { page: 0.5 },
    { size: 0 },
    { size: 101 },
    { size: 'abc' },
    { sortBy: 'nombre; DROP TABLE categoria' },
    { sortDirection: 'desc' },
    { estado: 'ACTIVO' },
    { extra: 'x' },
  ])('rechaza query inválida %j', async (query) => {
    problem(await request(server()).get(path).query(query).expect(400), 400);
  });
});
