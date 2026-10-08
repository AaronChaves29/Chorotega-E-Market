import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import {
  ORDER_STATES,
  OrderSearchQueryDto,
} from '../dtos/order-search-query.dto';
import {
  OrderResponseDto,
  OrderItemResponseDto,
} from '../dtos/order-response.dto';
import type { Order } from '../entities/order.entity';
import type { OrderReadScope } from '../interfaces/order-read-scope';
import { OrderMapper } from '../mappers/order.mapper';
import { OrdersRepository } from '../repositories/orders.repository';

@Injectable()
export class OrdersReadService {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async search(
    user: AuthenticatedUser,
    query: OrderSearchQueryDto,
  ): Promise<PaginationResult<OrderResponseDto>> {
    const scope = this.scope(user);
    for (const value of [query.fechaDesde, query.fechaHasta]) {
      if (value !== undefined && !Number.isFinite(Date.parse(value))) {
        throw new BadRequestException(
          'La fecha debe ser un instante ISO válido.',
        );
      }
    }
    if (
      query.fechaDesde &&
      query.fechaHasta &&
      new Date(query.fechaDesde) > new Date(query.fechaHasta)
    ) {
      throw new BadRequestException(
        'fechaDesde no puede ser posterior a fechaHasta.',
      );
    }
    const result = await this.ordersRepository.searchVisible(query, scope);
    return {
      ...result,
      content: result.content.map((order) => this.toResponse(order)),
    };
  }

  async findById(
    user: AuthenticatedUser,
    id: number,
  ): Promise<OrderResponseDto> {
    this.validateId(id);
    const order = await this.ordersRepository.findVisibleWithDetails(
      id,
      this.scope(user),
    );
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    return this.toResponse(order);
  }

  async findDetails(
    user: AuthenticatedUser,
    id: number,
  ): Promise<OrderItemResponseDto[]> {
    return (await this.findById(user, id)).items;
  }

  async findDetail(
    user: AuthenticatedUser,
    id: number,
    detailId: number,
  ): Promise<OrderItemResponseDto> {
    this.validateId(id);
    this.validateId(detailId);
    const order = await this.ordersRepository.findVisibleWithDetails(
      id,
      this.scope(user),
      detailId,
    );
    if (!order) throw new NotFoundException('Detalle no encontrado.');
    const detail = this.toResponse(order).items[0];
    if (!detail) throw new NotFoundException('Detalle no encontrado.');
    return detail;
  }

  private toResponse(order: Order): OrderResponseDto {
    const state = ORDER_STATES.find((state) => state === order.estado);
    if (!state) throw new Error('Estado de pedido persistido no válido.');
    return OrderMapper.toResponseDto(
      order,
      [...order.detalles].sort((a, b) => a.idDetalle - b.idDetalle),
      state,
    );
  }

  private scope(user: AuthenticatedUser): OrderReadScope {
    if (
      !Number.isInteger(user.idUsuario) ||
      user.idUsuario < 1 ||
      user.idUsuario > 2_147_483_647
    ) {
      throw new UnauthorizedException('Identidad autenticada no válida.');
    }
    switch (user.rol) {
      case 'ADMIN':
        return { rol: 'ADMIN' };
      case 'CLIENTE':
        return { rol: 'CLIENTE', idUsuario: user.idUsuario };
      case 'EMPRENDEDOR':
        return { rol: 'EMPRENDEDOR', idUsuario: user.idUsuario };
      default:
        throw new ForbiddenException(
          'No tiene permisos para consultar pedidos.',
        );
    }
  }

  private validateId(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
      throw new BadRequestException(
        'El identificador debe ser un entero positivo de 32 bits.',
      );
    }
  }
}
