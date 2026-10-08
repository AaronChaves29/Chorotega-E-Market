import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { OrdersHttpModule } from '../../../src/modules/orders/orders-http.module';
import { OrdersService } from '../../../src/modules/orders/services/orders.service';
import type { OrderResponseDto } from '../../../src/modules/orders/dtos/order-response.dto';
import type { PaginationResult } from '../../../src/common/pagination/pagination-result';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { OrderDetail } from '../../../src/modules/order-details/entities/order-detail.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Pedidos y detalles: HTTP autorizado y compra transaccional', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  let admin: User,
    client: User,
    otherClient: User,
    owner: User,
    otherOwner: User,
    courier: User;
  const tokens = new Map<number, string>();
  const previousSecret = process.env.JWT_SECRET;
  let store: Store, otherStore: Store, neighborhood: Neighborhood;
  let product: Product, secondProduct: Product, otherProduct: Product;
  const path = '/api/v1/orders';
  const fields = [
    'idPedido',
    'idCliente',
    'idTienda',
    'idBarrio',
    'estado',
    'fechaCreacion',
    'direccionEntrega',
    'subtotal',
    'tarifaEnvio',
    'total',
    'items',
  ].sort();
  const itemFields = [
    'idDetalle',
    'idProducto',
    'cantidad',
    'precioUnitario',
    'subtotal',
  ].sort();

  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp([OrdersHttpModule]);
    const password = 'Clave-local-de-prueba-123!';
    const hash = await bcrypt.hash(password, 10);
    const users = ds().getRepository(User);
    const created: User[] = [];
    for (const rol of [
      'ADMIN',
      'CLIENTE',
      'CLIENTE',
      'EMPRENDEDOR',
      'EMPRENDEDOR',
      'REPARTIDOR',
    ]) {
      const user = await users.save(
        users.create({
          authId: randomUUID(),
          nombre: 'Usuario',
          apellido: 'Prueba',
          correo: `${randomUUID()}@example.test`,
          rol,
          estado: 'ACTIVO',
          claveHash: hash,
        }),
      );
      const login = await request(server())
        .post('/api/v1/auth/login')
        .send({ correo: user.correo, clave: password })
        .expect(201);
      tokens.set(user.idUsuario, (login.body as { token: string }).token);
      created.push(user);
    }
    [admin, client, otherClient, owner, otherOwner, courier] = created;
  });
  beforeEach(async () => {
    store = await ds().getRepository(Store).save({
      idEmprendedor: owner.idUsuario,
      nombre: 'Primera',
      direccion: 'Nicoya',
    });
    otherStore = await ds().getRepository(Store).save({
      idEmprendedor: otherOwner.idUsuario,
      nombre: 'Segunda',
      direccion: 'Nicoya',
    });
    const category = await ds()
      .getRepository(Category)
      .save({ nombre: 'Categoría' });
    neighborhood = await ds()
      .getRepository(Neighborhood)
      .save({ nombre: 'Barrio', tarifaEnvio: '1.25', estado: 'ACTIVO' });
    const products = ds().getRepository(Product);
    product = await products.save({
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Primero',
      precio: '0.10',
      cantidadDisponible: 20,
    });
    secondProduct = await products.save({
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Segundo',
      precio: '0.20',
      cantidadDisponible: 20,
    });
    otherProduct = await products.save({
      idTienda: otherStore.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Ajeno',
      precio: '1.00',
      cantidadDisponible: 20,
    });
  });
  afterEach(async () => {
    if (!context) return;
    await ds().query('DROP TRIGGER IF EXISTS trg_http_order_failure ON pedido');
    await ds().query('DROP FUNCTION IF EXISTS fail_http_order_confirmation()');
    await ds().query(
      'TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda RESTART IDENTITY',
    );
    await ds()
      .getRepository(User)
      .update({ idUsuario: client.idUsuario }, { estado: 'ACTIVO' });
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  function ds() {
    if (!context) throw new Error('Base no inicializada');
    return context.database.dataSource;
  }
  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }
  function input() {
    return {
      idBarrio: neighborhood.idBarrio,
      direccionEntrega: 'Nicoya',
      items: [{ idProducto: product.idProducto, cantidad: 2 }],
    };
  }
  function get(route: string, user = client) {
    return request(server())
      .get(route)
      .set('Authorization', `Bearer ${tokens.get(user.idUsuario)}`);
  }
  function post(user = client) {
    return request(server())
      .post(path)
      .set('Authorization', `Bearer ${tokens.get(user.idUsuario)}`);
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
      /SELECT |UPDATE |INSERT |driverError|QueryFailedError|stack|privado-interno/,
    );
  }
  function publicOrder(order: OrderResponseDto) {
    expect(Object.keys(order).sort()).toEqual(fields);
    expect(typeof order.total).toBe('string');
    for (const detail of order.items)
      expect(Object.keys(detail).sort()).toEqual(itemFields);
  }
  async function noWrites() {
    expect(await ds().getRepository(Order).count()).toBe(0);
    expect(await ds().getRepository(OrderDetail).count()).toBe(0);
    expect(
      (
        await ds()
          .getRepository(Product)
          .findOneByOrFail({ idProducto: product.idProducto })
      ).cantidadDisponible,
    ).toBe(20);
  }
  async function readFixtures() {
    const service = context!.app.get(OrdersService);
    const first = await service.createAndConfirm(client.idUsuario, {
      ...input(),
      items: [
        ...input().items,
        { idProducto: secondProduct.idProducto, cantidad: 1 },
      ],
    });
    const second = await service.createAndConfirm(
      otherClient.idUsuario,
      input(),
    );
    const third = await service.createAndConfirm(otherClient.idUsuario, {
      ...input(),
      items: [{ idProducto: otherProduct.idProducto, cantidad: 2 }],
    });
    const repository = ds().getRepository(Order);
    await repository.update(first.idPedido, {
      fechaCreacion: new Date('2026-01-01T10:00:00Z'),
    });
    await repository.update(second.idPedido, {
      fechaCreacion: new Date('2026-01-02T10:00:00Z'),
      estado: 'PREPARANDO',
    });
    await repository.update(third.idPedido, {
      fechaCreacion: new Date('2026-01-03T10:00:00Z'),
      estado: 'ENTREGADO',
    });
    return { first, second, third };
  }

  it('CLIENTE compra con identidad JWT, 201 y Location; persiste importes y stock', async () => {
    const response = await post().send(input()).expect(201);
    const order = response.body as OrderResponseDto;
    publicOrder(order);
    expect(order).toMatchObject({
      idCliente: client.idUsuario,
      idTienda: store.idTienda,
      estado: 'CONFIRMADO',
      subtotal: '0.20',
      tarifaEnvio: '1.25',
      total: '1.45',
      items: [
        {
          idProducto: product.idProducto,
          cantidad: 2,
          precioUnitario: '0.10',
          subtotal: '0.20',
        },
      ],
    });
    expect(response.headers.location).toBe(`${path}/${order.idPedido}`);
    await get(response.headers.location).expect(200).expect(order);
    expect(
      await ds()
        .getRepository(Order)
        .findOneByOrFail({ idPedido: order.idPedido }),
    ).toMatchObject({ estado: 'CONFIRMADO', total: '1.45' });
    expect(
      await ds()
        .getRepository(OrderDetail)
        .countBy({ idPedido: order.idPedido }),
    ).toBe(1);
    expect(
      (
        await ds()
          .getRepository(Product)
          .findOneByOrFail({ idProducto: product.idProducto })
      ).cantidadDisponible,
    ).toBe(18);
  });

  describe.each(['list', 'order', 'details', 'detail', 'create'] as const)(
    'seguridad de %s',
    (operation) => {
      function call(token?: string) {
        const routes = {
          list: path,
          order: `${path}/1`,
          details: `${path}/1/details`,
          detail: `${path}/1/details/1`,
          create: path,
        };
        const pending =
          operation === 'create'
            ? request(server()).post(path).send(input())
            : request(server()).get(routes[operation]);
        return token === undefined
          ? pending
          : pending.set('Authorization', `Bearer ${token}`);
      }
      it('rechaza ausencia de token', async () => {
        problem(await call().expect(401), 401);
      });
      it('rechaza token inválido', async () => {
        problem(await call('invalido').expect(401), 401);
      });
      it('rechaza REPARTIDOR', async () => {
        problem(await call(tokens.get(courier.idUsuario)).expect(403), 403);
      });
    },
  );
  it.each(['ADMIN', 'EMPRENDEDOR'] as const)(
    'POST rechaza %s aunque el dominio admita compradores activos',
    async (rol) => {
      problem(
        await post(rol === 'ADMIN' ? admin : owner)
          .send(input())
          .expect(403),
        403,
      );
      await noWrites();
    },
  );
  it.each([
    { idCliente: 99 },
    { precio: '0.01' },
    { subtotal: '0.01' },
    { total: '0.01' },
    { estado: 'ENTREGADO' },
    { tarifaEnvio: '0.00' },
    { idTienda: 1 },
    { items: [] },
    { items: [{ idProducto: 1, cantidad: 0 }] },
    { items: [{ idProducto: 1, cantidad: 1, precioUnitario: '0.01' }] },
    { idBarrio: '1' },
    { direccionEntrega: ' ' },
    { direccionEntrega: 'x'.repeat(256) },
  ])(
    'rechaza manipulación o DTO inválido %j antes de escribir',
    async (changes) => {
      problem(
        await post()
          .send({ ...input(), ...changes })
          .expect(400),
        400,
      );
      await noWrites();
    },
  );
  it.each([
    ['producto inexistente', 404],
    ['producto inactivo', 422],
    ['tienda inactiva', 422],
    ['barrio inactivo', 422],
    ['comprador inactivo', 422],
    ['stock insuficiente', 409],
    ['productos duplicados', 422],
    ['tiendas mezcladas', 422],
  ] as const)(
    'traduce %s a %s sin escrituras parciales',
    async (scenario, status) => {
      const dto = input();
      if (scenario === 'producto inexistente')
        dto.items[0].idProducto = 2147483647;
      if (scenario === 'producto inactivo')
        await ds()
          .getRepository(Product)
          .update(product.idProducto, { estado: 'INACTIVO' });
      if (scenario === 'tienda inactiva')
        await ds()
          .getRepository(Store)
          .update(store.idTienda, { estado: 'INACTIVA' });
      if (scenario === 'barrio inactivo')
        await ds()
          .getRepository(Neighborhood)
          .update(neighborhood.idBarrio, { estado: 'INACTIVO' });
      if (scenario === 'comprador inactivo')
        await ds()
          .getRepository(User)
          .update(client.idUsuario, { estado: 'INACTIVO' });
      if (scenario === 'stock insuficiente') dto.items[0].cantidad = 21;
      if (scenario === 'productos duplicados')
        dto.items.push({ ...dto.items[0] });
      if (scenario === 'tiendas mezcladas')
        dto.items.push({ idProducto: otherProduct.idProducto, cantidad: 1 });
      problem(await post().send(dto).expect(status), status);
      await noWrites();
    },
  );
  it('oculta un fallo SQL posterior a escrituras y revierte pedido, detalles y stock', async () => {
    await ds()
      .query(`CREATE FUNCTION fail_http_order_confirmation() RETURNS trigger AS $$
      BEGIN
        IF NEW.estado = 'CONFIRMADO' THEN
          IF NOT EXISTS (SELECT 1 FROM detalle_pedido WHERE id_pedido = NEW.id_pedido)
            OR NOT EXISTS (SELECT 1 FROM detalle_pedido d JOIN producto p ON p.id_producto = d.id_producto WHERE d.id_pedido = NEW.id_pedido AND p.cantidad_disponible = 18) THEN
            RAISE EXCEPTION 'Faltan escrituras previas';
          END IF;
          RAISE EXCEPTION 'privado-interno';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_http_order_failure BEFORE UPDATE ON pedido FOR EACH ROW EXECUTE FUNCTION fail_http_order_confirmation();`);
    const response = await post().send(input()).expect(500);
    problem(response, 500);
    expect(response.body).toMatchObject({
      detail: 'No fue posible completar la solicitud.',
    });
    await noWrites();
  });

  it('ADMIN consulta todos; CLIENTE propios; EMPRENDEDOR solo tiendas propias', async () => {
    const { first, second, third } = await readFixtures();
    for (const [user, expected] of [
      [admin, [first.idPedido, second.idPedido, third.idPedido]],
      [client, [first.idPedido]],
      [otherClient, [second.idPedido, third.idPedido]],
      [owner, [first.idPedido, second.idPedido]],
      [otherOwner, [third.idPedido]],
    ] as const) {
      const response = await get(path, user)
        .query({ sortBy: 'idPedido', sortDirection: 'ASC' })
        .expect(200);
      const page = response.body as PaginationResult<OrderResponseDto>;
      expect(page.content.map((o) => o.idPedido)).toEqual(expected);
      expect(page.totalElements).toBe(expected.length);
      for (const order of page.content) {
        publicOrder(order);
        await get(`${path}/${order.idPedido}`, user).expect(200).expect(order);
        await get(`${path}/${order.idPedido}/details`, user)
          .expect(200)
          .expect(order.items);
        for (const detail of order.items)
          await get(
            `${path}/${order.idPedido}/details/${detail.idDetalle}`,
            user,
          )
            .expect(200)
            .expect(detail);
      }
    }
  });
  it('pedidos y detalles ajenos son 404, incluso combinando IDs válidos de pedidos diferentes', async () => {
    const { first, second, third } = await readFixtures();
    for (const [user, hidden] of [
      [client, second],
      [owner, third],
      [otherOwner, first],
    ] as const) {
      for (const route of [
        `${path}/${hidden.idPedido}`,
        `${path}/${hidden.idPedido}/details`,
        `${path}/${hidden.idPedido}/details/${hidden.items[0].idDetalle}`,
      ])
        problem(await get(route, user).expect(404), 404);
    }
    problem(
      await get(
        `${path}/${first.idPedido}/details/${second.items[0].idDetalle}`,
        admin,
      ).expect(404),
      404,
    );
    problem(
      await get(
        `${path}/${first.idPedido}/details/${second.items[0].idDetalle}`,
        client,
      ).expect(404),
      404,
    );
  });
  it('los filtros nunca reemplazan el ownership obligatorio', async () => {
    const { third } = await readFixtures();
    const customer = await get(path)
      .query({ idCliente: otherClient.idUsuario })
      .expect(200);
    expect(customer.body).toMatchObject({ content: [], totalElements: 0 });
    const entrepreneur = await get(path, owner)
      .query({ idTienda: third.idTienda, idCliente: otherClient.idUsuario })
      .expect(200);
    expect(entrepreneur.body).toMatchObject({ content: [], totalElements: 0 });
  });
  it('pagina pedidos en SQL sin cortar líneas ni duplicar totales por el JOIN', async () => {
    const { first, second } = await readFixtures();
    const page1 = await get(path, admin)
      .query({ size: 1, sortBy: 'idPedido', sortDirection: 'ASC' })
      .expect(200);
    const page2 = await get(path, admin)
      .query({ size: 1, page: 1, sortBy: 'idPedido', sortDirection: 'ASC' })
      .expect(200);
    expect(page1.body).toMatchObject({
      page: 0,
      size: 1,
      totalElements: 3,
      totalPages: 3,
      content: [{ idPedido: first.idPedido }],
    });
    expect(
      (page1.body as PaginationResult<OrderResponseDto>).content[0].items,
    ).toHaveLength(2);
    expect(page2.body).toMatchObject({
      page: 1,
      totalElements: 3,
      content: [{ idPedido: second.idPedido }],
    });
    await get(path, admin).query({ size: 1, page: 9 }).expect(200).expect({
      content: [],
      page: 9,
      size: 1,
      totalElements: 3,
      totalPages: 3,
    });
  });
  it('carga detalles sin N+1 al aumentar la página', async () => {
    await readFixtures();
    const log = jest.spyOn(ds().logger, 'logQuery');
    try {
      for (const size of [1, 20]) {
        log.mockClear();
        const response = await get(path, admin).query({ size }).expect(200);
        const selects = log.mock.calls
          .map((call) => call[0])
          .filter((sql) => sql.startsWith('SELECT'));
        expect(selects.length).toBeGreaterThan(0);
        expect(selects.length).toBeLessThanOrEqual(3);
        expect(
          selects.some((sql) => sql.includes('JOIN "detalle_pedido"')),
        ).toBe(true);
        for (const order of (
          response.body as PaginationResult<OrderResponseDto>
        ).content)
          expect(order.items.length).toBeGreaterThan(0);
      }
    } finally {
      log.mockRestore();
    }
  });

  it('combina estado, cliente, tienda, barrio y ambas fechas', async () => {
    const { second } = await readFixtures();
    const filters = {
      estado: 'PREPARANDO',
      idCliente: otherClient.idUsuario,
      idTienda: store.idTienda,
      idBarrio: neighborhood.idBarrio,
      fechaDesde: '2026-01-02T00:00:00Z',
      fechaHasta: '2026-01-02T23:59:59Z',
      size: 1,
    };
    const response = await get(path, admin).query(filters).expect(200);
    expect(response.body).toMatchObject({
      totalElements: 1,
      content: [{ idPedido: second.idPedido }],
    });
    for (const override of [
      { estado: 'CANCELADO' },
      { idBarrio: 2147483647 },
      { fechaDesde: '2026-01-02T11:00:00Z' },
      { fechaHasta: '2026-01-02T09:00:00Z' },
    ]) {
      const filtered = await get(path, admin)
        .query({ ...filters, ...override })
        .expect(200);
      expect(filtered.body).toMatchObject({ content: [], totalElements: 0 });
    }
  });
  it.each(['ASC', 'DESC'])(
    'ordena total %s y desempata por idPedido',
    async (sortDirection) => {
      const { first, second, third } = await readFixtures();
      // Dos pedidos tienen el mismo total, sin alterar el cálculo de sus detalles.
      const fourth = await context!.app
        .get(OrdersService)
        .createAndConfirm(client.idUsuario, input());
      const expected = [
        second.idPedido,
        fourth.idPedido,
        first.idPedido,
        third.idPedido,
      ];
      if (sortDirection === 'DESC') expected.reverse();
      const response = await get(path, admin)
        .query({ sortBy: 'total', sortDirection })
        .expect(200);
      expect(
        (response.body as PaginationResult<OrderResponseDto>).content.map(
          (o) => o.idPedido,
        ),
      ).toEqual(expected);
    },
  );
  it.each(['abc', '0', '-1', '1.5', '2147483648'])(
    'rechaza ID inválido %s en pedido y detalle',
    async (id) => {
      problem(await get(`${path}/${id}`).expect(400), 400);
      problem(await get(`${path}/1/details/${id}`).expect(400), 400);
    },
  );
  it('devuelve 404 para recursos inexistentes', async () => {
    problem(await get(`${path}/2147483647`).expect(404), 404);
    problem(await get(`${path}/2147483647/details`).expect(404), 404);
    problem(await get(`${path}/2147483647/details/1`).expect(404), 404);
  });
  it.each([
    { page: -1 },
    { size: 0 },
    { size: 101 },
    { idCliente: 'abc' },
    { idTienda: -1 },
    { idBarrio: 2147483648 },
    { estado: 'ACTIVO' },
    { sortBy: 'cliente.claveHash' },
    { sortDirection: 'desc' },
    { fechaDesde: 'ayer' },
    { fechaDesde: '20260101' },
    { fechaHasta: '2026-02-30' },
    { fechaDesde: '2026-02-02', fechaHasta: '2026-02-01' },
    { extra: 'x' },
  ])('rechaza query inválida %j', async (query) => {
    problem(await get(path, admin).query(query).expect(400), 400);
  });
  it('no publica modificaciones genéricas de pedido ni escrituras de detalles', async () => {
    for (const method of ['patch', 'delete'] as const)
      await request(server())
        [method](`${path}/1`)
        .set('Authorization', `Bearer ${tokens.get(client.idUsuario)}`)
        .expect(404);
    await request(server())
      .post(`${path}/1/details`)
      .set('Authorization', `Bearer ${tokens.get(client.idUsuario)}`)
      .send({})
      .expect(404);
  });
});
