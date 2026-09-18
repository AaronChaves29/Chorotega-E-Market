import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Delivery } from '../entities/delivery.entity';
import { DeliverySearchFilters } from '../interfaces/delivery-search-filters.interface';

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

  async search(filters: DeliverySearchFilters): Promise<Delivery[]> {
    const query = this.repository
      .createQueryBuilder('entrega')
      .leftJoinAndSelect('entrega.pedido', 'pedido')
      .leftJoinAndSelect('entrega.repartidor', 'repartidor')
      .orderBy('entrega.fechaAsignacion', 'DESC')
      .addOrderBy('entrega.idEntrega', 'DESC');

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

    return query.getMany();
  }
}
