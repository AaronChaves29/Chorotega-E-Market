import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { transitionOrderState } from '../domain/order-state';
import { OrderResponseDto } from '../dtos/order-response.dto';
import { Order } from '../entities/order.entity';
import { OrderMapper } from '../mappers/order.mapper';
import { OrdersRepository } from '../repositories/orders.repository';

@Injectable()
export class OrderPreparationService {
  constructor(private readonly dataSource: DataSource) {}

  async prepare(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<OrderResponseDto> {
    if (
      !actor ||
      !Number.isInteger(actor.idUsuario) ||
      actor.idUsuario < 1 ||
      actor.idUsuario > 2_147_483_647
    )
      throw new UnauthorizedException('Identidad autenticada no válida.');
    if (actor.rol !== 'EMPRENDEDOR')
      throw new ForbiddenException(
        'Solo el emprendedor propietario puede preparar el pedido.',
      );
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647)
      throw new BadRequestException(
        'El identificador debe ser un entero positivo de 32 bits.',
      );

    return this.dataSource.transaction(async (manager) => {
      const orders = manager.getRepository(Order);
      const order = await new OrdersRepository(orders).findOwnedForUpdate(
        id,
        actor.idUsuario,
      );
      // Same response for a missing order and an order belonging to someone else.
      if (!order) throw new NotFoundException('Pedido no encontrado.');
      const state = transitionOrderState(order.estado, 'PREPARANDO');
      // Only change state. Never re-save prices, stock or historical details.
      await orders.update({ idPedido: id }, { estado: state });
      const details = await manager.getRepository(OrderDetail).find({
        where: { idPedido: id },
        order: { idDetalle: 'ASC' },
      });
      return OrderMapper.toResponseDto(order, details, state);
    });
  }
}
