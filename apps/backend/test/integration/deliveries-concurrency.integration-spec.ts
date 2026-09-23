import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Courier } from '../../src/modules/couriers/entities/courier.entity';
import { DeliveriesModule } from '../../src/modules/deliveries/deliveries.module';
import { Delivery } from '../../src/modules/deliveries/entities/delivery.entity';
import { ActiveDeliveryExistsException } from '../../src/modules/deliveries/exceptions/active-delivery-exists.exception';
import { CourierNotAvailableException } from '../../src/modules/deliveries/exceptions/courier-not-available.exception';
import { DeliveriesService } from '../../src/modules/deliveries/services/deliveries.service';
import { Neighborhood } from '../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Order } from '../../src/modules/orders/entities/order.entity';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import {
  type PostgresTestDatabase,
  startPostgresTestDatabase,
} from '../support/postgres-test-database';

describe('Asignación de entregas: concurrencia real', () => {
  let database: PostgresTestDatabase | undefined;
  let module: TestingModule | undefined;
  let source: DataSource;
  let service: DeliveriesService;

  beforeAll(async () => {
    database = await startPostgresTestDatabase();
    source = database.dataSource;
    module = await Test.createTestingModule({ imports: [DeliveriesModule] })
      .useMocker((token) => (token === DataSource ? source : undefined))
      .compile();
    service = module.get(DeliveriesService);
  });

  afterEach(async () => {
    if (database)
      await source.query(`TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor,
      barrio, producto, categoria, tienda, usuario RESTART IDENTITY`);
  });

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      await database?.stop();
    }
  });

  async function fixture() {
    const users = source.getRepository(User);
    const owner = await users.save(
      users.create({
        authId: randomUUID(),
        nombre: 'Prueba',
        apellido: 'Propietario',
        correo: 'owner@example.test',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      }),
    );
    const stores = source.getRepository(Store);
    const store = await stores.save(
      stores.create({
        idEmprendedor: owner.idUsuario,
        nombre: 'Temporal',
        direccion: 'Nicoya',
        estado: 'ACTIVA',
      }),
    );
    const neighborhoods = source.getRepository(Neighborhood);
    const neighborhood = await neighborhoods.save(
      neighborhoods.create({
        nombre: 'Temporal',
        tarifaEnvio: '0.00',
        estado: 'ACTIVO',
      }),
    );
    const orders = source.getRepository(Order);
    const orderData = {
      idCliente: owner.idUsuario,
      idTienda: store.idTienda,
      idBarrio: neighborhood.idBarrio,
      estado: 'PREPARANDO',
      subtotal: '1.00',
      tarifaEnvio: '0.00',
      total: '1.00',
      direccionEntrega: 'Nicoya',
    };
    const firstOrder = await orders.save(orders.create(orderData));
    const secondOrder = await orders.save(orders.create(orderData));
    const courierUsers = await users.save(
      [1, 2].map((id) =>
        users.create({
          authId: randomUUID(),
          nombre: 'Repartidor',
          apellido: `Prueba ${id}`,
          correo: `courier${id}@example.test`,
          rol: 'REPARTIDOR',
          estado: 'ACTIVO',
        }),
      ),
    );
    const couriers = source.getRepository(Courier);
    const savedCouriers = await couriers.save(
      courierUsers.map((user) =>
        couriers.create({
          idUsuario: user.idUsuario,
          medioTransporte: 'MOTO',
          disponibilidad: 'DISPONIBLE',
        }),
      ),
    );
    return {
      firstOrder,
      secondOrder,
      firstCourier: savedCouriers[0],
      secondCourier: savedCouriers[1],
    };
  }

  async function race(
    lockSql: string,
    id: number,
    assignments: { idPedido: number; idRepartidor: number }[],
  ) {
    const blocker = source.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    let pending: ReturnType<typeof Promise.allSettled> | undefined;
    try {
      await blocker.query(lockSql, [id]);
      pending = Promise.allSettled(
        assignments.map((dto) => service.assignDelivery(dto)),
      );
      // Se espera evidencia de las dos operaciones en PostgreSQL, no un retardo arbitrario.
      const deadline = Date.now() + 10_000;
      let waiting = 0;
      do {
        const rows = await source.query<
          { count: string }[]
        >(`SELECT count(*)::text AS count
          FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`);
        waiting = Number(rows[0].count);
        if (waiting < 2) await delay(20);
      } while (waiting < 2 && Date.now() < deadline);
      expect(waiting).toBeGreaterThanOrEqual(2);
    } finally {
      // Se libera incluso si falla la comprobación, para no dejar operaciones pendientes.
      try {
        await blocker.rollbackTransaction();
      } finally {
        await blocker.release();
      }
      if (pending) await pending;
    }
    return pending;
  }

  it('rechaza la segunda asignación del mismo pedido con repartidores diferentes', async () => {
    const { firstOrder, firstCourier, secondCourier } = await fixture();
    const results = await race(
      'SELECT id_pedido FROM pedido WHERE id_pedido = $1 FOR UPDATE',
      firstOrder.idPedido,
      [
        {
          idPedido: firstOrder.idPedido,
          idRepartidor: firstCourier.idRepartidor,
        },
        {
          idPedido: firstOrder.idPedido,
          idRepartidor: secondCourier.idRepartidor,
        },
      ],
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected')?.reason,
    ).toBeInstanceOf(ActiveDeliveryExistsException);
    expect(
      await source
        .getRepository(Delivery)
        .countBy({ idPedido: firstOrder.idPedido, estado: 'ASIGNADA' }),
    ).toBe(1);
    expect(
      await source
        .getRepository(Courier)
        .countBy({ disponibilidad: 'OCUPADO' }),
    ).toBe(1);
    expect(
      await source
        .getRepository(Courier)
        .countBy({ disponibilidad: 'DISPONIBLE' }),
    ).toBe(1);
  });

  it('rechaza ocupar al mismo repartidor para dos pedidos simultáneos', async () => {
    const { firstOrder, secondOrder, firstCourier } = await fixture();
    const results = await race(
      'SELECT id_repartidor FROM repartidor WHERE id_repartidor = $1 FOR UPDATE',
      firstCourier.idRepartidor,
      [
        {
          idPedido: firstOrder.idPedido,
          idRepartidor: firstCourier.idRepartidor,
        },
        {
          idPedido: secondOrder.idPedido,
          idRepartidor: firstCourier.idRepartidor,
        },
      ],
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected')?.reason,
    ).toBeInstanceOf(CourierNotAvailableException);
    expect(
      await source.getRepository(Delivery).countBy({
        idRepartidor: firstCourier.idRepartidor,
        estado: 'ASIGNADA',
      }),
    ).toBe(1);
    expect(
      await source
        .getRepository(Courier)
        .findOneByOrFail({ idRepartidor: firstCourier.idRepartidor }),
    ).toMatchObject({ disponibilidad: 'OCUPADO' });
    expect(
      await source.getRepository(Order).countBy({ estado: 'PREPARANDO' }),
    ).toBe(2);
  });
});
