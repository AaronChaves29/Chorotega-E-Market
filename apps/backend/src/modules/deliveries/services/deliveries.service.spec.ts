import type {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Courier } from '../../couriers/entities/courier.entity';
import { CouriersRepository } from '../../couriers/repositories/couriers.repository';
import { Neighborhood } from '../../neighborhoods/entities/neighborhood.entity';
import { Order } from '../../orders/entities/order.entity';
import { OrdersRepository } from '../../orders/repositories/orders.repository';
import { Delivery } from '../entities/delivery.entity';
import { ActiveDeliveryExistsException } from '../exceptions/active-delivery-exists.exception';
import { CourierNotAvailableException } from '../exceptions/courier-not-available.exception';
import { CourierNotFoundException } from '../exceptions/courier-not-found.exception';
import { InactiveNeighborhoodException } from '../exceptions/inactive-neighborhood.exception';
import { InvalidDeliveryAddressException } from '../exceptions/invalid-delivery-address.exception';
import { InvalidDeliveryStateException } from '../exceptions/invalid-delivery-state.exception';
import { InvalidOrderStateException } from '../exceptions/invalid-order-state.exception';
import { InvalidAssignmentInputException } from '../exceptions/invalid-assignment-input.exception';
import { NeighborhoodNotFoundException } from '../exceptions/neighborhood-not-found.exception';
import type { AssignDeliveryDto } from '../dtos/assign-delivery.dto';
import { OrderNotFoundException } from '../exceptions/order-not-found.exception';
import { DeliveriesRepository } from '../repositories/deliveries.repository';
import { DeliveriesService } from './deliveries.service';

