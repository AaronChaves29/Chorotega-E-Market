import { Courier } from '../../couriers/entities/courier.entity';
import { CouriersRepository } from '../../couriers/repositories/couriers.repository';
import { Neighborhood } from '../../neighborhoods/entities/neighborhood.entity';
import { NeighborhoodsRepository } from '../../neighborhoods/repositories/neighborhoods.repository';
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
import { OrderNotFoundException } from '../exceptions/order-not-found.exception';
import { DeliveriesRepository } from '../repositories/deliveries.repository';
import { DeliveriesService } from './deliveries.service';

describe('DeliveriesService', () => {
  let service: DeliveriesService;

  let deliveriesRepository: jest.Mocked<DeliveriesRepository>;
  let ordersRepository: jest.Mocked<OrdersRepository>;
  let couriersRepository: jest.Mocked<CouriersRepository>;
  let neighborhoodsRepository: jest.Mocked<NeighborhoodsRepository>;

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

    neighborhoodsRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<NeighborhoodsRepository>;

    service = new DeliveriesService(
      deliveriesRepository,
      ordersRepository,
      couriersRepository,
      neighborhoodsRepository,
    );
  });

  describe('assignDelivery', () => {
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

      ordersRepository.findById.mockResolvedValue(order);
      neighborhoodsRepository.findById.mockResolvedValue(neighborhood);
      deliveriesRepository.findActiveByOrderId.mockResolvedValue(null);
      couriersRepository.findById.mockResolvedValue(courier);
      deliveriesRepository.save.mockResolvedValue(savedDelivery);
      couriersRepository.save.mockResolvedValue(courier);

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
      expect(deliveriesRepository.save.mock.calls).toHaveLength(1);
      expect(couriersRepository.save.mock.calls).toContainEqual([courier]);
    });

    it('debe rechazar un pedido inexistente', async () => {
      ordersRepository.findById.mockResolvedValue(null);

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

      ordersRepository.findById.mockResolvedValue(order);

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

      ordersRepository.findById.mockResolvedValue(order);

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

      ordersRepository.findById.mockResolvedValue(order);
      neighborhoodsRepository.findById.mockResolvedValue(neighborhood);

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

      ordersRepository.findById.mockResolvedValue(order);
      neighborhoodsRepository.findById.mockResolvedValue(neighborhood);
      deliveriesRepository.findActiveByOrderId.mockResolvedValue(
        activeDelivery,
      );

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

      ordersRepository.findById.mockResolvedValue(order);
      neighborhoodsRepository.findById.mockResolvedValue(neighborhood);
      deliveriesRepository.findActiveByOrderId.mockResolvedValue(null);
      couriersRepository.findById.mockResolvedValue(courier);

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
      deliveriesRepository.save.mockImplementation((value) =>
        Promise.resolve(value),
      );
      ordersRepository.save.mockImplementation((value) =>
        Promise.resolve(value),
      );

      const result = await service.startDelivery(1);

      expect(result.estado).toBe('EN_CAMINO');
      expect(delivery.estado).toBe('EN_CAMINO');
      expect(order.estado).toBe('EN_CAMINO');

      expect(deliveriesRepository.save.mock.calls).toContainEqual([delivery]);
      expect(ordersRepository.save.mock.calls).toContainEqual([order]);
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
    it('debe completar una entrega correctamente', async () => {
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

      deliveriesRepository.save.mockImplementation((value) =>
        Promise.resolve(value),
      );
      ordersRepository.save.mockImplementation((value) =>
        Promise.resolve(value),
      );
      couriersRepository.save.mockImplementation((value) =>
        Promise.resolve(value),
      );

      const result = await service.completeDelivery(1);

      expect(result.estado).toBe('ENTREGADA');
      expect(delivery.estado).toBe('ENTREGADA');
      expect(delivery.fechaEntrega).toBeInstanceOf(Date);
      expect(order.estado).toBe('ENTREGADO');
      expect(courier.disponibilidad).toBe('DISPONIBLE');

      expect(deliveriesRepository.save.mock.calls).toContainEqual([delivery]);
      expect(ordersRepository.save.mock.calls).toContainEqual([order]);
      expect(couriersRepository.save.mock.calls).toContainEqual([courier]);
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
      deliveriesRepository.save.mockImplementation((value) =>
        Promise.resolve(value),
      );
      couriersRepository.save.mockImplementation((value) =>
        Promise.resolve(value),
      );

      const result = await service.cancelDelivery(1);

      expect(result.estado).toBe('CANCELADA');
      expect(delivery.estado).toBe('CANCELADA');
      expect(courier.disponibilidad).toBe('DISPONIBLE');

      expect(deliveriesRepository.save.mock.calls).toContainEqual([delivery]);
      expect(couriersRepository.save.mock.calls).toContainEqual([courier]);
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
