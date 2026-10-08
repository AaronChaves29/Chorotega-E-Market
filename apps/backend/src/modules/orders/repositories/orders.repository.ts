import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Order } from '../entities/order.entity';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import type { OrderSearchQueryDto } from '../dtos/order-search-query.dto';
import type { OrderReadScope } from '../interfaces/order-read-scope';
import { OrderSearchFilters } from '../interfaces/order-search-filters.interface';

@Injectable()
export class OrdersRepository extends TypeOrmBaseRepository<
  Order,
  Order['idPedido']
> {
  constructor(@InjectRepository(Order) repository: Repository<Order>) {
    super(repository);
  }

  protected whereId(id: Order['idPedido']): FindOptionsWhere<Order> {
    return { idPedido: id };
  }

  findAllWithDetails(): Promise<Order[]> {
    return this.repository
      .createQueryBuilder('pedido')
      .leftJoinAndSelect('pedido.detalles', 'detalle')
      .orderBy('pedido.idPedido', 'ASC')
      .getMany();
  }

  async search(filters: OrderSearchFilters): Promise<Order[]> {
    const query = this.repository
      .createQueryBuilder('pedido')
      .leftJoinAndSelect('pedido.cliente', 'cliente')
      .leftJoinAndSelect('pedido.tienda', 'tienda')
      .leftJoinAndSelect('pedido.barrio', 'barrio')
      .orderBy('pedido.fechaCreacion', 'DESC')
      .addOrderBy('pedido.idPedido', 'DESC');

    if (filters.estado !== undefined) {
      query.andWhere('pedido.estado = :estado', {
        estado: filters.estado,
      });
    }

    if (filters.idCliente !== undefined) {
      query.andWhere('pedido.idCliente = :idCliente', {
        idCliente: filters.idCliente,
      });
    }

    if (filters.idTienda !== undefined) {
      query.andWhere('pedido.idTienda = :idTienda', {
        idTienda: filters.idTienda,
      });
    }

    if (filters.idBarrio !== undefined) {
      query.andWhere('pedido.idBarrio = :idBarrio', {
        idBarrio: filters.idBarrio,
      });
    }

    if (filters.fechaDesde !== undefined) {
      query.andWhere('pedido.fechaCreacion >= :fechaDesde', {
        fechaDesde: filters.fechaDesde,
      });
    }

    if (filters.fechaHasta !== undefined) {
      query.andWhere('pedido.fechaCreacion <= :fechaHasta', {
        fechaHasta: filters.fechaHasta,
      });
    }

    return query.getMany();
  }

  private visibleQuery(scope: OrderReadScope) {
    const query = this.repository.createQueryBuilder('pedido');
    if (scope.rol === 'CLIENTE') {
      query.andWhere('pedido.idCliente = :scopeUserId', {
        scopeUserId: scope.idUsuario,
      });
    } else if (scope.rol === 'EMPRENDEDOR') {
      query.innerJoin('pedido.tienda', 'tienda');
      query.andWhere('tienda.idEmprendedor = :scopeUserId', {
        scopeUserId: scope.idUsuario,
      });
    }
    return query;
  }

  findVisibleWithDetails(
    id: number,
    scope: OrderReadScope,
    detailId?: number,
  ): Promise<Order | null> {
    const query = this.visibleQuery(scope)
      .leftJoinAndSelect('pedido.detalles', 'detalle')
      .andWhere('pedido.idPedido = :orderId', { orderId: id });
    if (detailId !== undefined)
      query.andWhere('detalle.idDetalle = :detailId', { detailId });
    return query.getOne();
  }

  async searchVisible(
    filters: OrderSearchQueryDto,
    scope: OrderReadScope,
  ): Promise<PaginationResult<Order>> {
    const query = this.visibleQuery(scope).leftJoinAndSelect(
      'pedido.detalles',
      'detalle',
    );
    const columns = {
      idPedido: 'pedido.idPedido',
      fechaCreacion: 'pedido.fechaCreacion',
      estado: 'pedido.estado',
      total: 'pedido.total',
    } as const;
    query.orderBy(columns[filters.sortBy], filters.sortDirection);
    if (filters.sortBy !== 'idPedido')
      query.addOrderBy('pedido.idPedido', filters.sortDirection);
    // Parámetros de filtros separados del parámetro obligatorio de autorización.
    for (const field of [
      'estado',
      'idCliente',
      'idTienda',
      'idBarrio',
    ] as const) {
      if (filters[field] !== undefined)
        query.andWhere(`pedido.${field} = :filter_${field}`, {
          [`filter_${field}`]: filters[field],
        });
    }
    if (filters.fechaDesde !== undefined)
      query.andWhere('pedido.fechaCreacion >= :fechaDesde', {
        fechaDesde: new Date(filters.fechaDesde),
      });
    if (filters.fechaHasta !== undefined)
      query.andWhere('pedido.fechaCreacion <= :fechaHasta', {
        fechaHasta: new Date(filters.fechaHasta),
      });
    const [content, totalElements] = await query
      .skip(filters.page * filters.size)
      .take(filters.size)
      .getManyAndCount();
    return {
      content,
      page: filters.page,
      size: filters.size,
      totalElements,
      totalPages: Math.ceil(totalElements / filters.size),
    };
  }
}
