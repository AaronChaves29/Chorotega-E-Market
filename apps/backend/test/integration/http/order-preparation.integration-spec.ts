import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { OrdersHttpModule } from '../../../src/modules/orders/orders-http.module';
import { DeliveriesModule } from '../../../src/modules/deliveries/deliveries.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Courier } from '../../../src/modules/couriers/entities/courier.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { OrderDetail } from '../../../src/modules/order-details/entities/order-detail.entity';
import { OrderMapper } from '../../../src/modules/orders/mappers/order.mapper';
import type { OrderResponseDto } from '../../../src/modules/orders/dtos/order-response.dto';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Order preparation: real HTTP, JWT and ephemeral PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const accounts: Record<string, User> = {};
  const tokens: Record<string, string> = {};
  let order: OrderResponseDto, courier: Courier;
  const source = () => context!.database.dataSource;
  const server = () => context!.app.getHttpServer();
  const path = (id = order.idPedido) => `/api/v1/orders/${id}/prepare`;
  const prepare = (role = 'EMPRENDEDOR', id = order.idPedido) =>
    request(server())
      .patch(path(id))
      .set('Authorization', `Bearer ${tokens[role]}`);

  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp([OrdersHttpModule, DeliveriesModule]);
    const password = randomUUID(),
      claveHash = await bcrypt.hash(password, 4);
    for (const key of [
      'CLIENTE',
      'EMPRENDEDOR',
      'OTHER',
      'REPARTIDOR',
      'ADMIN',
    ]) {
      accounts[key] = await source()
        .getRepository(User)
        .save({
          authId: randomUUID(),
          nombre: key,
          apellido: 'Temporal',
          correo: `${randomUUID()}@example.test`,
          rol: key === 'OTHER' ? 'EMPRENDEDOR' : key,
          estado: 'ACTIVO',
          claveHash,
        });
      const login = await request(server())
        .post('/api/v1/auth/login')
        .send({ correo: accounts[key].correo, clave: password })
        .expect(201);
      tokens[key] = (login.body as { token: string }).token;
    }
  });
  beforeEach(async () => {
    const store = await source().getRepository(Store).save({
      idEmprendedor: accounts.EMPRENDEDOR.idUsuario,
      nombre: 'Tienda',
      direccion: 'Nicoya',
    });
    const category = await source()
      .getRepository(Category)
      .save({ nombre: 'Categoria' });
    const product = await source().getRepository(Product).save({
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Producto',
      precio: '10.25',
      cantidadDisponible: 10,
    });
    const neighborhood = await source()
      .getRepository(Neighborhood)
      .save({ nombre: 'Barrio', tarifaEnvio: '1.25' });
    courier = await source().getRepository(Courier).save({
      idUsuario: accounts.REPARTIDOR.idUsuario,
      medioTransporte: 'BICICLETA',
    });
    const response = await request(server())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokens.CLIENTE}`)
      .send({
        idBarrio: neighborhood.idBarrio,
        direccionEntrega: 'Direccion temporal',
        items: [{ idProducto: product.idProducto, cantidad: 2 }],
      })
      .expect(201);
    order = response.body as OrderResponseDto;
    expect(order.estado).toBe('CONFIRMADO');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (!context) return;
    await source().query(
      'TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda RESTART IDENTITY',
    );
    await source().getRepository(User).update(accounts.EMPRENDEDOR.idUsuario, {
      estado: 'ACTIVO',
      rol: 'EMPRENDEDOR',
    });
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  async function snapshot() {
    return {
      order: await source()
        .getRepository(Order)
        .findOneByOrFail({ idPedido: order.idPedido }),
      details: await source()
        .getRepository(OrderDetail)
        .find({ order: { idDetalle: 'ASC' } }),
      products: await source()
        .getRepository(Product)
        .find({ order: { idProducto: 'ASC' } }),
    };
  }
  it('persists only state and preserves amounts, details, stock, versions and response fields', async () => {
    const before = await snapshot();
    const response = await prepare().expect(200);
    expect(response.body).toEqual({ ...order, estado: 'PREPARANDO' });
    expect(await snapshot()).toEqual({
      ...before,
      order: { ...before.order, estado: 'PREPARANDO' },
    });
  });
  it('rejects missing and invalid JWT without changes', async () => {
    const before = await snapshot();
    await request(server()).patch(path()).expect(401);
    await request(server())
      .patch(path())
      .set('Authorization', 'Bearer invalid-private-marker')
      .expect(401);
    expect(await snapshot()).toEqual(before);
  });
  it.each(['CLIENTE', 'REPARTIDOR', 'ADMIN'])(
    'rejects %s without changing the order',
    async (role) => {
      const before = await snapshot();
      await prepare(role).expect(403);
      expect(await snapshot()).toEqual(before);
    },
  );
  it('returns indistinguishable 404 for foreign and nonexistent orders', async () => {
    const before = await snapshot();
    const foreign = await prepare('OTHER').expect(404);
    const missing = await prepare('EMPRENDEDOR', 2147483647).expect(404);
    expect((foreign.body as { detail: string }).detail).toBe(
      (missing.body as { detail: string }).detail,
    );
    expect(await snapshot()).toEqual(before);
  });
  it('rejects inactive accounts and uses the current role instead of stale JWT claims', async () => {
    await source()
      .getRepository(User)
      .update(accounts.EMPRENDEDOR.idUsuario, { estado: 'INACTIVO' });
    await prepare().expect(401);
    await source().getRepository(User).update(accounts.EMPRENDEDOR.idUsuario, {
      estado: 'ACTIVO',
      rol: 'CLIENTE',
    });
    await prepare().expect(403);
    expect((await snapshot()).order.estado).toBe('CONFIRMADO');
  });
  it.each(['PENDIENTE', 'PREPARANDO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'])(
    'returns 409 for %s without changes',
    async (estado) => {
      await source().getRepository(Order).update(order.idPedido, { estado });
      const before = await snapshot();
      await prepare().expect(409);
      expect(await snapshot()).toEqual(before);
    },
  );
  it('defines repeated preparation as conflict', async () => {
    await prepare().expect(200);
    await prepare().expect(409);
    expect((await snapshot()).order.estado).toBe('PREPARANDO');
  });
  it.each(['0', '-1', '2147483648', 'abc', '1.5'])(
    'returns 400 for invalid id %s',
    async (id) => {
      await request(server())
        .patch(`/api/v1/orders/${id}/prepare`)
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .expect(400);
    },
  );
  it.each([{ estado: 'PREPARANDO' }, { idTienda: 999 }, { total: '0.00' }, []])(
    'rejects arbitrary input %j',
    async (body) => {
      await prepare().send(body).expect(400);
      expect((await snapshot()).order.estado).toBe('CONFIRMADO');
    },
  );
  it('accepts an empty object without accepting state fields', async () => {
    await prepare().send({}).expect(200);
  });
  it('rolls back a real state update if DTO construction fails afterward', async () => {
    const before = await snapshot();
    const mapper = jest
      .spyOn(OrderMapper, 'toResponseDto')
      .mockImplementationOnce(() => {
        throw new Error('private-rollback-marker');
      });
    const response = await prepare().expect(500);
    expect(mapper).toHaveBeenCalledTimes(1);
    expect(response.text).not.toContain('private-rollback-marker');
    expect(await snapshot()).toEqual(before);
  });
  const assign = () =>
    request(server())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .send({ idPedido: order.idPedido, idRepartidor: courier.idRepartidor });
  it('completes purchase -> confirmed -> prepare -> existing delivery assignment', async () => {
    await assign().expect(409);
    await prepare().expect(200);
    const delivery = await assign().expect(201);
    expect(delivery.body).toMatchObject({
      idPedido: order.idPedido,
      estado: 'ASIGNADA',
    });
    expect(
      (
        await source()
          .getRepository(Courier)
          .findOneByOrFail({ idRepartidor: courier.idRepartidor })
      ).disponibilidad,
    ).toBe('OCUPADO');
    await request(server())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
      .send({ idPedido: order.idPedido, idRepartidor: courier.idRepartidor })
      .expect(403);
  });

  async function holdOrder() {
    const runner = source().createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.manager.getRepository(Order).findOne({
      where: { idPedido: order.idPedido },
      lock: { mode: 'pessimistic_write' },
    });
    return runner;
  }
  async function waitForLocks(count: number) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const [row] = await source().query<
        { count: number }[]
      >(`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query ILIKE '%pedido%' AND query ILIKE '%FOR UPDATE%'`);
      if (row.count >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      'Expected concurrent requests waiting on PostgreSQL order locks',
    );
  }
  it('serializes two overlapping HTTP preparations: one 200, one 409', async () => {
    const runner = await holdOrder();
    const pending = [prepare().then((r) => r), prepare().then((r) => r)];
    try {
      await waitForLocks(2);
      await runner.commitTransaction();
      expect((await Promise.all(pending)).map((r) => r.status).sort()).toEqual([
        200, 409,
      ]);
      expect((await snapshot()).order.estado).toBe('PREPARANDO');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      await Promise.allSettled(pending);
    }
  });
  it('reads the committed state while preparation waits, then observes PREPARANDO', async () => {
    const runner = await holdOrder();
    const pending = prepare().then((r) => r);
    try {
      await waitForLocks(1);
      const before = await request(server())
        .get(`/api/v1/orders/${order.idPedido}`)
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .expect(200);
      expect((before.body as OrderResponseDto).estado).toBe('CONFIRMADO');
      await runner.commitTransaction();
      expect((await pending).status).toBe(200);
      const after = await request(server())
        .get(`/api/v1/orders/${order.idPedido}`)
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .expect(200);
      expect((after.body as OrderResponseDto).estado).toBe('PREPARANDO');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      await Promise.allSettled([pending]);
    }
  });
  it('serializes preparation before an overlapping assignment on the same order', async () => {
    const runner = await holdOrder();
    const pending = [prepare().then((r) => r)];
    try {
      await waitForLocks(1);
      pending.push(assign().then((r) => r));
      await waitForLocks(2);
      await runner.commitTransaction();
      const [prepared, assigned] = await Promise.all(pending);
      expect(prepared.status).toBe(200);
      expect(assigned.status).toBe(201);
      expect((assigned.body as { estado: string }).estado).toBe('ASIGNADA');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      await Promise.allSettled(pending);
    }
  });
});
