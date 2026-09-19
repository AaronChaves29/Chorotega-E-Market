import { Injectable } from '@nestjs/common';
import { CouriersRepository } from '../../couriers/repositories/couriers.repository';
import { OrdersRepository } from '../../orders/repositories/orders.repository';
import { InvalidOrderStateException } from '../exceptions/invalid-order-state.exception';
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
import { NeighborhoodsRepository } from 'src/modules/neighborhoods/repositories/neighborhoods.repository';
import { InvalidDeliveryAddressException } from '../exceptions/invalid-delivery-address.exception';
import { NeighborhoodNotFoundException } from '../exceptions/neighborhood-not-found.exception';
import { InactiveNeighborhoodException } from '../exceptions/inactive-neighborhood.exception';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly deliveriesRepository: DeliveriesRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly couriersRepository: CouriersRepository,
    private readonly neighborhoodsRepository: NeighborhoodsRepository,
  ) {}

  async assignDelivery(dto: AssignDeliveryDto): Promise<DeliveryResponseDto> {
    const { idPedido, idRepartidor } = dto;
    const order = await this.ordersRepository.findById(idPedido);

    if (!order) {
      throw new OrderNotFoundException(idPedido);
    }

    if (order.estado !== 'PREPARANDO') {
      throw new InvalidOrderStateException(order.estado);
    }

    if (!order.direccionEntrega?.trim()) {
      throw new InvalidDeliveryAddressException();
    }

    const neighborhood = await this.neighborhoodsRepository.findById(
      order.idBarrio,
    );

    if (!neighborhood) {
      throw new NeighborhoodNotFoundException(order.idBarrio);
    }

    if (neighborhood.estado !== 'ACTIVO') {
      throw new InactiveNeighborhoodException(order.idBarrio);
    }

    const activeDelivery =
      await this.deliveriesRepository.findActiveByOrderId(idPedido);

    if (activeDelivery) {
      throw new ActiveDeliveryExistsException(idPedido);
    }

    const courier = await this.couriersRepository.findById(idRepartidor);

    if (!courier) {
      throw new CourierNotFoundException(idRepartidor);
    }

    if (courier.disponibilidad !== 'DISPONIBLE') {
      throw new CourierNotAvailableException(courier.disponibilidad);
    }

    const delivery = new Delivery();

    delivery.idPedido = order.idPedido;
    delivery.idRepartidor = courier.idRepartidor;
    delivery.estado = 'ASIGNADA';
    delivery.fechaAsignacion = new Date();
    delivery.fechaEntrega = null;

    const savedDelivery = await this.deliveriesRepository.save(delivery);

    courier.disponibilidad = 'OCUPADO';
    await this.couriersRepository.save(courier);

    return DeliveryMapper.toResponseDto(savedDelivery);
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

    const savedDelivery = await this.deliveriesRepository.save(delivery);
    await this.ordersRepository.save(order);

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

    const savedDelivery = await this.deliveriesRepository.save(delivery);
    await this.ordersRepository.save(order);
    await this.couriersRepository.save(courier);

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

    const savedDelivery = await this.deliveriesRepository.save(delivery);
    await this.couriersRepository.save(courier);

    return DeliveryMapper.toResponseDto(savedDelivery);
  }
}
