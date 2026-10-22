import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { Response } from 'supertest';
import { DeliveriesModule } from '../../../src/modules/deliveries/deliveries.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { Courier } from '../../../src/modules/couriers/entities/courier.entity';
import { Delivery } from '../../../src/modules/deliveries/entities/delivery.entity';
import type { ProblemDetails } from '../../../src/common/http/problem-details';
import type { PaginationResult } from '../../../src/common/pagination/pagination-result';
import { createHttpTestApp } from '../../support/create-http-test-app';

interface DeliveryBody {
  idEntrega: number;
  idPedido: number;
  idRepartidor: number;
  estado: string;
  fechaAsignacion: string;
  fechaEntrega: string | null;
}
type Identity =
  'ADMIN' | 'owner' | 'other' | 'unregistered' | 'CLIENTE' | 'EMPRENDEDOR';
const root = '/api/v1/deliveries';
const routes = [
  ['get', root],
  ['get', `${root}/1`],
  ['post', root],
  ['post', `${root}/1/start`],
  ['post', `${root}/1/complete`],
  ['post', `${root}/1/cancel`],
] as const;

describe('Deliveries HTTP: alcance, errores y transacciones', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const identities = {} as Record<Identity, User>;
  const tokens = {} as Record<Identity, string>;
  const previousSecret = process.env.JWT_SECRET;
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  function source() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.database.dataSource;
  }
  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }
  function call(
    identity: Identity,
    method: 'get' | 'post',
    path: string,
    body?: object,
  ) {
    const pending = request(server())
      [method](path)
      .set('Authorization', `Bearer ${tokens[identity]}`);
    return body ? pending.send(body) : pending;
  }
  function problem(response: Response, status: number, path: string) {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(
      /application\/problem\+json/,
    );
    const body = response.body as ProblemDetails;
    expect(body).toMatchObject({ type: 'about:blank', status, instance: path });
    expect(body.title).toEqual(expect.any(String));
    expect(body.detail).toEqual(expect.any(String));
    expect(response.text).not.toMatch(
      /stack|SELECT |UPDATE |INSERT |driverError|QueryFailedError|claveHash|authId/,
    );
  }
  function publicDto(body: DeliveryBody) {
    expect(Object.keys(body).sort()).toEqual(
      [
        'idEntrega',
        'idPedido',
        'idRepartidor',
        'estado',
        'fechaAsignacion',
        'fechaEntrega',
      ].sort(),
    );
    expect(Number.isNaN(Date.parse(body.fechaAsignacion))).toBe(false);
  }
  async function createFixture() {
    const stores = source().getRepository(Store);
    const orders = source().getRepository(Order);
    const couriers = source().getRepository(Courier);
    const store = await stores.save({
      idEmprendedor: identities.EMPRENDEDOR.idUsuario,
      nombre: 'Tienda HTTP',
      direccion: 'Nicoya',
    });
    const neighborhood = await source()
      .getRepository(Neighborhood)
      .save({ nombre: 'Barrio HTTP', tarifaEnvio: '1.25', estado: 'ACTIVO' });
    const makeOrder = () =>
      orders.save({
        idCliente: identities.CLIENTE.idUsuario,
        idTienda: store.idTienda,
        idBarrio: neighborhood.idBarrio,
        estado: 'PREPARANDO',
        subtotal: '1.00',
        tarifaEnvio: '1.25',
        total: '2.25',
        direccionEntrega: 'Nicoya',
      });
    const first = await makeOrder(),
      second = await makeOrder(),
      third = await makeOrder();
    const owner = await couriers.save({
      idUsuario: identities.owner.idUsuario,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    });
    const other = await couriers.save({
      idUsuario: identities.other.idUsuario,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    });
    return { first, second, third, owner, other, neighborhood };
  }
  async function assign(
    order = fixture.first,
    courier = fixture.owner,
  ): Promise<DeliveryBody> {
    const response = await call('ADMIN', 'post', root, {
      idPedido: order.idPedido,
      idRepartidor: courier.idRepartidor,
    }).expect(201);
    const body = response.body as DeliveryBody;
    expect(response.headers.location).toBe(`${root}/${body.idEntrega}`);
    publicDto(body);
    return body;
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp([DeliveriesModule]);
    const password = 'Temporal-http-123!',
      claveHash = await bcrypt.hash(password, 10);
    for (const identity of [
      'ADMIN',
      'owner',
      'other',
      'unregistered',
      'CLIENTE',
      'EMPRENDEDOR',
    ] as const) {
      const rol = ['owner', 'other', 'unregistered'].includes(identity)
        ? 'REPARTIDOR'
        : identity;
      identities[identity] = await source()
        .getRepository(User)
        .save({
          authId: randomUUID(),
          nombre: 'Usuario',
          apellido: identity,
          correo: `${identity}@example.test`,
          rol,
          estado: 'ACTIVO',
          claveHash,
        });
      const response = await request(server())
        .post('/api/v1/auth/login')
        .send({ correo: identities[identity].correo, clave: password })
        .expect(201);
      tokens[identity] = (response.body as { token: string }).token;
    }
  });
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    if (!context) return;
    await source().query(
      'DROP TRIGGER IF EXISTS http_delivery_failure ON pedido',
    );
    await source().query('DROP FUNCTION IF EXISTS http_delivery_failure()');
    await source().query('DROP SEQUENCE IF EXISTS http_delivery_progress');
    await source().query(
      'TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda RESTART IDENTITY',
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

  it.each(routes)(
    'rechaza JWT ausente e inválido en %s %s',
    async (method, path) => {
      problem(await request(server())[method](path), 401, path);
      problem(
        await request(server())
          [method](path)
          .set('Authorization', 'Bearer invalido'),
        401,
        path,
      );
    },
  );
  it.each(routes)(
    'rechaza CLIENTE y EMPRENDEDOR en %s %s',
    async (method, path) => {
      for (const identity of ['CLIENTE', 'EMPRENDEDOR'] as const)
        problem(await call(identity, method, path), 403, path);
    },
  );
  it('conserva operaciones administrativas y de repartidor separadas', async () => {
    const delivery = await assign();
    problem(
      await call('owner', 'post', root, {
        idPedido: fixture.second.idPedido,
        idRepartidor: fixture.owner.idRepartidor,
      }),
      403,
      root,
    );
    problem(
      await call('owner', 'post', `${root}/${delivery.idEntrega}/cancel`),
      403,
      `${root}/${delivery.idEntrega}/cancel`,
    );
    for (const action of ['start', 'complete'])
      problem(
        await call('ADMIN', 'post', `${root}/${delivery.idEntrega}/${action}`),
        403,
        `${root}/${delivery.idEntrega}/${action}`,
      );
  });
  it('ADMIN ve todas las entregas y REPARTIDOR solo las propias mediante DTOs', async () => {
    const own = await assign(),
      foreign = await assign(fixture.second, fixture.other);
    for (const [identity, ids] of [
      ['ADMIN', [own.idEntrega, foreign.idEntrega]],
      ['owner', [own.idEntrega]],
      ['other', [foreign.idEntrega]],
    ] as const) {
      const response = await call(
        identity,
        'get',
        `${root}?sortBy=idEntrega&sortDirection=ASC`,
      ).expect(200);
      const page = response.body as PaginationResult<DeliveryBody>;
      expect(page.totalElements).toBe(ids.length);
      expect(page.content.map((item) => item.idEntrega)).toEqual(ids);
      page.content.forEach(publicDto);
      publicDto(
        (await call(identity, 'get', `${root}/${ids[0]}`).expect(200))
          .body as DeliveryBody,
      );
    }
  });
  it('oculta entregas ajenas por ID y no permite ampliar el alcance mediante filtros', async () => {
    const own = await assign(),
      foreign = await assign(fixture.second, fixture.other);
    for (const [identity, target, courier] of [
      ['owner', foreign, fixture.other],
      ['other', own, fixture.owner],
    ] as const) {
      problem(
        await call(identity, 'get', `${root}/${target.idEntrega}`),
        404,
        `${root}/${target.idEntrega}`,
      );
      const response = await call(
        identity,
        'get',
        `${root}?idRepartidor=${courier.idRepartidor}&idPedido=${target.idPedido}&estado=ASIGNADA`,
      ).expect(200);
      expect(response.body).toMatchObject({
        content: [],
        totalElements: 0,
        totalPages: 0,
      });
    }
  });
  it('devuelve página vacía y detalle 404 para usuario sin repartidor asociado', async () => {
    const delivery = await assign();
    expect(
      (await call('unregistered', 'get', root).expect(200)).body,
    ).toMatchObject({ content: [], totalElements: 0, totalPages: 0 });
    problem(
      await call('unregistered', 'get', `${root}/${delivery.idEntrega}`),
      404,
      `${root}/${delivery.idEntrega}`,
    );
  });
  it('pagina, cuenta, combina filtros y ordena dentro del alcance autorizado', async () => {
    const first = await assign();
    await call('owner', 'post', `${root}/${first.idEntrega}/start`).expect(200);
    await call('owner', 'post', `${root}/${first.idEntrega}/complete`).expect(
      200,
    );
    const last = await assign(fixture.third);
    await assign(fixture.second, fixture.other);
    for (const [direction, expected] of [
      ['ASC', [first.idEntrega, last.idEntrega]],
      ['DESC', [last.idEntrega, first.idEntrega]],
    ] as const) {
      for (let page = 0; page < 2; page++) {
        const body = (
          await call(
            'owner',
            'get',
            `${root}?page=${page}&size=1&sortBy=idEntrega&sortDirection=${direction}`,
          ).expect(200)
        ).body as PaginationResult<DeliveryBody>;
        expect(body).toMatchObject({
          page,
          size: 1,
          totalElements: 2,
          totalPages: 2,
        });
        expect(body.content.map((item) => item.idEntrega)).toEqual([
          expected[page],
        ]);
      }
    }
    const filtered = (
      await call(
        'owner',
        'get',
        `${root}?idRepartidor=${fixture.owner.idRepartidor}&idPedido=${fixture.third.idPedido}&estado=ASIGNADA&fechaDesde=2000-01-01&fechaHasta=2100-01-01`,
      ).expect(200)
    ).body as PaginationResult<DeliveryBody>;
    expect(filtered.content.map((item) => item.idEntrega)).toEqual([
      last.idEntrega,
    ]);
    expect(filtered.totalElements).toBe(1);
    await source()
      .getRepository(Delivery)
      .update([first.idEntrega, last.idEntrega], {
        fechaAsignacion: new Date('2026-01-01T00:00:00Z'),
      });
    const sorted = (
      await call(
        'owner',
        'get',
        `${root}?sortBy=fechaAsignacion&sortDirection=DESC`,
      ).expect(200)
    ).body as PaginationResult<DeliveryBody>;
    expect(sorted.content.map((item) => item.idEntrega)).toEqual([
      last.idEntrega,
      first.idEntrega,
    ]);
  });
  it('persiste asignación, inicio y finalización', async () => {
    const delivery = await assign();
    expect(
      await source()
        .getRepository(Courier)
        .findOneByOrFail({ idRepartidor: fixture.owner.idRepartidor }),
    ).toMatchObject({ disponibilidad: 'OCUPADO' });
    expect(
      (
        await call(
          'owner',
          'post',
          `${root}/${delivery.idEntrega}/start`,
        ).expect(200)
      ).body,
    ).toMatchObject({ estado: 'EN_CAMINO', fechaEntrega: null });
    const completed = await call(
      'owner',
      'post',
      `${root}/${delivery.idEntrega}/complete`,
    ).expect(200);
    publicDto(completed.body as DeliveryBody);
    expect(
      await source()
        .getRepository(Delivery)
        .findOneByOrFail({ idEntrega: delivery.idEntrega }),
    ).toMatchObject({
      estado: 'ENTREGADA',
      fechaEntrega: new Date((completed.body as DeliveryBody).fechaEntrega!),
    });
    expect(
      await source()
        .getRepository(Order)
        .findOneByOrFail({ idPedido: fixture.first.idPedido }),
    ).toMatchObject({ estado: 'ENTREGADO' });
    expect(
      await source()
        .getRepository(Courier)
        .findOneByOrFail({ idRepartidor: fixture.owner.idRepartidor }),
    ).toMatchObject({ disponibilidad: 'DISPONIBLE' });
  });
  it('permite cancelar a ADMIN y libera el repartidor', async () => {
    const delivery = await assign();
    expect(
      (
        await call(
          'ADMIN',
          'post',
          `${root}/${delivery.idEntrega}/cancel`,
        ).expect(200)
      ).body,
    ).toMatchObject({ estado: 'CANCELADA' });
    expect(
      await source()
        .getRepository(Courier)
        .findOneByOrFail({ idRepartidor: fixture.owner.idRepartidor }),
    ).toMatchObject({ disponibilidad: 'DISPONIBLE' });
  });
  it.each(['start', 'complete'])(
    'conserva 403 al intentar %s una entrega ajena sin escrituras',
    async (action) => {
      const delivery = await assign();
      if (action === 'complete')
        await call(
          'owner',
          'post',
          `${root}/${delivery.idEntrega}/start`,
        ).expect(200);
      const before = await source()
        .getRepository(Delivery)
        .findOneByOrFail({ idEntrega: delivery.idEntrega });
      const orderBefore = await source()
        .getRepository(Order)
        .findOneByOrFail({ idPedido: fixture.first.idPedido });
      problem(
        await call('other', 'post', `${root}/${delivery.idEntrega}/${action}`),
        403,
        `${root}/${delivery.idEntrega}/${action}`,
      );
      expect(
        await source()
          .getRepository(Delivery)
          .findOneByOrFail({ idEntrega: delivery.idEntrega }),
      ).toEqual(before);
      expect(
        await source()
          .getRepository(Order)
          .findOneByOrFail({ idPedido: fixture.first.idPedido }),
      ).toEqual(orderBefore);
    },
  );
  it.each([
    {},
    { idPedido: 0, idRepartidor: 1 },
    { idPedido: 1, idRepartidor: -1 },
    { idPedido: 1.5, idRepartidor: 1 },
    { idPedido: 2147483648, idRepartidor: 1 },
    { idPedido: '1', idRepartidor: 1 },
    { idPedido: 1, idRepartidor: 1, estado: 'ENTREGADA' },
  ])('rechaza asignación inválida %j con 400', async (body) => {
    problem(await call('ADMIN', 'post', root, body), 400, root);
    expect(await source().getRepository(Delivery).count()).toBe(0);
  });
  it.each([
    'page=-1',
    'size=0',
    'size=101',
    'estado=INVALIDO',
    'idRepartidor=abc',
    'idPedido=0',
    'fechaDesde=invalid',
    'sortBy=authId',
    'sortDirection=INVALIDO',
    'extra=1',
  ])('rechaza consulta inválida %s con 400', async (query) => {
    problem(await call('ADMIN', 'get', `${root}?${query}`), 400, root);
  });
  it.each(['', '/start', '/complete', '/cancel'])(
    'rechaza ID inválido en %s',
    async (suffix) => {
      const path = `${root}/abc${suffix}`;
      problem(
        await call(
          suffix === '/start' || suffix === '/complete' ? 'owner' : 'ADMIN',
          suffix ? 'post' : 'get',
          path,
        ),
        400,
        path,
      );
    },
  );
  it.each(['', '/start', '/complete', '/cancel'])(
    'devuelve 404 para entrega inexistente en %s',
    async (suffix) => {
      const path = `${root}/2147483647${suffix}`;
      problem(
        await call(
          suffix === '/start' || suffix === '/complete' ? 'owner' : 'ADMIN',
          suffix ? 'post' : 'get',
          path,
        ),
        404,
        path,
      );
    },
  );
  it.each(['order', 'courier'])(
    'devuelve 404 al asignar con %s inexistente',
    async (resource) => {
      const body = {
        idPedido: resource === 'order' ? 2147483647 : fixture.first.idPedido,
        idRepartidor:
          resource === 'courier' ? 2147483647 : fixture.owner.idRepartidor,
      };
      problem(await call('ADMIN', 'post', root, body), 404, root);
      expect(await source().getRepository(Delivery).count()).toBe(0);
    },
  );
  it('devuelve 409 si el pedido no está PREPARANDO', async () => {
    await source()
      .getRepository(Order)
      .update(fixture.first.idPedido, { estado: 'CONFIRMADO' });
    problem(
      await call('ADMIN', 'post', root, {
        idPedido: fixture.first.idPedido,
        idRepartidor: fixture.owner.idRepartidor,
      }),
      409,
      root,
    );
    expect(await source().getRepository(Delivery).count()).toBe(0);
  });
  it('devuelve 409 si el pedido ya tiene entrega activa', async () => {
    await assign();
    problem(
      await call('ADMIN', 'post', root, {
        idPedido: fixture.first.idPedido,
        idRepartidor: fixture.other.idRepartidor,
      }),
      409,
      root,
    );
    expect(await source().getRepository(Delivery).count()).toBe(1);
    expect(
      await source()
        .getRepository(Courier)
        .findOneByOrFail({ idRepartidor: fixture.other.idRepartidor }),
    ).toMatchObject({ disponibilidad: 'DISPONIBLE' });
  });
  it('devuelve 409 si el repartidor está ocupado con otro pedido', async () => {
    await assign();
    problem(
      await call('ADMIN', 'post', root, {
        idPedido: fixture.second.idPedido,
        idRepartidor: fixture.owner.idRepartidor,
      }),
      409,
      root,
    );
    expect(await source().getRepository(Delivery).count()).toBe(1);
  });
  it.each(['start', 'complete', 'cancel'])(
    'devuelve 409 para transición %s incompatible',
    async (action) => {
      const delivery = await assign();
      if (action !== 'complete')
        await call(
          'owner',
          'post',
          `${root}/${delivery.idEntrega}/start`,
        ).expect(200);
      const before = await source()
        .getRepository(Delivery)
        .findOneByOrFail({ idEntrega: delivery.idEntrega });
      const path = `${root}/${delivery.idEntrega}/${action}`;
      problem(
        await call(action === 'cancel' ? 'ADMIN' : 'owner', 'post', path),
        409,
        path,
      );
      expect(
        await source()
          .getRepository(Delivery)
          .findOneByOrFail({ idEntrega: delivery.idEntrega }),
      ).toEqual(before);
    },
  );
  it.each(['neighborhood', 'address'])(
    'devuelve 422 por regla de negocio %s',
    async (rule) => {
      if (rule === 'neighborhood')
        await source()
          .getRepository(Neighborhood)
          .update(fixture.neighborhood.idBarrio, { estado: 'INACTIVO' });
      else
        await source()
          .getRepository(Order)
          .update(fixture.first.idPedido, { direccionEntrega: ' ' });
      problem(
        await call('ADMIN', 'post', root, {
          idPedido: fixture.first.idPedido,
          idRepartidor: fixture.owner.idRepartidor,
        }),
        422,
        root,
      );
      expect(await source().getRepository(Delivery).count()).toBe(0);
      expect(
        await source()
          .getRepository(Courier)
          .findOneByOrFail({ idRepartidor: fixture.owner.idRepartidor }),
      ).toMatchObject({ disponibilidad: 'DISPONIBLE' });
    },
  );
  it('devuelve 500 seguro y revierte escrituras reales ante fallo intermedio', async () => {
    const delivery = await assign();
    await call('owner', 'post', `${root}/${delivery.idEntrega}/start`).expect(
      200,
    );
    await source().query('CREATE SEQUENCE http_delivery_progress');
    await source()
      .query(`CREATE FUNCTION http_delivery_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.estado = 'ENTREGADO' AND EXISTS (SELECT 1 FROM entrega WHERE id_pedido = NEW.id_pedido AND estado = 'ENTREGADA' AND fecha_entrega IS NOT NULL) THEN
          PERFORM nextval('http_delivery_progress');
          RAISE EXCEPTION 'SQL interno de prueba: fallo después de actualizar entrega';
        END IF;
        RETURN NEW;
      END $$`);
    await source().query(
      'CREATE TRIGGER http_delivery_failure BEFORE UPDATE ON pedido FOR EACH ROW EXECUTE FUNCTION http_delivery_failure()',
    );
    const path = `${root}/${delivery.idEntrega}/complete`,
      response = await call('owner', 'post', path);
    problem(response, 500, path);
    expect(response.text).not.toContain('SQL interno');
    // nextval no se revierte: evidencia de que el trigger vio la escritura previa.
    expect(
      await source().query('SELECT is_called FROM http_delivery_progress'),
    ).toEqual([{ is_called: true }]);
    expect(
      await source()
        .getRepository(Delivery)
        .findOneByOrFail({ idEntrega: delivery.idEntrega }),
    ).toMatchObject({ estado: 'EN_CAMINO', fechaEntrega: null });
    expect(
      await source()
        .getRepository(Order)
        .findOneByOrFail({ idPedido: fixture.first.idPedido }),
    ).toMatchObject({ estado: 'EN_CAMINO' });
    expect(
      await source()
        .getRepository(Courier)
        .findOneByOrFail({ idRepartidor: fixture.owner.idRepartidor }),
    ).toMatchObject({ disponibilidad: 'OCUPADO' });
  });
});
