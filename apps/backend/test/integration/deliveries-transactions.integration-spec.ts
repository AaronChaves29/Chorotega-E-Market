import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { Courier } from '../../src/modules/couriers/entities/courier.entity';
import { CouriersRepository } from '../../src/modules/couriers/repositories/couriers.repository';
import { Delivery } from '../../src/modules/deliveries/entities/delivery.entity';
import type { DeliveryResponseDto } from '../../src/modules/deliveries/dtos/delivery-response.dto';
import { DeliveryAccessDeniedException } from '../../src/modules/deliveries/exceptions/delivery-access-denied.exception';
import { InvalidDeliveryStateException } from '../../src/modules/deliveries/exceptions/invalid-delivery-state.exception';
import { DeliveriesRepository } from '../../src/modules/deliveries/repositories/deliveries.repository';
import { DeliveriesService } from '../../src/modules/deliveries/services/deliveries.service';
import { Neighborhood } from '../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Order } from '../../src/modules/orders/entities/order.entity';
import { OrdersRepository } from '../../src/modules/orders/repositories/orders.repository';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import {
  startPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../support/postgres-test-database';

type Transition = 'start' | 'complete' | 'cancel';

describe('Entregas: EntityManager, pool pequeño y atomicidad en PostgreSQL', () => {
  let database: PostgresTestDatabase;
  let observer: DataSource;
  let single: DataSource;
  let parallel: DataSource;
  let service: DeliveriesService;
  let parallelService: DeliveriesService;
  let order: Order;
  let courier: Courier;
  let otherCourier: Courier;

  beforeAll(async () => {
    database = await startPostgresTestDatabase();
    observer = database.dataSource;
    single = await source(1).initialize();
    parallel = await source(2).initialize();
    service = buildService(single);
    parallelService = buildService(parallel);
  });
  beforeEach(async () => {
    const users = observer.getRepository(User);
    const owner = await users.save({
      authId: randomUUID(),
      nombre: 'Propietario',
      apellido: 'Prueba',
      correo: 'owner@example.test',
      rol: 'EMPRENDEDOR',
    });
    const buyer = await users.save({
      authId: randomUUID(),
      nombre: 'Cliente',
      apellido: 'Prueba',
      correo: 'buyer@example.test',
      rol: 'CLIENTE',
    });
    const courierUser = await users.save({
      authId: randomUUID(),
      nombre: 'Repartidor',
      apellido: 'Prueba',
      correo: 'courier@example.test',
      rol: 'REPARTIDOR',
    });
    const other = await users.save({
      authId: randomUUID(),
      nombre: 'Otro',
      apellido: 'Prueba',
      correo: 'other@example.test',
      rol: 'REPARTIDOR',
    });
    const store = await observer.getRepository(Store).save({
      idEmprendedor: owner.idUsuario,
      nombre: 'Temporal',
      direccion: 'Dirección de prueba',
    });
    const neighborhood = await observer
      .getRepository(Neighborhood)
      .save({ nombre: 'Temporal', tarifaEnvio: '0.00' });
    order = await observer.getRepository(Order).save({
      idCliente: buyer.idUsuario,
      idTienda: store.idTienda,
      idBarrio: neighborhood.idBarrio,
      estado: 'PREPARANDO',
      subtotal: '10.00',
      tarifaEnvio: '0.00',
      total: '10.00',
      direccionEntrega: 'Dirección de prueba',
    });
    courier = await observer.getRepository(Courier).save({
      idUsuario: courierUser.idUsuario,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    });
    otherCourier = await observer.getRepository(Courier).save({
      idUsuario: other.idUsuario,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    });
  });
  afterEach(async () => {
    if (!observer?.isInitialized) return;
    await observer.query(
      'DROP TRIGGER IF EXISTS b5_fail_after_write ON pedido',
    );
    await observer.query(
      'DROP TRIGGER IF EXISTS b5_fail_after_write ON repartidor',
    );
    await observer.query('DROP FUNCTION IF EXISTS b5_fail_after_write()');
    await observer.query(
      'TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda, usuario RESTART IDENTITY',
    );
  });
  afterAll(async () => {
    try {
      if (single?.isInitialized) await single.destroy();
    } finally {
      try {
        if (parallel?.isInitialized) await parallel.destroy();
      } finally {
        await database?.stop();
      }
    }
  });

  function source(size: number, lockTimeout = 2000) {
    // Únicamente las opciones del contenedor recién creado; nunca process.env/.env.
    const options = observer.options;
    if (options.type !== 'postgres')
      throw new Error('Se requiere PostgreSQL temporal.');
    return new DataSource({
      ...options,
      poolSize: size,
      extra: {
        max: size,
        connectionTimeoutMillis: 500,
        application_name: `chorotega-b5-pool-${size}`,
        options: `-c lock_timeout=${lockTimeout} -c statement_timeout=4000`,
      },
    });
  }
  function buildService(ds: DataSource) {
    return new DeliveriesService(
      new DeliveriesRepository(ds.getRepository(Delivery)),
      new OrdersRepository(ds.getRepository(Order)),
      new CouriersRepository(ds.getRepository(Courier)),
      ds,
    );
  }
  const assign = () =>
    service.assignDelivery({
      idPedido: order.idPedido,
      idRepartidor: courier.idRepartidor,
    });
  async function state(idEntrega: number) {
    return {
      delivery: await observer
        .getRepository(Delivery)
        .findOneByOrFail({ idEntrega }),
      order: await observer
        .getRepository(Order)
        .findOneByOrFail({ idPedido: order.idPedido }),
      courier: await observer
        .getRepository(Courier)
        .findOneByOrFail({ idRepartidor: courier.idRepartidor }),
    };
  }
  function transition(
    action: Transition,
    id: number,
    target = service,
    userId = courier.idUsuario,
  ) {
    if (action === 'start') return target.startDelivery(id, userId);
    if (action === 'complete') return target.completeDelivery(id, userId);
    return target.cancelDelivery(id);
  }

  it('asigna, inicia y completa con un pool de una conexión sin pedir una segunda', async () => {
    expect(single.options.poolSize).toBe(1);
    const [before] = await single.query<{ pid: number }[]>(
      'SELECT pg_backend_pid() AS pid',
    );
    const delivery = await assign();
    expect(delivery.estado).toBe('ASIGNADA');
    expect(await transition('start', delivery.idEntrega)).toMatchObject({
      estado: 'EN_CAMINO',
    });
    expect(await transition('complete', delivery.idEntrega)).toMatchObject({
      estado: 'ENTREGADA',
      fechaEntrega: expect.any(Date) as Date,
    });
    const saved = await state(delivery.idEntrega);
    expect(saved.order.estado).toBe('ENTREGADO');
    expect(saved.courier.disponibilidad).toBe('DISPONIBLE');
    const [after] = await single.query<{ pid: number }[]>(
      'SELECT pg_backend_pid() AS pid',
    );
    expect(after.pid).toBe(before.pid);
  });

  it('cancela con una conexión, libera al repartidor y conserva el pedido PREPARANDO', async () => {
    const delivery = await assign();
    expect(await transition('cancel', delivery.idEntrega)).toMatchObject({
      estado: 'CANCELADA',
      fechaEntrega: null,
    });
    const saved = await state(delivery.idEntrega);
    expect(saved.order.estado).toBe('PREPARANDO');
    expect(saved.courier.disponibilidad).toBe('DISPONIBLE');
  });

  it.each(['start', 'complete'] as const)(
    'propiedad en %s: rechaza repartidor ajeno y usuario sin registro sin escribir',
    async (action) => {
      const delivery = await assign();
      if (action === 'complete') await transition('start', delivery.idEntrega);
      const before = await state(delivery.idEntrega);
      for (const userId of [otherCourier.idUsuario, 2147483647]) {
        await expect(
          transition(action, delivery.idEntrega, service, userId),
        ).rejects.toBeInstanceOf(DeliveryAccessDeniedException);
        expect(await state(delivery.idEntrega)).toEqual(before);
      }
      // El rechazo liberó la única conexión y revirtió la transacción.
      await expect(single.query('SELECT 1')).resolves.toHaveLength(1);
    },
  );

  it.each(['assign', 'start', 'complete', 'cancel'] as const)(
    'revierte todas las escrituras de %s tras un fallo intermedio real',
    async (action) => {
      let delivery: DeliveryResponseDto | undefined;
      if (action !== 'assign') delivery = await assign();
      if (action === 'complete') await transition('start', delivery!.idEntrega);
      const before = delivery ? await state(delivery.idEntrega) : undefined;
      const checks = {
        assign: "EXISTS (SELECT 1 FROM entrega WHERE estado = 'ASIGNADA')",
        start: "EXISTS (SELECT 1 FROM entrega WHERE estado = 'EN_CAMINO')",
        complete:
          "EXISTS (SELECT 1 FROM entrega e JOIN pedido p USING (id_pedido) WHERE e.estado = 'ENTREGADA' AND e.fecha_entrega IS NOT NULL AND p.estado = 'ENTREGADO')",
        cancel: "EXISTS (SELECT 1 FROM entrega WHERE estado = 'CANCELADA')",
      } as const;
      const table = action === 'start' ? 'pedido' : 'repartidor';
      // DDL exclusivo del contenedor: exige observar escrituras previas antes de fallar.
      await observer.query(`CREATE FUNCTION b5_fail_after_write() RETURNS trigger AS $$
      BEGIN
        IF NOT (${checks[action]}) THEN RAISE EXCEPTION 'No se observaron escrituras previas'; END IF;
        RAISE EXCEPTION 'Fallo B5 después de escrituras reales';
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER b5_fail_after_write BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION b5_fail_after_write();`);
      await expect(
        action === 'assign'
          ? assign()
          : transition(action, delivery!.idEntrega),
      ).rejects.toThrow('Fallo B5 después de escrituras reales');
      if (before) expect(await state(delivery!.idEntrega)).toEqual(before);
      else {
        expect(await observer.getRepository(Delivery).count()).toBe(0);
        expect(
          await observer
            .getRepository(Courier)
            .findOneByOrFail({ idRepartidor: courier.idRepartidor }),
        ).toMatchObject({ disponibilidad: 'DISPONIBLE' });
        expect(
          await observer
            .getRepository(Order)
            .findOneByOrFail({ idPedido: order.idPedido }),
        ).toMatchObject({ estado: 'PREPARANDO' });
      }
    },
  );

  async function race(id: number, actions: Transition[]) {
    const blocker = observer.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    let pending:
      Promise<PromiseSettledResult<DeliveryResponseDto>[]> | undefined;
    try {
      await blocker.query(
        'SELECT id_entrega FROM entrega WHERE id_entrega = $1 FOR UPDATE',
        [id],
      );
      pending = Promise.allSettled(
        actions.map((a) => transition(a, id, parallelService)),
      );
      const deadline = Date.now() + 1500;
      let waiting = 0;
      while (Date.now() < deadline) {
        const [row] = await observer.query<{ count: string }[]>(
          "SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'chorotega-b5-pool-2' AND wait_event_type = 'Lock'",
        );
        waiting = Number(row.count);
        if (waiting === 2) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(waiting).toBe(2);
    } finally {
      try {
        await blocker.rollbackTransaction();
      } finally {
        await blocker.release();
      }
      if (pending) await pending;
    }
    return pending;
  }

  it.each(['start', 'complete'] as const)(
    'dos %s concurrentes de la misma entrega confirman una sola transición',
    async (action) => {
      const delivery = await assign();
      if (action === 'complete') await transition('start', delivery.idEntrega);
      const results = await race(delivery.idEntrega, [action, action]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        results.find((r) => r.status === 'rejected')?.reason,
      ).toBeInstanceOf(InvalidDeliveryStateException);
      const saved = await state(delivery.idEntrega);
      expect(saved.delivery.estado).toBe(
        action === 'start' ? 'EN_CAMINO' : 'ENTREGADA',
      );
      expect(saved.order.estado).toBe(
        action === 'start' ? 'EN_CAMINO' : 'ENTREGADO',
      );
      expect(saved.courier.disponibilidad).toBe(
        action === 'start' ? 'OCUPADO' : 'DISPONIBLE',
      );
    },
  );

  it('inicio y cancelación concurrentes conservan un único resultado coherente', async () => {
    const delivery = await assign();
    const results = await race(delivery.idEntrega, ['start', 'cancel']);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')?.reason).toBeInstanceOf(
      InvalidDeliveryStateException,
    );
    const saved = await state(delivery.idEntrega);
    if (saved.delivery.estado === 'CANCELADA') {
      expect(saved.order.estado).toBe('PREPARANDO');
      expect(saved.courier.disponibilidad).toBe('DISPONIBLE');
    } else {
      expect(saved.delivery.estado).toBe('EN_CAMINO');
      expect(saved.order.estado).toBe('EN_CAMINO');
      expect(saved.courier.disponibilidad).toBe('OCUPADO');
    }
  });

  it('un lock_timeout real revierte y libera el pool antes de reintentar explícitamente', async () => {
    const delivery = await assign();
    const timed = await source(1, 100).initialize();
    const blocker = observer.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    try {
      await blocker.query(
        'SELECT id_entrega FROM entrega WHERE id_entrega = $1 FOR UPDATE',
        [delivery.idEntrega],
      );
      let failure: unknown;
      try {
        await buildService(timed).startDelivery(
          delivery.idEntrega,
          courier.idUsuario,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(QueryFailedError);
      expect(failure).toMatchObject({ driverError: { code: '55P03' } });
      expect(await state(delivery.idEntrega)).toMatchObject({
        delivery: { estado: 'ASIGNADA' },
        order: { estado: 'PREPARANDO' },
        courier: { disponibilidad: 'OCUPADO' },
      });
      await blocker.rollbackTransaction();
      await expect(
        buildService(timed).startDelivery(
          delivery.idEntrega,
          courier.idUsuario,
        ),
      ).resolves.toMatchObject({ estado: 'EN_CAMINO' });
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await timed.destroy();
    }
  });
});
