import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AdminModule } from '../../../src/admin/admin.module';
import { configureAdminViews } from '../../../src/admin/admin-views';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Courier } from '../../../src/modules/couriers/entities/courier.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { Delivery } from '../../../src/modules/deliveries/entities/delivery.entity';
import { DeliveriesService } from '../../../src/modules/deliveries/services/deliveries.service';
import { createHttpTestApp } from '../../support/create-http-test-app';

function csrf(html: string): string {
  const token = /name=['"]_csrf['"]\s+value=['"]([a-f0-9]+)['"]/.exec(
    html,
  )?.[1];
  if (!token) throw new Error('Formulario sin CSRF');
  return token;
}

describe('Entregas administrativas: HTTP, sesiones y PostgreSQL reales', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>>;
  const previousSecret = process.env.JWT_SECRET;
  const password = randomUUID();
  let hash: string;
  let order: Order,
    courier: Courier,
    otherCourier: Courier,
    neighborhood: Neighborhood;
  beforeAll(async () => {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    hash = await bcrypt.hash(password, 10);
    context = await createHttpTestApp([AdminModule], configureAdminViews);
  });
  beforeEach(async () => {
    const ds = context.database.dataSource;
    const users: Record<string, User> = {};
    for (const rol of ['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])
      users[rol] = await ds.getRepository(User).save({
        authId: randomUUID(),
        nombre: rol,
        apellido: 'Sintético',
        correo: `${rol.toLowerCase()}@example.test`,
        rol,
        estado: 'ACTIVO',
        claveHash: hash,
      });
    const otherUser = await ds.getRepository(User).save({
      authId: randomUUID(),
      nombre: 'Segundo',
      apellido: 'Sintético',
      correo: 'second@example.test',
      rol: 'REPARTIDOR',
      estado: 'ACTIVO',
      claveHash: hash,
    });
    const store = await ds.getRepository(Store).save({
      nombre: 'Tienda sintética',
      direccion: 'Dirección de prueba',
      idEmprendedor: users.EMPRENDEDOR.idUsuario,
    });
    neighborhood = await ds.getRepository(Neighborhood).save({
      nombre: 'Barrio sintético',
      tarifaEnvio: '100.00',
      estado: 'ACTIVO',
    });
    order = await ds.getRepository(Order).save({
      idCliente: users.CLIENTE.idUsuario,
      idTienda: store.idTienda,
      idBarrio: neighborhood.idBarrio,
      subtotal: '1000.00',
      tarifaEnvio: '100.00',
      total: '1100.00',
      direccionEntrega: 'Dirección sintética',
      estado: 'PREPARANDO',
    });
    courier = await ds.getRepository(Courier).save({
      idUsuario: users.REPARTIDOR.idUsuario,
      medioTransporte: 'Bicicleta',
      disponibilidad: 'DISPONIBLE',
    });
    otherCourier = await ds.getRepository(Courier).save({
      idUsuario: otherUser.idUsuario,
      medioTransporte: 'Motocicleta',
      disponibilidad: 'DISPONIBLE',
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await context.database.dataSource.query(
      'TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda, usuario RESTART IDENTITY',
    );
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  function server() {
    return context.app.getHttpServer();
  }
  function service() {
    return context.app.get(DeliveriesService);
  }
  async function login(role = 'ADMIN') {
    const agent = request.agent(server());
    const form = await agent.get('/admin/login').expect(200);
    const response = await agent
      .post('/admin/login')
      .type('form')
      .send({
        _csrf: csrf(form.text),
        correo: `${role.toLowerCase()}@example.test`,
        clave: password,
      });
    return { agent, response };
  }
  async function admin() {
    const { agent, response } = await login();
    expect(response.status).toBe(303);
    const form = await agent.get('/admin/deliveries/new').expect(200);
    return { agent, token: csrf(form.text) };
  }
  async function assign() {
    const session = await admin();
    const response = await session.agent
      .post('/admin/deliveries')
      .type('form')
      .send({
        _csrf: session.token,
        idPedido: String(order.idPedido),
        idRepartidor: String(courier.idRepartidor),
      })
      .expect(303);
    return { ...session, url: response.headers.location };
  }
  async function anotherOrder() {
    const { idPedido: _id, ...data } = order;
    void _id;
    return context.database.dataSource.getRepository(Order).save(data);
  }
  it.each([
    '/admin/deliveries',
    '/admin/deliveries/new',
    '/admin/deliveries/1',
  ])('sin sesión no revela %s', async (url) => {
    await request(server())
      .get(url)
      .expect(303)
      .expect('Location', '/admin/login');
  });
  it.each(['CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'rechaza acceso de %s',
    async (role) => {
      const { agent, response } = await login(role);
      expect(response.status).toBe(403);
      await agent.get('/admin/deliveries').expect(303);
      await agent.post('/admin/deliveries').type('form').send({}).expect(303);
      expect(
        await context.database.dataSource.getRepository(Delivery).count(),
      ).toBe(0);
    },
  );
  it('asigna con PRG, persistencia y disponibilidad actuales sin cambiar pedido', async () => {
    const { agent, url } = await assign();
    await agent
      .get(url)
      .expect(200)
      .expect(/ASIGNADA/);
    await agent.get(url).expect(200);
    expect(
      await context.database.dataSource.getRepository(Delivery).count(),
    ).toBe(1);
    expect(
      (
        await context.database.dataSource
          .getRepository(Courier)
          .findOneByOrFail({ idRepartidor: courier.idRepartidor })
      ).disponibilidad,
    ).toBe('OCUPADO');
    expect(
      (
        await context.database.dataSource
          .getRepository(Order)
          .findOneByOrFail({ idPedido: order.idPedido })
      ).estado,
    ).toBe('PREPARANDO');
  });
  it('lista con SQL paginado, filtra por estado/pedido/repartidor/fechas y conserva orden', async () => {
    const first = await service().assignDelivery(
      {
        idPedido: order.idPedido,
        idRepartidor: courier.idRepartidor,
      },
      { idUsuario: 1, sub: 'admin@example.test', rol: 'ADMIN' },
    );
    await service().cancelDelivery(first.idEntrega, {
      idUsuario: 1,
      sub: 'admin@example.test',
      rol: 'ADMIN',
    });
    const second = await service().assignDelivery(
      {
        idPedido: order.idPedido,
        idRepartidor: courier.idRepartidor,
      },
      { idUsuario: 1, sub: 'admin@example.test', rol: 'ADMIN' },
    );
    const { agent } = await admin();
    const page = await agent
      .get('/admin/deliveries?size=1&sortBy=idEntrega&sortDirection=ASC')
      .expect(200);
    expect(page.text).toContain('Total de registros: 2');
    expect(page.text).toContain('page&#x3D;1');
    expect(page.text).toContain('sortDirection&#x3D;ASC');
    expect(page.text).toContain(`Ver entrega ${first.idEntrega}`);
    expect(page.text).not.toContain(`Ver entrega ${second.idEntrega}`);
    const filtered = await agent
      .get(
        `/admin/deliveries?estado=ASIGNADA&idPedido=${order.idPedido}&idRepartidor=${courier.idRepartidor}&fechaDesde=2000-01-01T00:00:00Z&fechaHasta=2100-01-01T00:00:00Z`,
      )
      .expect(200);
    expect(filtered.text).toContain('Total de registros: 1');
    expect(filtered.text).not.toContain('Dirección sintética');
    expect(filtered.text).not.toContain('@example.test');
    const empty = await agent
      .get('/admin/deliveries?idPedido=2147483647')
      .expect(200);
    expect(empty.text).toContain('No hay entregas');
  });
  it.each([
    { idPedido: '0', idRepartidor: '1' },
    { idPedido: '1e0', idRepartidor: '1' },
    { idPedido: '1', idRepartidor: '' },
    { idPedido: '1', idRepartidor: '1', extra: '1' },
  ])('formulario inválido no escribe: %j', async (input) => {
    const { agent, token } = await admin();
    const result = await agent
      .post('/admin/deliveries')
      .type('form')
      .send({ ...input, _csrf: token })
      .expect(400);
    expect(result.text).toContain('role=');
    expect(
      await context.database.dataSource.getRepository(Delivery).count(),
    ).toBe(0);
    expect(
      (
        await context.database.dataSource
          .getRepository(Courier)
          .findOneByOrFail({ idRepartidor: courier.idRepartidor })
      ).disponibilidad,
    ).toBe('DISPONIBLE');
  });
  it.each(['missing', 'invalid', 'other'])(
    'CSRF %s rechaza asignación y cancelación sin escribir',
    async (kind) => {
      const { agent, token, url } = await assign();
      const other = await admin();
      const body =
        kind === 'missing'
          ? {}
          : { _csrf: kind === 'other' ? other.token : `${token}invalid` };
      await agent
        .post('/admin/deliveries')
        .type('form')
        .send({ ...body, idPedido: '1', idRepartidor: '1' })
        .expect(403);
      await agent.post(`${url}/cancel`).type('form').send(body).expect(403);
      expect(
        (
          await context.database.dataSource
            .getRepository(Delivery)
            .findOneByOrFail({ idPedido: order.idPedido })
        ).estado,
      ).toBe('ASIGNADA');
    },
  );
  it.each(['order', 'courier', 'delivery'])(
    'recurso inexistente: %s responde 404',
    async (kind) => {
      const { agent, token } = await admin();
      if (kind === 'delivery')
        await agent.get('/admin/deliveries/2147483647').expect(404);
      else
        await agent
          .post('/admin/deliveries')
          .type('form')
          .send({
            _csrf: token,
            idPedido: kind === 'order' ? '2147483647' : String(order.idPedido),
            idRepartidor:
              kind === 'courier' ? '2147483647' : String(courier.idRepartidor),
          })
          .expect(404);
    },
  );
  it('pedido no preparado responde 409 sin modificar pedido ni repartidor', async () => {
    await context.database.dataSource
      .getRepository(Order)
      .update(order.idPedido, { estado: 'CONFIRMADO' });
    const { agent, token } = await admin();
    await agent
      .post('/admin/deliveries')
      .type('form')
      .send({
        _csrf: token,
        idPedido: String(order.idPedido),
        idRepartidor: String(courier.idRepartidor),
      })
      .expect(409);
    expect(
      await context.database.dataSource.getRepository(Delivery).count(),
    ).toBe(0);
  });
  it('barrio inactivo responde 422', async () => {
    await context.database.dataSource
      .getRepository(Neighborhood)
      .update(neighborhood.idBarrio, { estado: 'INACTIVO' });
    const { agent, token } = await admin();
    await agent
      .post('/admin/deliveries')
      .type('form')
      .send({
        _csrf: token,
        idPedido: String(order.idPedido),
        idRepartidor: String(courier.idRepartidor),
      })
      .expect(422);
    expect(
      await context.database.dataSource.getRepository(Delivery).count(),
    ).toBe(0);
  });
  it('entrega activa y repartidor ocupado siguen siendo conflictos 409', async () => {
    const { agent, token } = await assign();
    for (const input of [
      { idPedido: order.idPedido, idRepartidor: otherCourier.idRepartidor },
      {
        idPedido: (await anotherOrder()).idPedido,
        idRepartidor: courier.idRepartidor,
      },
    ])
      await agent
        .post('/admin/deliveries')
        .type('form')
        .send({
          _csrf: token,
          idPedido: String(input.idPedido),
          idRepartidor: String(input.idRepartidor),
        })
        .expect(409);
    expect(
      await context.database.dataSource.getRepository(Delivery).count(),
    ).toBe(1);
  });
  it('cancelación con confirmación, PRG y liberación; repetida responde 409', async () => {
    const { agent, token, url } = await assign();
    const detail = await agent.get(url).expect(200);
    expect(detail.text).toContain('cancel-confirmation');
    await agent
      .post(`${url}/cancel`)
      .type('form')
      .send({ _csrf: token, extra: '1' })
      .expect(400);
    await agent
      .post(`${url}/cancel`)
      .type('form')
      .send({ _csrf: token })
      .expect(303)
      .expect('Location', url);
    const result = await agent.get(url).expect(200);
    expect(result.text).toContain('CANCELADA');
    expect(result.text).not.toContain('Confirmar cancelación');
    expect(
      (
        await context.database.dataSource
          .getRepository(Courier)
          .findOneByOrFail({ idRepartidor: courier.idRepartidor })
      ).disponibilidad,
    ).toBe('DISPONIBLE');
    await agent
      .post(`${url}/cancel`)
      .type('form')
      .send({ _csrf: token })
      .expect(409);
    expect(
      (
        await context.database.dataSource
          .getRepository(Order)
          .findOneByOrFail({ idPedido: order.idPedido })
      ).estado,
    ).toBe('PREPARANDO');
  });
  it('EN_CAMINO no ofrece cancelación y POST directo responde 409', async () => {
    const { agent, token, url } = await assign();
    const delivery = await context.database.dataSource
      .getRepository(Delivery)
      .findOneByOrFail({ idPedido: order.idPedido });
    await service().startDelivery(delivery.idEntrega, courier.idUsuario);
    const detail = await agent.get(url).expect(200);
    expect(detail.text).not.toContain('Confirmar cancelación');
    await agent
      .post(`${url}/cancel`)
      .type('form')
      .send({ _csrf: token })
      .expect(409);
    expect(
      (
        await context.database.dataSource
          .getRepository(Courier)
          .findOneByOrFail({ idRepartidor: courier.idRepartidor })
      ).disponibilidad,
    ).toBe('OCUPADO');
  });
  it.each(['same-order', 'same-courier'])(
    'asignación HTTP concurrente %s: una confirma, otra 409 sin duplicados',
    async (mode) => {
      const { agent, token } = await admin();
      const secondOrder = mode === 'same-order' ? order : await anotherOrder();
      const secondCourier = mode === 'same-order' ? otherCourier : courier;
      const post = (idPedido: number, idRepartidor: number) =>
        agent
          .post('/admin/deliveries')
          .type('form')
          .send({
            _csrf: token,
            idPedido: String(idPedido),
            idRepartidor: String(idRepartidor),
          });
      // Hold the contested row until both HTTP transactions are actually waiting
      // for a PostgreSQL lock. This proves overlap rather than merely using Promise.all.
      const runner = context.database.dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      let results: request.Response[];
      const pending: Promise<request.Response>[] = [];
      try {
        if (mode === 'same-order')
          await runner.query(
            'SELECT id_pedido FROM pedido WHERE id_pedido=$1 FOR UPDATE',
            [order.idPedido],
          );
        else
          await runner.query(
            'SELECT id_repartidor FROM repartidor WHERE id_repartidor=$1 FOR UPDATE',
            [courier.idRepartidor],
          );
        pending.push(
          post(order.idPedido, courier.idRepartidor).then((result) => result),
        );
        pending.push(
          post(secondOrder.idPedido, secondCourier.idRepartidor).then(
            (result) => result,
          ),
        );
        const deadline = Date.now() + 5000;
        let waiting = false;
        while (Date.now() < deadline) {
          const rows: { count: string }[] =
            await context.database.dataSource.query(
              "SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%FOR UPDATE%'",
            );
          if (Number(rows[0].count) >= 2) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
        results = await Promise.all(pending);
      }
      expect(results.map((result) => result.status).sort()).toEqual([303, 409]);
      expect(
        await context.database.dataSource.getRepository(Delivery).count(),
      ).toBe(1);
    },
  );
  it('error tras commit simulado: 500 seguro ofrece consulta; GET verifica persistencia sin reenviar', async () => {
    const original = service().assignDelivery.bind(
      service(),
    ) as DeliveriesService['assignDelivery'];
    jest
      .spyOn(service(), 'assignDelivery')
      .mockImplementationOnce(async (dto, actor) => {
        await original(dto, actor);
        throw new Error('SELECT private-secret');
      });
    const { agent, token } = await admin();
    const response = await agent
      .post('/admin/deliveries')
      .type('form')
      .send({
        _csrf: token,
        idPedido: String(order.idPedido),
        idRepartidor: String(courier.idRepartidor),
      })
      .expect(500);
    expect(response.text).not.toMatch(/SELECT|private-secret/);
    expect(response.text).toContain('Consultar estado vigente');
    expect(response.text).not.toContain('Asignar entrega</button>');
    await agent
      .get(`/admin/deliveries?idPedido=${order.idPedido}`)
      .expect(200)
      .expect(/ASIGNADA/);
    expect(
      await context.database.dataSource.getRepository(Delivery).count(),
    ).toBe(1);
  });
});
