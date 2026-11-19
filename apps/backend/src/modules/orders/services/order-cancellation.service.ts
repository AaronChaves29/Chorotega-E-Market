import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { Delivery } from '../../deliveries/entities/delivery.entity';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductsRepository } from '../../products/repositories/products.repository';
import { transitionOrderState } from '../domain/order-state';
import { OrderResponseDto } from '../dtos/order-response.dto';
import { Order } from '../entities/order.entity';
import { OrderMapper } from '../mappers/order.mapper';

@Injectable()
export class OrderCancellationService {
  constructor(private readonly dataSource: DataSource) {}

  async cancel(
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
    if (actor.rol !== 'CLIENTE')
      throw new ForbiddenException(
        'Solo el cliente propietario puede cancelar el pedido.',
      );
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647)
      throw new BadRequestException(
        'El identificador debe ser un entero positivo de 32 bits.',
      );

    return this.dataSource.transaction(async (manager) => {
      const orders = manager.getRepository(Order);
      // Preparation and assignment lock this same order before changing it.
      const order = await orders.findOne({
        where: { idPedido: id, idCliente: actor.idUsuario },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Pedido no encontrado.');
      const state = transitionOrderState(order.estado, 'CANCELADO', {
        confirmedCancellationAllowed: true,
      });
      if (
        await manager.getRepository(Delivery).exists({
          where: {
            idPedido: id,
            estado: In(['ASIGNADA', 'EN_CAMINO', 'ENTREGADA']),
          },
        })
      )
        throw new ConflictException(
          'El pedido tiene una entrega que impide cancelarlo.',
        );
      const details = await manager
        .getRepository(OrderDetail)
        .find({ where: { idPedido: id }, order: { idProducto: 'ASC' } });
      // PENDIENTE precedes stock deduction. The public purchase commits CONFIRMADO
      // atomically; never infer a stock reservation from a pending order's lines.
      if (order.estado === 'CONFIRMADO' && details.length) {
        const quantities = new Map<number, number>();
        for (const line of details)
          quantities.set(
            line.idProducto,
            (quantities.get(line.idProducto) ?? 0) + line.cantidad,
          );
        const repository = manager.getRepository(Product);
        // Same ascending product lock order as purchase; edit waits on these rows.
        const products = await new ProductsRepository(
          repository,
        ).findByIdsForUpdate([...quantities.keys()]);
        if (products.length !== quantities.size)
          throw new ConflictException(
            'No se puede restaurar el inventario del pedido.',
          );
        for (const product of products) {
          const quantity =
            product.cantidadDisponible + quantities.get(product.idProducto)!;
          if (!Number.isSafeInteger(quantity) || quantity > 2_147_483_647)
            throw new ConflictException(
              'No se puede restaurar el inventario del pedido.',
            );
          product.cantidadDisponible = quantity;
          // TypeORM increments VersionColumn, invalidating stale stock edits.
          await repository.save(product);
        }
      }
      await orders.update({ idPedido: id }, { estado: state });
      return OrderMapper.toResponseDto(order, details, state);
    });
  }
}
