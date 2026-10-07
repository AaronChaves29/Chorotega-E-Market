import request from 'supertest';
import { StoresModule } from '../../../src/modules/stores/stores.module';
import type { StoreResponseDto } from '../../../src/modules/stores/dtos/store-response.dto';
import type { PaginationResult } from '../../../src/common/pagination/pagination-result';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Tiendas: API real con PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  let ownerId: number;
  let otherId: number;
  const path = '/api/v1/stores';
  beforeAll(async () => {
    context = await createHttpTestApp([StoresModule]);
  });
  beforeEach(async () => {
    const users = context!.database.dataSource.getRepository(User);
    const first = await users.save({
      authId: '00000000-0000-4000-8000-000000000001',
      nombre: 'Usuario',
      apellido: 'Prueba',
      correo: 'stores@example.test',
      rol: 'EMPRENDEDOR',
      claveHash: 'hash-sintetico-no-publicar',
    });
    const second = await users.save({
      authId: '00000000-0000-4000-8000-000000000002',
      nombre: 'Otro',
      apellido: 'Prueba',
      correo: 'other@example.test',
      rol: 'EMPRENDEDOR',
    });
    ownerId = first.idUsuario;
    otherId = second.idUsuario;
  });
  function valid() {
    return { idEmprendedor: ownerId, nombre: 'Alimentos', direccion: 'Nicoya' };
  }
  afterEach(async () => {
    await context?.database.dataSource.query(`
      TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor,
      barrio, producto, categoria, tienda, usuario RESTART IDENTITY
    `);
  });
  afterAll(async () => {
    await context?.close();
  });
  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }
  async function create(
    nombre = 'Alimentos',
    estado = 'ACTIVA',
  ): Promise<StoreResponseDto> {
    const response = await request(server())
      .post(path)
      .send({ ...valid(), nombre, estado, descripcion: 'Descripción' })
      .expect(201);
    return response.body as StoreResponseDto;
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
      /QueryFailedError|SELECT |INSERT INTO|DELETE FROM|driverError|stack|fk_tienda_emprendedor|fk_producto_tienda|fk_pedido_tienda/,
    );
  }

  it('crea con 201, Location utilizable y contrato DTO exacto', async () => {
    const response = await request(server())
      .post(path)
      .send(valid())
      .expect(201);
    const store = response.body as StoreResponseDto;
    expect(store).toEqual({
      idTienda: expect.any(Number) as number,
      idEmprendedor: ownerId,
      direccion: 'Nicoya',
      telefono: null,
      horario: null,
      fechaCreacion: expect.any(String) as string,
      nombre: 'Alimentos',
      descripcion: null,
      estado: 'ACTIVA',
    });
    expect(response.headers.location).toBe(`${path}/${store.idTienda}`);
    await request(server())
      .get(`${path}/${store.idTienda}`)
      .expect(200)
      .expect(store);
  });

  it.each([
    { nombre: undefined },
    { direccion: undefined },
    { direccion: null },
    { direccion: ' ' },
    { direccion: 'x'.repeat(256) },
    { idEmprendedor: undefined },
    { idEmprendedor: '1' },
    { idEmprendedor: 0 },
    { idEmprendedor: null },
    { telefono: 'x'.repeat(21) },
    { horario: 'x'.repeat(151) },
    { nombre: '' },
    { nombre: '   ' },
    { nombre: null },
    { nombre: 4 },
    { nombre: 'x'.repeat(151) },
    { nombre: 'A', descripcion: 'x'.repeat(501) },
    { nombre: 'A', estado: 'ACTIVO' },
    { nombre: 'A', estado: null },
    { nombre: 'A', idTienda: 99 },
    { emprendedor: { claveHash: 'no-publicar' } },
  ])('rechaza creación inválida %j', async (body) => {
    problem(
      await request(server())
        .post(path)
        .send({ ...valid(), ...body })
        .expect(400),
      400,
    );
  });

  it('devuelve 404 para una tienda inexistente', async () => {
    problem(await request(server()).get(`${path}/999`).expect(404), 404);
  });

  it.each(['abc', '1.5', '0', '-1', '2147483648'])(
    'rechaza identificador %s',
    async (id) => {
      problem(await request(server()).get(`${path}/${id}`).expect(400), 400);
    },
  );

  it('PATCH conserva campos omitidos y permite borrar la descripción con null', async () => {
    const store = await create();
    const updated = {
      ...store,
      descripcion: null,
      telefono: null,
      horario: null,
    };
    await request(server())
      .patch(`${path}/${store.idTienda}`)
      .send({ telefono: '88888888', horario: '8-17' })
      .expect(200);
    await request(server())
      .patch(`${path}/${store.idTienda}`)
      .send({ descripcion: null, telefono: null, horario: null })
      .expect(200)
      .expect(updated);
    await request(server())
      .get(`${path}/${store.idTienda}`)
      .expect(200)
      .expect(updated);
    await request(server())
      .patch(`${path}/${store.idTienda}`)
      .send({})
      .expect(200)
      .expect(updated);
  });

  it('PATCH modifica nombre y estado sin reemplazar descripción', async () => {
    const store = await create();
    await request(server())
      .patch(`${path}/${store.idTienda}`)
      .send({ nombre: 'Nuevo', estado: 'INACTIVA' })
      .expect(200)
      .expect({ ...store, nombre: 'Nuevo', estado: 'INACTIVA' });
  });

  it.each([
    { nombre: null },
    { direccion: null },
    { estado: null },
    { idEmprendedor: null },
    { idEmprendedor: '1' },
    { productos: [] },
  ])('PATCH rechaza %j', async (body) => {
    const store = await create();
    problem(
      await request(server())
        .patch(`${path}/${store.idTienda}`)
        .send(body)
        .expect(400),
      400,
    );
  });

  it('PATCH inexistente devuelve 404 sin insertar', async () => {
    problem(
      await request(server())
        .patch(`${path}/999`)
        .send({ nombre: 'Nuevo' })
        .expect(404),
      404,
    );
    const response = await request(server()).get(path).expect(200);
    expect(response.body).toMatchObject({ content: [], totalElements: 0 });
  });

  it('DELETE devuelve 204 vacío y la tienda desaparece', async () => {
    const store = await create();
    const response = await request(server())
      .delete(`${path}/${store.idTienda}`)
      .expect(204);
    expect(response.text).toBe('');
    await request(server()).get(`${path}/${store.idTienda}`).expect(404);
  });

  it('DELETE inexistente devuelve 404', async () => {
    problem(await request(server()).delete(`${path}/999`).expect(404), 404);
  });

  it('permite nombres repetidos: no existe UNIQUE de nombre', async () => {
    const first = await create('Repetida');
    const second = await create('Repetida');
    expect(first.idTienda).not.toBe(second.idTienda);
  });
  it('rechaza usuario inexistente en POST sin insertar', async () => {
    problem(
      await request(server())
        .post(path)
        .send({ ...valid(), idEmprendedor: 999 })
        .expect(404),
      404,
    );
    expect(
      await context!.database.dataSource.getRepository(Store).count(),
    ).toBe(0);
  });
  it('PATCH valida el usuario nuevo y conserva la fila si no existe', async () => {
    const store = await create();
    problem(
      await request(server())
        .patch(`${path}/${store.idTienda}`)
        .send({ idEmprendedor: 999 })
        .expect(404),
      404,
    );
    await request(server())
      .get(`${path}/${store.idTienda}`)
      .expect(200)
      .expect(store);
    await request(server())
      .patch(`${path}/${store.idTienda}`)
      .send({ idEmprendedor: otherId })
      .expect(200)
      .expect({ ...store, idEmprendedor: otherId });
  });
  it.each(['producto', 'pedido'] as const)(
    'DELETE bloqueado por %s real conserva ambas filas',
    async (relation) => {
      const store = await create();
      const ds = context!.database.dataSource;
      let assertRelated: () => Promise<void>;
      if (relation === 'producto') {
        const category = await ds
          .getRepository(Category)
          .save({ nombre: 'Categoría' });
        const product = await ds.getRepository(Product).save({
          idTienda: store.idTienda,
          idCategoria: category.idCategoria,
          nombre: 'Producto',
          precio: '10.00',
          cantidadDisponible: 1,
        });
        assertRelated = async () => {
          expect(
            await ds
              .getRepository(Product)
              .findOneBy({ idProducto: product.idProducto }),
          ).not.toBeNull();
        };
      } else {
        const neighborhood = await ds
          .getRepository(Neighborhood)
          .save({ nombre: 'Barrio', tarifaEnvio: '1.00' });
        const order = await ds.getRepository(Order).save({
          idCliente: ownerId,
          idTienda: store.idTienda,
          idBarrio: neighborhood.idBarrio,
          estado: 'PENDIENTE',
          subtotal: '10.00',
          tarifaEnvio: '1.00',
          total: '11.00',
          direccionEntrega: 'Dirección',
        });
        assertRelated = async () => {
          expect(
            await ds
              .getRepository(Order)
              .findOneBy({ idPedido: order.idPedido }),
          ).not.toBeNull();
        };
      }
      problem(
        await request(server()).delete(`${path}/${store.idTienda}`).expect(409),
        409,
      );
      await request(server())
        .get(`${path}/${store.idTienda}`)
        .expect(200)
        .expect(store);
      await assertRelated();
    },
  );

  it('lista con defaults y metadatos compartidos', async () => {
    await fixtures();
    const response = await request(server()).get(path).expect(200);
    const page = response.body as PaginationResult<StoreResponseDto>;
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
      'direccion',
      'estado',
      'fechaCreacion',
      'horario',
      'idEmprendedor',
      'idTienda',
      'nombre',
      'telefono',
    ]);
  });

  it('pagina en PostgreSQL y conserva el total incluso fuera de rango', async () => {
    await fixtures();
    const first = (await request(server()).get(`${path}?size=2`).expect(200))
      .body as PaginationResult<StoreResponseDto>;
    const second = (
      await request(server()).get(`${path}?size=2&page=1`).expect(200)
    ).body as PaginationResult<StoreResponseDto>;
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
    await request(server())
      .post(path)
      .send({ ...valid(), idEmprendedor: otherId, nombre: 'Alfarería' })
      .expect(201);
    const response = await request(server())
      .get(path)
      .query({
        idEmprendedor: ownerId,
        nombre: 'ALF',
        estado: 'ACTIVA',
        page: 1,
        size: 1,
        sortBy: 'nombre',
        sortDirection: 'ASC',
      })
      .expect(200);
    const page = response.body as PaginationResult<StoreResponseDto>;
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
      (response.body as PaginationResult<StoreResponseDto>).content.map(
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
      (response.body as PaginationResult<StoreResponseDto>).content.map(
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
      (response.body as PaginationResult<StoreResponseDto>).content.map(
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
    { idEmprendedor: 'abc' },
    { idEmprendedor: -1 },
    { idEmprendedor: 2147483648 },
  ])('rechaza query inválida %j', async (query) => {
    problem(await request(server()).get(path).query(query).expect(400), 400);
  });
});
