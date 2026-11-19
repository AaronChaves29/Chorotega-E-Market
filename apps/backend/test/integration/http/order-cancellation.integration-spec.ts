import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { OrdersHttpModule } from '../../../src/modules/orders/orders-http.module';
import { DeliveriesModule } from '../../../src/modules/deliveries/deliveries.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Courier } from '../../../src/modules/couriers/entities/courier.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { Delivery } from '../../../src/modules/deliveries/entities/delivery.entity';
import { ProductsRepository } from '../../../src/modules/products/repositories/products.repository';
import { createHttpTestApp } from '../../support/create-http-test-app';
import type { OrderResponseDto } from '../../../src/modules/orders/dtos/order-response.dto';

describe('Cancelación propia: HTTP, JWT y concurrencia PostgreSQL real', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>>;
  const previousSecret = process.env.JWT_SECRET;
  const users: Record<string, User> = {},
    tokens: Record<string, string> = {};
  let order: OrderResponseDto, products: Product[], courier: Courier;
  const ds = () => context.database.dataSource,
    server = () => context.app.getHttpServer();
  const cancel = (who = 'CLIENTE', id = order.idPedido) =>
    request(server())
      .patch(`/api/v1/orders/${id}/cancel`)
      .set('Authorization', `Bearer ${tokens[who]}`)
      .send({});
  const saved = () =>
    ds().getRepository(Order).findOneByOrFail({ idPedido: order.idPedido });
  const stock = async () =>
    Promise.all(
      products.map((p) =>
        ds()
          .getRepository(Product)
          .findOneByOrFail({ idProducto: p.idProducto }),
      ),
    );
  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp([OrdersHttpModule, DeliveriesModule]);
    for (const key of [
      'CLIENTE',
      'OTHER',
      'EMPRENDEDOR',
      'ADMIN',
      'REPARTIDOR',
    ]) {
      users[key] = await ds()
        .getRepository(User)
        .save({
          authId: randomUUID(),
          nombre: 'Persona',
          apellido: 'Temporal',
          correo: `${randomUUID()}@example.test`,
          rol: key === 'OTHER' ? 'CLIENTE' : key,
          estado: 'ACTIVO',
        });
      tokens[key] = context.app.get(JwtService).sign({
        sub: users[key].correo,
        idUsuario: users[key].idUsuario,
        rol: users[key].rol,
      });
    }
  });
  beforeEach(async () => {
    const store = await ds().getRepository(Store).save({
      idEmprendedor: users.EMPRENDEDOR.idUsuario,
      nombre: 'Negocio sintético',
      direccion: 'Prueba',
    });
    const category = await ds()
      .getRepository(Category)
      .save({ nombre: `Temporal ${randomUUID()}` });
    const barrio = await ds()
      .getRepository(Neighborhood)
      .save({ nombre: `Temporal ${randomUUID()}`, tarifaEnvio: '1.25' });
    products = [];
    for (const quantity of [10, 20])
      products.push(
        await ds().getRepository(Product).save({
          idTienda: store.idTienda,
          idCategoria: category.idCategoria,
          nombre: 'Producto temporal',
          precio: '10.25',
          cantidadDisponible: quantity,
        }),
      );
    const response = await request(server())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokens.CLIENTE}`)
      .send({
        idBarrio: barrio.idBarrio,
        direccionEntrega: 'Dirección exclusivamente sintética',
        items: products.map((p) => ({ idProducto: p.idProducto, cantidad: 2 })),
      })
      .expect(201);
    order = response.body as OrderResponseDto;
    const user = await ds()
      .getRepository(User)
      .save({
        authId: randomUUID(),
        nombre: 'Persona',
        apellido: 'Temporal',
        correo: `${randomUUID()}@example.test`,
        rol: 'REPARTIDOR',
      });
    courier = await ds()
      .getRepository(Courier)
      .save({ idUsuario: user.idUsuario, medioTransporte: 'MOTO' });
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  it('cancela CONFIRMADO, conserva detalles/importes e incrementa versiones; repetir no duplica', async () => {
    const before = await stock();
    const result = await cancel().expect(200);
    expect(result.body).toEqual({ ...order, estado: 'CANCELADO' });
    expect((await stock()).map((p) => p.cantidadDisponible)).toEqual([10, 20]);
    expect((await stock()).map((p) => p.version)).toEqual(
      before.map((p) => p.version + 1),
    );
    await cancel()
      .expect(409)
      .expect('Content-Type', /application\/problem\+json/);
    expect((await stock()).map((p) => p.cantidadDisponible)).toEqual([10, 20]);
    const read = await request(server())
      .get(`/api/v1/orders/${order.idPedido}`)
      .set('Authorization', `Bearer ${tokens.CLIENTE}`)
      .expect(200);
    expect(read.body).toEqual(result.body);
  });
  it.each(['OTHER', 'ADMIN', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'rechaza %s sin escribir ni revelar un pedido ajeno',
    async (who) => {
      const before = await stock();
      const result = await cancel(who).expect(who === 'OTHER' ? 404 : 403);
      expect(JSON.stringify(result.body)).not.toContain(order.direccionEntrega);
      expect((await saved()).estado).toBe('CONFIRMADO');
      expect(await stock()).toEqual(before);
    },
  );
  it('401 sin JWT, inválido y vencido', async () => {
    for (const token of [
      undefined,
      'invalid',
      context.app
        .get(JwtService)
        .sign(
          { sub: users.CLIENTE.correo, idUsuario: users.CLIENTE.idUsuario },
          { expiresIn: -1 },
        ),
    ]) {
      const pending = request(server())
        .patch(`/api/v1/orders/${order.idPedido}/cancel`)
        .send({});
      if (token) pending.set('Authorization', `Bearer ${token}`);
      await pending.expect(401);
    }
  });
  it('404 inexistente; 400 ID y cuerpos no permitidos', async () => {
    await cancel('CLIENTE', 2147483647).expect(404);
    for (const id of ['abc', '0', '-1', '2147483648'])
      await request(server())
        .patch(`/api/v1/orders/${id}/cancel`)
        .set('Authorization', `Bearer ${tokens.CLIENTE}`)
        .send({})
        .expect(400);
    for (const body of [
      { idCliente: users.CLIENTE.idUsuario },
      { estado: 'CANCELADO' },
      [],
      { items: [] },
    ])
      await request(server())
        .patch(`/api/v1/orders/${order.idPedido}/cancel`)
        .set('Authorization', `Bearer ${tokens.CLIENTE}`)
        .send(body)
        .expect(400);
  });
  it.each(['PREPARANDO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'])(
    'rechaza estado %s sin restaurar',
    async (estado) => {
      await ds()
        .getRepository(Order)
        .update({ idPedido: order.idPedido }, { estado });
      const before = await stock();
      await cancel().expect(409);
      expect(await stock()).toEqual(before);
      expect((await saved()).estado).toBe(estado);
    },
  );
  it('una entrega existente impide cancelar incluso ante un estado incoherente', async () => {
    await ds().getRepository(Delivery).save({
      idPedido: order.idPedido,
      idRepartidor: courier.idRepartidor,
      estado: 'ASIGNADA',
    });
    await cancel().expect(409);
    expect((await saved()).estado).toBe('CONFIRMADO');
    expect((await stock()).map((p) => p.cantidadDisponible)).toEqual([8, 18]);
  });
  it('dos cancelaciones simultáneas: una transición, una restauración', async () => {
    const responses = await Promise.all([cancel(), cancel()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await stock()).map((p) => p.cantidadDisponible)).toEqual([10, 20]);
  });
  it('cancelación contra preparación: una sola transición válida', async () => {
    const responses = await Promise.all([
      cancel(),
      request(server())
        .patch(`/api/v1/orders/${order.idPedido}/prepare`)
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .send({}),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const state = (await saved()).estado;
    expect(['CANCELADO', 'PREPARANDO']).toContain(state);
    expect((await stock()).map((p) => p.cantidadDisponible)).toEqual(
      state === 'CANCELADO' ? [10, 20] : [8, 18],
    );
  });
  it.each(['CONFIRMADO', 'PREPARANDO'])(
    'cancelación contra asignación desde %s conserva reglas existentes',
    async (estado) => {
      await ds()
        .getRepository(Order)
        .update({ idPedido: order.idPedido }, { estado });
      const responses = await Promise.all([
        cancel(),
        request(server())
          .post('/api/v1/deliveries')
          .set('Authorization', `Bearer ${tokens.ADMIN}`)
          .send({
            idPedido: order.idPedido,
            idRepartidor: courier.idRepartidor,
          }),
      ]);
      expect(responses.map((r) => r.status)).toEqual(
        estado === 'CONFIRMADO' ? [200, 409] : [409, 201],
      );
      expect((await stock()).map((p) => p.cantidadDisponible)).toEqual(
        estado === 'CONFIRMADO' ? [10, 20] : [8, 18],
      );
    },
  );
  it('edición de inventario concurrente: suma sobre edición vigente o 409, nunca sobrescritura silenciosa', async () => {
    const [before] = await stock();
    const repository = new ProductsRepository(ds().getRepository(Product));
    const responses = await Promise.allSettled([
      cancel().expect(200),
      repository.updateForActor(
        before.idProducto,
        { cantidadDisponible: 30 },
        {
          idUsuario: users.EMPRENDEDOR.idUsuario,
          sub: users.EMPRENDEDOR.correo,
          rol: 'EMPRENDEDOR',
        },
        before.version,
      ),
    ]);
    const edit = responses[1];
    expect(responses[0].status).toBe('fulfilled');
    const [after] = await stock();
    expect(after.cantidadDisponible).toBe(
      edit.status === 'fulfilled' ? 32 : 10,
    );
    if (edit.status === 'rejected')
      expect((edit.reason as Error).name).toBe('ProductVersionConflictError');
  });
  it('compra concurrente con cancelación conserva el inventario neto', async () => {
    const responses = await Promise.all([
      cancel(),
      request(server())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokens.OTHER}`)
        .send({
          idBarrio: order.idBarrio,
          direccionEntrega: 'Dirección sintética nueva',
          items: products.map((p) => ({
            idProducto: p.idProducto,
            cantidad: 3,
          })),
        }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 201]);
    expect((await saved()).estado).toBe('CANCELADO');
    expect((await stock()).map((p) => p.cantidadDisponible)).toEqual([7, 17]);
  });
  it('fallo tras restaurar el primer producto revierte todo el inventario y estado', async () => {
    const before = await stock();
    await ds().query(
      `CREATE FUNCTION fail_cancel_restore() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id_producto = ${products[1].idProducto} AND NEW.cantidad_disponible > OLD.cantidad_disponible THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$`,
    );
    await ds().query(
      'CREATE TRIGGER cancel_restore_failure BEFORE UPDATE ON producto FOR EACH ROW EXECUTE FUNCTION fail_cancel_restore()',
    );
    try {
      await cancel().expect(500);
      expect(await stock()).toEqual(before);
      expect((await saved()).estado).toBe('CONFIRMADO');
    } finally {
      await ds().query('DROP TRIGGER cancel_restore_failure ON producto');
      await ds().query('DROP FUNCTION fail_cancel_restore()');
    }
  });
});