describe('DeliveriesService', () => {
  let service: DeliveriesService;

  let deliveriesRepository: jest.Mocked<DeliveriesRepository>;
  let ordersRepository: jest.Mocked<OrdersRepository>;
  let couriersRepository: jest.Mocked<CouriersRepository>;
  let transactionalNeighborhoodsRepository: jest.Mocked<
    Repository<Neighborhood>
  >;
  let activeDeliveryQuery: jest.Mocked<SelectQueryBuilder<Delivery>>;

  let dataSource: jest.Mocked<DataSource>;
  let entityManager: jest.Mocked<EntityManager>;

  let transactionalDeliveriesRepository: jest.Mocked<Repository<Delivery>>;
  let transactionalOrdersRepository: jest.Mocked<Repository<Order>>;
  let transactionalCouriersRepository: jest.Mocked<Repository<Courier>>;

  beforeEach(() => {
    deliveriesRepository = {
      findById: jest.fn(),
      findActiveByOrderId: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<DeliveriesRepository>;

    ordersRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<OrdersRepository>;

    couriersRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<CouriersRepository>;

    transactionalNeighborhoodsRepository = {
      findOneBy: jest.fn(),
    } as unknown as jest.Mocked<Repository<Neighborhood>>;
    activeDeliveryQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<Delivery>>;

    transactionalDeliveriesRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(activeDeliveryQuery),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Delivery>>;

    transactionalOrdersRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Order>>;

    transactionalCouriersRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Courier>>;

    entityManager = {
      getRepository: jest.fn((entity) => {
        if (entity === Delivery) {
          return transactionalDeliveriesRepository;
        }

        if (entity === Order) {
          return transactionalOrdersRepository;
        }

        if (entity === Courier) {
          return transactionalCouriersRepository;
        }

        if (entity === Neighborhood)
          return transactionalNeighborhoodsRepository;
        throw new Error('Repositorio transaccional no configurado.');
      }),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(entityManager),
      ),
    } as unknown as jest.Mocked<DataSource>;

    service = new DeliveriesService(
      deliveriesRepository,
      ordersRepository,
      couriersRepository,
      dataSource,
    );
  });

  describe('assignDelivery', () => {
    it.each([
      ['pedido como texto', { idPedido: '1', idRepartidor: 1 }],
      ['repartidor como texto', { idPedido: 1, idRepartidor: '1' }],
      ['pedido cero', { idPedido: 0, idRepartidor: 1 }],
      ['repartidor negativo', { idPedido: 1, idRepartidor: -1 }],
      ['pedido fraccionario', { idPedido: 1.5, idRepartidor: 1 }],
      ['repartidor fraccionario', { idPedido: 1, idRepartidor: 1.5 }],
      ['pedido fuera de int', { idPedido: 2_147_483_648, idRepartidor: 1 }],
      ['repartidor fuera de int', { idPedido: 1, idRepartidor: 2_147_483_648 }],
      ['identificador ausente', { idPedido: 1 }],
      ['valor no numérico', { idPedido: Number.NaN, idRepartidor: 1 }],
      [
        'propiedad adicional',
        { idPedido: 1, idRepartidor: 1, estado: 'ASIGNADA' },
      ],
      ['objeto nulo', null],
      ['arreglo', []],
      ['valor primitivo', '1'],
    ])('rechaza %s antes de consultar o escribir', async (_name, input) => {
      await expect(
        service.assignDelivery(input as AssignDeliveryDto),
      ).rejects.toBeInstanceOf(InvalidAssignmentInputException);
      expect(dataSource.transaction.mock.calls).toHaveLength(0);
      expect(ordersRepository.findById.mock.calls).toHaveLength(0);
      expect(transactionalDeliveriesRepository.save.mock.calls).toHaveLength(0);
      expect(transactionalCouriersRepository.save.mock.calls).toHaveLength(0);
    });

    it('rechaza un barrio inexistente sin escribir', async () => {
      transactionalOrdersRepository.findOne.mockResolvedValue(
        Object.assign(new Order(), {
          idPedido: 1,
          estado: 'PREPARANDO',
          direccionEntrega: 'Nicoya',
          idBarrio: 1,
        }),
      );
      transactionalNeighborhoodsRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.assignDelivery({ idPedido: 1, idRepartidor: 1 }),
      ).rejects.toBeInstanceOf(NeighborhoodNotFoundException);
      expect(transactionalDeliveriesRepository.save.mock.calls).toHaveLength(0);
    });

    it('rechaza un repartidor inexistente sin escribir', async () => {
      transactionalOrdersRepository.findOne.mockResolvedValue(
        Object.assign(new Order(), {
          idPedido: 1,
          estado: 'PREPARANDO',
          direccionEntrega: 'Nicoya',
          idBarrio: 1,
        }),
      );
      transactionalNeighborhoodsRepository.findOneBy.mockResolvedValue(
        Object.assign(new Neighborhood(), { estado: 'ACTIVO' }),
      );
      activeDeliveryQuery.getOne.mockResolvedValue(null);
      transactionalCouriersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.assignDelivery({ idPedido: 1, idRepartidor: 1 }),
      ).rejects.toBeInstanceOf(CourierNotFoundException);
      expect(transactionalDeliveriesRepository.save.mock.calls).toHaveLength(0);
    });

    it('debe asignar una entrega correctamente', async () => {
      const order = {
        idPedido: 1,
        estado: 'PREPARANDO',
        direccionEntrega: 'Nicoya centro',
        idBarrio: 1,
      } as Order;

      const neighborhood = {
        idBarrio: 1,
        estado: 'ACTIVO',
      } as Neighborhood;

      const courier = {
        idRepartidor: 1,
        disponibilidad: 'DISPONIBLE',
      } as Courier;

      const savedDelivery = {
        idEntrega: 1,
        idPedido: 1,
        idRepartidor: 1,
        estado: 'ASIGNADA',
        fechaAsignacion: new Date(),
        fechaEntrega: null,
      } as Delivery;

      transactionalOrdersRepository.findOne.mockResolvedValue(order);
      transactionalNeighborhoodsRepository.findOneBy.mockResolvedValue(
        neighborhood,
      );
      activeDeliveryQuery.getOne.mockResolvedValue(null);
      transactionalCouriersRepository.findOne.mockResolvedValue(courier);
      transactionalDeliveriesRepository.save.mockResolvedValue(savedDelivery);
      transactionalCouriersRepository.save.mockResolvedValue(courier);

      const result = await service.assignDelivery({
        idPedido: 1,
        idRepartidor: 1,
      });

      expect(result).toEqual({
        idEntrega: savedDelivery.idEntrega,
        idPedido: savedDelivery.idPedido,
        idRepartidor: savedDelivery.idRepartidor,
        estado: savedDelivery.estado,
        fechaAsignacion: savedDelivery.fechaAsignacion,
        fechaEntrega: savedDelivery.fechaEntrega,
      });

      expect(courier.disponibilidad).toBe('OCUPADO');

      expect(transactionalOrdersRepository.findOne.mock.calls).toEqual([
        [{ where: { idPedido: 1 }, lock: { mode: 'pessimistic_write' } }],
      ]);
      expect(transactionalCouriersRepository.findOne.mock.calls).toEqual([
        [{ where: { idRepartidor: 1 }, lock: { mode: 'pessimistic_write' } }],
      ]);
      expect(ordersRepository.findById.mock.calls).toHaveLength(0);
      expect(couriersRepository.findById.mock.calls).toHaveLength(0);
      expect(deliveriesRepository.findActiveByOrderId.mock.calls).toHaveLength(
        0,
      );
      expect(result).not.toBeInstanceOf(Delivery);

      expect(dataSource.transaction.mock.calls).toHaveLength(1);

      expect(transactionalDeliveriesRepository.save.mock.calls).toContainEqual([
        expect.any(Delivery),
      ]);

      expect(transactionalCouriersRepository.save.mock.calls).toContainEqual([
        courier,
      ]);

      expect(deliveriesRepository.save.mock.calls).toHaveLength(0);
      expect(couriersRepository.save.mock.calls).toHaveLength(0);
    });

    it('debe rechazar un pedido inexistente', async () => {
      transactionalOrdersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignDelivery({
          idPedido: 1,
          idRepartidor: 1,
        }),
      ).rejects.toBeInstanceOf(OrderNotFoundException);
    });

    it('debe rechazar un pedido que no esté PREPARANDO', async () => {
      const order = {
        idPedido: 1,
        estado: 'CONFIRMADO',
      } as Order;

      transactionalOrdersRepository.findOne.mockResolvedValue(order);

      await expect(
        service.assignDelivery({
          idPedido: 1,
          idRepartidor: 1,
        }),
      ).rejects.toBeInstanceOf(InvalidOrderStateException);
    });

    it('debe rechazar un pedido sin dirección de entrega válida', async () => {
      const order = {
        idPedido: 1,
        estado: 'PREPARANDO',
        direccionEntrega: '   ',
        idBarrio: 1,
      } as Order;

      transactionalOrdersRepository.findOne.mockResolvedValue(order);

      await expect(
        service.assignDelivery({
          idPedido: 1,
          idRepartidor: 1,
        }),
      ).rejects.toBeInstanceOf(InvalidDeliveryAddressException);
    });

    it('debe rechazar un barrio inactivo', async () => {
      const order = {
        idPedido: 1,
        estado: 'PREPARANDO',
        direccionEntrega: 'Nicoya centro',
        idBarrio: 1,
      } as Order;

      const neighborhood = {
        idBarrio: 1,
        estado: 'INACTIVO',
      } as Neighborhood;

      transactionalOrdersRepository.findOne.mockResolvedValue(order);
      transactionalNeighborhoodsRepository.findOneBy.mockResolvedValue(
        neighborhood,
      );

      await expect(
        service.assignDelivery({
          idPedido: 1,
          idRepartidor: 1,
        }),
      ).rejects.toBeInstanceOf(InactiveNeighborhoodException);
    });

    it('debe rechazar un pedido que ya tenga una entrega activa', async () => {
      const order = {
        idPedido: 1,
        estado: 'PREPARANDO',
        direccionEntrega: 'Nicoya centro',
        idBarrio: 1,
      } as Order;

      const neighborhood = {
        idBarrio: 1,
        estado: 'ACTIVO',
      } as Neighborhood;

      const activeDelivery = {
        idEntrega: 10,
        idPedido: 1,
        idRepartidor: 2,
        estado: 'ASIGNADA',
      } as Delivery;

      transactionalOrdersRepository.findOne.mockResolvedValue(order);
      transactionalNeighborhoodsRepository.findOneBy.mockResolvedValue(
        neighborhood,
      );
      activeDeliveryQuery.getOne.mockResolvedValue(activeDelivery);

      await expect(
        service.assignDelivery({
          idPedido: 1,
          idRepartidor: 1,
        }),
      ).rejects.toBeInstanceOf(ActiveDeliveryExistsException);
    });

    it('debe rechazar un repartidor que no esté disponible', async () => {
      const order = {
        idPedido: 1,
        estado: 'PREPARANDO',
        direccionEntrega: 'Nicoya centro',
        idBarrio: 1,
      } as Order;

      const neighborhood = {
        idBarrio: 1,
        estado: 'ACTIVO',
      } as Neighborhood;

      const courier = {
        idRepartidor: 1,
        disponibilidad: 'OCUPADO',
      } as Courier;

      transactionalOrdersRepository.findOne.mockResolvedValue(order);
      transactionalNeighborhoodsRepository.findOneBy.mockResolvedValue(
        neighborhood,
      );
      activeDeliveryQuery.getOne.mockResolvedValue(null);
      transactionalCouriersRepository.findOne.mockResolvedValue(courier);

      await expect(
        service.assignDelivery({
          idPedido: 1,
          idRepartidor: 1,
        }),
      ).rejects.toBeInstanceOf(CourierNotAvailableException);
    });
  });

  describe('startDelivery', () => {
    it('debe iniciar una entrega correctamente', async () => {
      const delivery = {
        idEntrega: 1,
        idPedido: 1,
        idRepartidor: 1,
        estado: 'ASIGNADA',
        fechaAsignacion: new Date(),
        fechaEntrega: null,
      } as Delivery;

      const order = {
        idPedido: 1,
        estado: 'PREPARANDO',
      } as Order;

      deliveriesRepository.findById.mockResolvedValue(delivery);
      ordersRepository.findById.mockResolvedValue(order);

      transactionalDeliveriesRepository.save.mockImplementation((value) =>
        Promise.resolve(value as Delivery),
      );

      transactionalOrdersRepository.save.mockImplementation((value) =>
        Promise.resolve(value as Order),
      );

      const result = await service.startDelivery(1);

      expect(result.estado).toBe('EN_CAMINO');
      expect(delivery.estado).toBe('EN_CAMINO');
      expect(order.estado).toBe('EN_CAMINO');

      expect(dataSource.transaction.mock.calls).toHaveLength(1);

      expect(transactionalDeliveriesRepository.save.mock.calls).toContainEqual([
        delivery,
      ]);

      expect(transactionalOrdersRepository.save.mock.calls).toContainEqual([
        order,
      ]);

      expect(deliveriesRepository.save.mock.calls).toHaveLength(0);
      expect(ordersRepository.save.mock.calls).toHaveLength(0);
    });

    it('debe rechazar iniciar una entrega que no esté ASIGNADA', async () => {
      const delivery = {
        idEntrega: 1,
        idPedido: 1,
        idRepartidor: 1,
        estado: 'EN_CAMINO',
      } as Delivery;

      deliveriesRepository.findById.mockResolvedValue(delivery);

      await expect(service.startDelivery(1)).rejects.toBeInstanceOf(
        InvalidDeliveryStateException,
      );
    });
  });

  describe('completeDelivery', () => {
    it('debe completar una entrega correctamente dentro de una transacción', async () => {
      const delivery = {
        idEntrega: 1,
        idPedido: 1,
        idRepartidor: 1,
        estado: 'EN_CAMINO',
        fechaAsignacion: new Date(),
        fechaEntrega: null,
      } as Delivery;

      const order = {
        idPedido: 1,
        estado: 'EN_CAMINO',
      } as Order;

      const courier = {
        idRepartidor: 1,
        disponibilidad: 'OCUPADO',
      } as Courier;

      deliveriesRepository.findById.mockResolvedValue(delivery);
      ordersRepository.findById.mockResolvedValue(order);
      couriersRepository.findById.mockResolvedValue(courier);

      transactionalDeliveriesRepository.save.mockImplementation((value) =>
        Promise.resolve(value as Delivery),
      );

      transactionalOrdersRepository.save.mockImplementation((value) =>
        Promise.resolve(value as Order),
      );

      transactionalCouriersRepository.save.mockImplementation((value) =>
        Promise.resolve(value as Courier),
      );

      const result = await service.completeDelivery(1);

      expect(result.estado).toBe('ENTREGADA');
      expect(delivery.estado).toBe('ENTREGADA');
      expect(delivery.fechaEntrega).toBeInstanceOf(Date);
      expect(order.estado).toBe('ENTREGADO');
      expect(courier.disponibilidad).toBe('DISPONIBLE');

      expect(dataSource.transaction.mock.calls).toHaveLength(1);

      expect(transactionalDeliveriesRepository.save.mock.calls).toContainEqual([
        delivery,
      ]);

      expect(transactionalOrdersRepository.save.mock.calls).toContainEqual([
        order,
      ]);

      expect(transactionalCouriersRepository.save.mock.calls).toContainEqual([
        courier,
      ]);

      expect(deliveriesRepository.save.mock.calls).toHaveLength(0);
      expect(ordersRepository.save.mock.calls).toHaveLength(0);
      expect(couriersRepository.save.mock.calls).toHaveLength(0);
    });

    it('debe rechazar completar una entrega que no esté EN_CAMINO', async () => {
      const delivery = {
        idEntrega: 1,
        idPedido: 1,
        idRepartidor: 1,
        estado: 'ASIGNADA',
      } as Delivery;

      deliveriesRepository.findById.mockResolvedValue(delivery);

      await expect(service.completeDelivery(1)).rejects.toBeInstanceOf(
        InvalidDeliveryStateException,
      );

      expect(dataSource.transaction.mock.calls).toHaveLength(0);
    });

    it('debe rechazar completar la entrega si el repartidor no existe', async () => {
      const delivery = {
        idEntrega: 1,
        idPedido: 1,
        idRepartidor: 99,
        estado: 'EN_CAMINO',
      } as Delivery;

      const order = {
        idPedido: 1,
        estado: 'EN_CAMINO',
      } as Order;

      deliveriesRepository.findById.mockResolvedValue(delivery);
      ordersRepository.findById.mockResolvedValue(order);
      couriersRepository.findById.mockResolvedValue(null);

      await expect(service.completeDelivery(1)).rejects.toBeInstanceOf(
        CourierNotFoundException,
      );

      expect(dataSource.transaction.mock.calls).toHaveLength(0);
    });
  });

  describe('cancelDelivery', () => {
    it('debe cancelar una entrega asignada y liberar al repartidor', async () => {
      const delivery = {
        idEntrega: 1,
        idPedido: 1,
        idRepartidor: 1,
        estado: 'ASIGNADA',
        fechaAsignacion: new Date(),
        fechaEntrega: null,
      } as Delivery;

      const courier = {
        idRepartidor: 1,
        disponibilidad: 'OCUPADO',
      } as Courier;

      deliveriesRepository.findById.mockResolvedValue(delivery);
      couriersRepository.findById.mockResolvedValue(courier);

      transactionalDeliveriesRepository.save.mockImplementation((value) =>
        Promise.resolve(value as Delivery),
      );

      transactionalCouriersRepository.save.mockImplementation((value) =>
        Promise.resolve(value as Courier),
      );

      const result = await service.cancelDelivery(1);

      expect(result.estado).toBe('CANCELADA');
      expect(delivery.estado).toBe('CANCELADA');
      expect(courier.disponibilidad).toBe('DISPONIBLE');

      expect(dataSource.transaction.mock.calls).toHaveLength(1);

      expect(transactionalDeliveriesRepository.save.mock.calls).toContainEqual([
        delivery,
      ]);

      expect(transactionalCouriersRepository.save.mock.calls).toContainEqual([
        courier,
      ]);

      expect(deliveriesRepository.save.mock.calls).toHaveLength(0);
      expect(couriersRepository.save.mock.calls).toHaveLength(0);
    });

    it('debe rechazar cancelar una entrega que ya esté EN_CAMINO', async () => {
      const delivery = {
        idEntrega: 1,
        idPedido: 1,
        idRepartidor: 1,
        estado: 'EN_CAMINO',
      } as Delivery;

      deliveriesRepository.findById.mockResolvedValue(delivery);

      await expect(service.cancelDelivery(1)).rejects.toBeInstanceOf(
        InvalidDeliveryStateException,
      );
    });
  });
});
