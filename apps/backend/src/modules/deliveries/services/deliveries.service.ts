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
import { DeliverySearchFilters } from '../interfaces/delivery-search-filters.interface';
import { PaginationResult } from 'src/common/pagination/pagination-result';
import { DeliveryAccessDeniedException } from '../exceptions/delivery-access-denied.exception';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import type { DeliveryReadScope } from '../interfaces/delivery-read-scope.interface';

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

  async startDelivery(
    idEntrega: number,
    idUsuario: number,
  ): Promise<DeliveryResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const transactionalDeliveriesRepository = manager.getRepository(Delivery);
      const transactionalOrdersRepository = manager.getRepository(Order);

      const delivery = await transactionalDeliveriesRepository.findOne({
        where: { idEntrega },
        lock: { mode: 'pessimistic_write' },
      });

      if (!delivery) {
        throw new DeliveryNotFoundException(idEntrega);
      }

      await this.assertCourierOwnsDelivery(delivery, idUsuario);

      if (delivery.estado !== 'ASIGNADA') {
        throw new InvalidDeliveryStateException(delivery.estado, 'ASIGNADA');
      }

      const order = await transactionalOrdersRepository.findOne({
        where: { idPedido: delivery.idPedido },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new OrderNotFoundException(delivery.idPedido);
      }

      delivery.estado = 'EN_CAMINO';
      order.estado = 'EN_CAMINO';

      const savedDelivery =
        await transactionalDeliveriesRepository.save(delivery);

      await transactionalOrdersRepository.save(order);

      return DeliveryMapper.toResponseDto(savedDelivery);
    });
  }

  async completeDelivery(
    idEntrega: number,
    idUsuario: number,
  ): Promise<DeliveryResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const transactionalDeliveriesRepository = manager.getRepository(Delivery);
      const transactionalOrdersRepository = manager.getRepository(Order);
      const transactionalCouriersRepository = manager.getRepository(Courier);

      const delivery = await transactionalDeliveriesRepository.findOne({
        where: { idEntrega },
        lock: { mode: 'pessimistic_write' },
      });

      if (!delivery) {
        throw new DeliveryNotFoundException(idEntrega);
      }

      await this.assertCourierOwnsDelivery(delivery, idUsuario);

      if (delivery.estado !== 'EN_CAMINO') {
        throw new InvalidDeliveryStateException(delivery.estado, 'EN_CAMINO');
      }

      const order = await transactionalOrdersRepository.findOne({
        where: { idPedido: delivery.idPedido },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new OrderNotFoundException(delivery.idPedido);
      }

      const courier = await transactionalCouriersRepository.findOne({
        where: { idRepartidor: delivery.idRepartidor },
        lock: { mode: 'pessimistic_write' },
      });

      if (!courier) {
        throw new CourierNotFoundException(delivery.idRepartidor);
      }

      delivery.estado = 'ENTREGADA';
      delivery.fechaEntrega = new Date();

      order.estado = 'ENTREGADO';
      courier.disponibilidad = 'DISPONIBLE';

      const savedDelivery =
        await transactionalDeliveriesRepository.save(delivery);

      await transactionalOrdersRepository.save(order);
      await transactionalCouriersRepository.save(courier);

      return DeliveryMapper.toResponseDto(savedDelivery);
    });
  }

  async cancelDelivery(idEntrega: number): Promise<DeliveryResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const transactionalDeliveriesRepository = manager.getRepository(Delivery);

      const transactionalCouriersRepository = manager.getRepository(Courier);

      const delivery = await transactionalDeliveriesRepository.findOne({
        where: { idEntrega },
        lock: { mode: 'pessimistic_write' },
      });

      if (!delivery) {
        throw new DeliveryNotFoundException(idEntrega);
      }

      if (delivery.estado !== 'ASIGNADA') {
        throw new InvalidDeliveryStateException(delivery.estado, 'ASIGNADA');
      }

      const courier = await transactionalCouriersRepository.findOne({
        where: { idRepartidor: delivery.idRepartidor },
        lock: { mode: 'pessimistic_write' },
      });

      if (!courier) {
        throw new CourierNotFoundException(delivery.idRepartidor);
      }

      delivery.estado = 'CANCELADA';
      courier.disponibilidad = 'DISPONIBLE';

      const savedDelivery =
        await transactionalDeliveriesRepository.save(delivery);

      await transactionalCouriersRepository.save(courier);

      return DeliveryMapper.toResponseDto(savedDelivery);
    });
  }

  async search(
    filters: DeliverySearchFilters,
  ): Promise<PaginationResult<DeliveryResponseDto>> {
    const result = await this.deliveriesRepository.search(filters);

    return {
      ...result,
      content: result.content.map((delivery) =>
        DeliveryMapper.toResponseDto(delivery),
      ),
    };
  }

  async findById(idEntrega: number): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveriesRepository.findById(idEntrega);

    if (!delivery) {
      throw new DeliveryNotFoundException(idEntrega);
    }

    return DeliveryMapper.toResponseDto(delivery);
  }

  async searchVisible(
    filters: DeliverySearchFilters,
    user: AuthenticatedUser,
  ): Promise<PaginationResult<DeliveryResponseDto>> {
    const result = await this.deliveriesRepository.searchVisible(
      filters,
      this.readScope(user),
    );
    return {
      ...result,
      content: result.content.map((delivery) =>
        DeliveryMapper.toResponseDto(delivery),
      ),
    };
  }

  async findVisibleById(
    idEntrega: number,
    user: AuthenticatedUser,
  ): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveriesRepository.findVisibleById(
      idEntrega,
      this.readScope(user),
    );
    if (!delivery) throw new DeliveryNotFoundException(idEntrega);
    return DeliveryMapper.toResponseDto(delivery);
  }

  private readScope(user: AuthenticatedUser): DeliveryReadScope {
    if (user.rol === 'ADMIN') return { rol: 'ADMIN' };
    if (user.rol === 'REPARTIDOR')
      return { rol: 'REPARTIDOR', idUsuario: user.idUsuario };
    throw new DeliveryAccessDeniedException();
  }

  private async assertCourierOwnsDelivery(
    delivery: Delivery,
    idUsuario: number,
  ): Promise<void> {
    const courier = await this.couriersRepository.findByUserId(idUsuario);

    if (!courier || courier.idRepartidor !== delivery.idRepartidor) {
      throw new DeliveryAccessDeniedException();
    }
  }
}
