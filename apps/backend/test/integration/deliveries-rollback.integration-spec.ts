import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource, Repository } from 'typeorm';
import {
  startPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../support/postgres-test-database';
import { User } from '../../src/modules/users/entities/user.entity';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { Neighborhood } from '../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Order } from '../../src/modules/orders/entities/order.entity';
import { Courier } from '../../src/modules/couriers/entities/courier.entity';
import { Delivery } from '../../src/modules/deliveries/entities/delivery.entity';
import { DeliveriesRepository } from '../../src/modules/deliveries/repositories/deliveries.repository';
import { OrdersRepository } from '../../src/modules/orders/repositories/orders.repository';
import { CouriersRepository } from '../../src/modules/couriers/repositories/couriers.repository';
import { NeighborhoodsRepository } from '../../src/modules/neighborhoods/repositories/neighborhoods.repository';
import { DeliveriesService } from '../../src/modules/deliveries/services/deliveries.service';

describe('Deliveries transaction rollback integration', () => {
  let database: PostgresTestDatabase | undefined;
  let dataSource: DataSource;

  let userRepository: Repository<User>;
  let storeRepository: Repository<Store>;
  let neighborhoodRepository: Repository<Neighborhood>;
  let orderRepository: Repository<Order>;
  let courierRepository: Repository<Courier>;
  let deliveryRepository: Repository<Delivery>;

  let deliveriesService: DeliveriesService;

  beforeAll(async () => {
    database = await startPostgresTestDatabase();
    dataSource = database.dataSource;

    userRepository = dataSource.getRepository(User);
    storeRepository = dataSource.getRepository(Store);
    neighborhoodRepository = dataSource.getRepository(Neighborhood);
    orderRepository = dataSource.getRepository(Order);
    courierRepository = dataSource.getRepository(Courier);
    deliveryRepository = dataSource.getRepository(Delivery);

    const deliveriesRepository = new DeliveriesRepository(deliveryRepository);
    const ordersRepository = new OrdersRepository(orderRepository);
    const couriersRepository = new CouriersRepository(courierRepository);
    const neighborhoodsRepository = new NeighborhoodsRepository(
      neighborhoodRepository,
    );

    deliveriesService = new DeliveriesService(
      deliveriesRepository,
      ordersRepository,
      couriersRepository,
      neighborhoodsRepository,
      dataSource,
    );
  });

  afterEach(async () => {
    if (!database) {
      return;
    }

    await database.dataSource.query(`
      DROP TRIGGER IF EXISTS trg_test_fail_order_update ON pedido;
    `);

    await database.dataSource.query(`
      DROP FUNCTION IF EXISTS fail_order_update_for_rollback_test();
    `);

    await database.dataSource.query(`
      TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor,
        barrio, producto, categoria, tienda, usuario RESTART IDENTITY
    `);
  });

  afterAll(async () => {
    await database?.stop();
  });

  it('should rollback all changes when completing a delivery fails during the transaction', async () => {
    const entrepreneur = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Emprendedor',
        apellido: 'Rollback',
        correo: `emprendedor-${randomUUID()}@test.com`,
        telefono: '88888888',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      }),
    );

    const customer = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Cliente',
        apellido: 'Rollback',
        correo: `cliente-${randomUUID()}@test.com`,
        telefono: '87777777',
        rol: 'CLIENTE',
        estado: 'ACTIVO',
      }),
    );

    const courierUser = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Repartidor',
        apellido: 'Rollback',
        correo: `repartidor-${randomUUID()}@test.com`,
        telefono: '86666666',
        rol: 'REPARTIDOR',
        estado: 'ACTIVO',
      }),
    );

    const store = await storeRepository.save(
      storeRepository.create({
        idEmprendedor: entrepreneur.idUsuario,
        nombre: `Tienda Rollback ${randomUUID()}`,
        descripcion: 'Tienda para prueba de rollback',
        direccion: 'Nicoya',
        telefono: '26660000',
        horario: '8:00 - 17:00',
        estado: 'ACTIVA',
      }),
    );

    const neighborhood = await neighborhoodRepository.save(
      neighborhoodRepository.create({
        nombre: `Barrio Rollback ${randomUUID()}`,
        tarifaEnvio: '1500.00',
        estado: 'ACTIVO',
      }),
    );

    const order = await orderRepository.save(
      orderRepository.create({
        idCliente: customer.idUsuario,
        idTienda: store.idTienda,
        idBarrio: neighborhood.idBarrio,
        estado: 'EN_CAMINO',
        subtotal: '10000.00',
        tarifaEnvio: '1500.00',
        total: '11500.00',
        direccionEntrega: 'Dirección de prueba rollback',
      }),
    );

    const courier = await courierRepository.save(
      courierRepository.create({
        idUsuario: courierUser.idUsuario,
        medioTransporte: 'MOTO',
        disponibilidad: 'OCUPADO',
      }),
    );

    const delivery = await deliveryRepository.save(
      deliveryRepository.create({
        idPedido: order.idPedido,
        idRepartidor: courier.idRepartidor,
        estado: 'EN_CAMINO',
        fechaAsignacion: new Date(),
        fechaEntrega: null,
      }),
    );

    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_order_update_for_rollback_test()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced rollback test failure';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await dataSource.query(`
      CREATE TRIGGER trg_test_fail_order_update
      BEFORE UPDATE ON pedido
      FOR EACH ROW
      EXECUTE FUNCTION fail_order_update_for_rollback_test();
    `);

    await expect(
      deliveriesService.completeDelivery(delivery.idEntrega),
    ).rejects.toThrow('forced rollback test failure');

    const persistedDelivery = await deliveryRepository.findOneByOrFail({
      idEntrega: delivery.idEntrega,
    });

    const persistedOrder = await orderRepository.findOneByOrFail({
      idPedido: order.idPedido,
    });

    const persistedCourier = await courierRepository.findOneByOrFail({
      idRepartidor: courier.idRepartidor,
    });

    expect(persistedDelivery.estado).toBe('EN_CAMINO');
    expect(persistedDelivery.fechaEntrega).toBeNull();

    expect(persistedOrder.estado).toBe('EN_CAMINO');

    expect(persistedCourier.disponibilidad).toBe('OCUPADO');
  });
});
