import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Order } from '../entities/order.entity';
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
}
