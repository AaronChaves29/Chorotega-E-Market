import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CouriersRepository } from '../../couriers/repositories/couriers.repository';
import { OrdersRepository } from '../../orders/repositories/orders.repository';
import { OrderNotFoundException } from '../exceptions/order-not-found.exception';
import { DeliveriesRepository } from '../repositories/deliveries.repository';
import { ActiveDeliveryExistsException } from '../exceptions/active-delivery-exists.exception';
import { CourierNotFoundException } from '../exceptions/courier-not-found.exception';
import { CourierNotAvailableException } from '../exceptions/courier-not-available.exception';
import { Delivery } from '../entities/delivery.entity';
import { DeliveryNotFoundException } from '../exceptions/delivery-not-found.exception';
import { InvalidDeliveryStateException } from '../exceptions/invalid-delivery-state.exception';
import { AssignDeliveryDto } from '../dtos/assign-delivery.dto';
import { DeliveryResponseDto } from '../dtos/delivery-response.dto';
import { DeliveryMapper } from '../mappers/delivery.mapper';
import { NeighborhoodsRepository } from '../../neighborhoods/repositories/neighborhoods.repository';
import { InvalidAssignmentInputException } from '../exceptions/invalid-assignment-input.exception';
import { orderReadyForDelivery } from '../domain/delivery-assignment.specification';
import { Neighborhood } from '../../neighborhoods/entities/neighborhood.entity';
import { NeighborhoodNotFoundException } from '../exceptions/neighborhood-not-found.exception';
import { InactiveNeighborhoodException } from '../exceptions/inactive-neighborhood.exception';
import { DataSource } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { Courier } from '../../couriers/entities/courier.entity';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly deliveriesRepository: DeliveriesRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly couriersRepository: CouriersRepository,
    private readonly dataSource: DataSource,
  ) {}

  async assignDelivery(input: AssignDeliveryDto): Promise<DeliveryResponseDto> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new InvalidAssignmentInputException();
    }
    const dto = plainToInstance(AssignDeliveryDto, input);
    if (
      validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }).length
    ) {
      throw new InvalidAssignmentInputException();
    }

    return this.dataSource.transaction(async (manager) => {
      const { idPedido, idRepartidor } = dto;
      const transactionalOrders = manager.getRepository(Order);
      const transactionalCouriers = manager.getRepository(Courier);
      const deliveries = new DeliveriesRepository(
        manager.getRepository(Delivery),
      );
      const neighborhoods = new NeighborhoodsRepository(
        manager.getRepository(Neighborhood),
      );

      // Orden de bloqueo fijo: pedido, luego repartidor. No se bloquea una entrega inexistente.
      const order = await transactionalOrders.findOne({
        where: { idPedido },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new OrderNotFoundException(idPedido);
      orderReadyForDelivery.assertSatisfiedBy(order);

      const neighborhood = await neighborhoods.findById(order.idBarrio);
      if (!neighborhood)
        throw new NeighborhoodNotFoundException(order.idBarrio);
      if (neighborhood.estado !== 'ACTIVO')
        throw new InactiveNeighborhoodException(order.idBarrio);

      if (await deliveries.findActiveByOrderId(idPedido))
        throw new ActiveDeliveryExistsException(idPedido);

      const courier = await transactionalCouriers.findOne({
        where: { idRepartidor },
        lock: { mode: 'pessimistic_write' },
      });
      if (!courier) throw new CourierNotFoundException(idRepartidor);
      if (courier.disponibilidad !== 'DISPONIBLE')
        throw new CourierNotAvailableException(courier.disponibilidad);

      const delivery = Object.assign(new Delivery(), {
        idPedido: order.idPedido,
        idRepartidor: courier.idRepartidor,
        estado: 'ASIGNADA',
        fechaAsignacion: new Date(),
        fechaEntrega: null,
      });
      courier.disponibilidad = 'OCUPADO';
      const saved = await deliveries.save(delivery);
      await transactionalCouriers.save(courier);
      return DeliveryMapper.toResponseDto(saved);
    });
  }

  async startDelivery(idEntrega: number): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveriesRepository.findById(idEntrega);

    if (!delivery) {
      throw new DeliveryNotFoundException(idEntrega);
    }

    if (delivery.estado !== 'ASIGNADA') {
      throw new InvalidDeliveryStateException(delivery.estado, 'ASIGNADA');
    }

    const order = await this.ordersRepository.findById(delivery.idPedido);

    if (!order) {
      throw new OrderNotFoundException(delivery.idPedido);
    }

    delivery.estado = 'EN_CAMINO';
    order.estado = 'EN_CAMINO';

    const savedDelivery = await this.dataSource.transaction(async (manager) => {
      const transactionalDeliveriesRepository = manager.getRepository(Delivery);

      const transactionalOrdersRepository = manager.getRepository(Order);

      const saved = await transactionalDeliveriesRepository.save(delivery);

      await transactionalOrdersRepository.save(order);

      return saved;
    });

    return DeliveryMapper.toResponseDto(savedDelivery);
  }

  async completeDelivery(idEntrega: number): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveriesRepository.findById(idEntrega);

    if (!delivery) {
      throw new DeliveryNotFoundException(idEntrega);
    }

    if (delivery.estado !== 'EN_CAMINO') {
      throw new InvalidDeliveryStateException(delivery.estado, 'EN_CAMINO');
    }

    const order = await this.ordersRepository.findById(delivery.idPedido);

    if (!order) {
      throw new OrderNotFoundException(delivery.idPedido);
    }

    const courier = await this.couriersRepository.findById(
      delivery.idRepartidor,
    );

    if (!courier) {
      throw new CourierNotFoundException(delivery.idRepartidor);
    }

    delivery.estado = 'ENTREGADA';
    delivery.fechaEntrega = new Date();

    order.estado = 'ENTREGADO';
    courier.disponibilidad = 'DISPONIBLE';

    const savedDelivery = await this.dataSource.transaction(async (manager) => {
      const transactionalDeliveriesRepository = manager.getRepository(Delivery);
      const transactionalOrdersRepository = manager.getRepository(Order);
      const transactionalCouriersRepository = manager.getRepository(Courier);

      const saved = await transactionalDeliveriesRepository.save(delivery);

      await transactionalOrdersRepository.save(order);
      await transactionalCouriersRepository.save(courier);

      return saved;
    });

    return DeliveryMapper.toResponseDto(savedDelivery);
  }

  async cancelDelivery(idEntrega: number): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveriesRepository.findById(idEntrega);

    if (!delivery) {
      throw new DeliveryNotFoundException(idEntrega);
    }

    if (delivery.estado !== 'ASIGNADA') {
      throw new InvalidDeliveryStateException(delivery.estado, 'ASIGNADA');
    }

    const courier = await this.couriersRepository.findById(
      delivery.idRepartidor,
    );

    if (!courier) {
      throw new CourierNotFoundException(delivery.idRepartidor);
    }

    delivery.estado = 'CANCELADA';
    courier.disponibilidad = 'DISPONIBLE';

    const savedDelivery = await this.dataSource.transaction(async (manager) => {
      const transactionalDeliveriesRepository = manager.getRepository(Delivery);
      const transactionalCouriersRepository = manager.getRepository(Courier);

      const saved = await transactionalDeliveriesRepository.save(delivery);

      await transactionalCouriersRepository.save(courier);

      return saved;
    });

    return DeliveryMapper.toResponseDto(savedDelivery);
  }
}
