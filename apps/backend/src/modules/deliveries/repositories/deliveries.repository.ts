import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository, SelectQueryBuilder } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Delivery } from '../entities/delivery.entity';
import { DeliverySearchFilters } from '../interfaces/delivery-search-filters.interface';
import { PaginationResult } from '../../../common/pagination/pagination-result';
import type { DeliveryReadScope } from '../interfaces/delivery-read-scope.interface';

@Injectable()
export class DeliveriesRepository extends TypeOrmBaseRepository<
  Delivery,
  Delivery['idEntrega']
> {
  constructor(@InjectRepository(Delivery) repository: Repository<Delivery>) {
    super(repository);
  }

  protected whereId(id: Delivery['idEntrega']): FindOptionsWhere<Delivery> {
    return { idEntrega: id };
  }

  findActiveByOrderId(idPedido: number): Promise<Delivery | null> {
    return this.repository
      .createQueryBuilder('entrega')
      .where('entrega.idPedido = :idPedido', { idPedido })
      .andWhere('entrega.estado IN (:...estados)', {
        estados: ['ASIGNADA', 'EN_CAMINO'],
      })
      .getOne();
  }

  async search(
    filters: DeliverySearchFilters,
  ): Promise<PaginationResult<Delivery>> {
    return this.paginate(this.searchQuery(filters), filters);
  }

  searchVisible(
    filters: DeliverySearchFilters,
    scope: DeliveryReadScope,
  ): Promise<PaginationResult<Delivery>> {
    return this.paginate(
      this.applyScope(this.searchQuery(filters), scope),
      filters,
    );
  }

  findVisibleById(
    idEntrega: number,
    scope: DeliveryReadScope,
  ): Promise<Delivery | null> {
    const query = this.repository
      .createQueryBuilder('entrega')
      .leftJoin('entrega.repartidor', 'repartidor')
      .where('entrega.idEntrega = :idEntrega', { idEntrega });
    return this.applyScope(query, scope).getOne();
  }

  private applyScope(
    query: SelectQueryBuilder<Delivery>,
    scope: DeliveryReadScope,
  ): SelectQueryBuilder<Delivery> {
    if (scope.rol === 'REPARTIDOR') {
      query.andWhere('repartidor.idUsuario = :scopeUserId', {
        scopeUserId: scope.idUsuario,
      });
    }
    return query;
  }

  private searchQuery(
    filters: DeliverySearchFilters,
  ): SelectQueryBuilder<Delivery> {
    const query = this.repository
      .createQueryBuilder('entrega')
      .leftJoinAndSelect('entrega.pedido', 'pedido')
      .leftJoinAndSelect('entrega.repartidor', 'repartidor');

    const sortColumns = {
      fechaAsignacion: 'entrega.fechaAsignacion',
      fechaEntrega: 'entrega.fechaEntrega',
      idEntrega: 'entrega.idEntrega',
    } as const;

    query.orderBy(sortColumns[filters.sortBy], filters.sortDirection);

    if (filters.sortBy !== 'idEntrega') {
      query.addOrderBy('entrega.idEntrega', filters.sortDirection);
    }

    if (filters.estado !== undefined) {
      query.andWhere('entrega.estado = :estado', {
        estado: filters.estado,
      });
    }

    if (filters.idPedido !== undefined) {
      query.andWhere('entrega.idPedido = :idPedido', {
        idPedido: filters.idPedido,
      });
    }

    if (filters.idRepartidor !== undefined) {
      query.andWhere('entrega.idRepartidor = :idRepartidor', {
        idRepartidor: filters.idRepartidor,
      });
    }

    if (filters.fechaDesde !== undefined) {
      query.andWhere('entrega.fechaAsignacion >= :fechaDesde', {
        fechaDesde: filters.fechaDesde,
      });
    }

    if (filters.fechaHasta !== undefined) {
      query.andWhere('entrega.fechaAsignacion <= :fechaHasta', {
        fechaHasta: filters.fechaHasta,
      });
    }

    return query;
  }

  private async paginate(
    query: SelectQueryBuilder<Delivery>,
    filters: DeliverySearchFilters,
  ): Promise<PaginationResult<Delivery>> {
    query.skip(filters.page * filters.size).take(filters.size);

    const [content, totalElements] = await query.getManyAndCount();

    return {
      content,
      page: filters.page,
      size: filters.size,
      totalElements,
      totalPages: Math.ceil(totalElements / filters.size),
    };
  }
}
