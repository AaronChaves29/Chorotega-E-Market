import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { OrderDetail } from '../entities/order-detail.entity';

@Injectable()
export class OrderDetailsRepository extends TypeOrmBaseRepository<
  OrderDetail,
  OrderDetail['idDetalle']
> {
  constructor(
    @InjectRepository(OrderDetail)
    repository: Repository<OrderDetail>,
  ) {
    super(repository);
  }

  protected whereId(
    id: OrderDetail['idDetalle'],
  ): FindOptionsWhere<OrderDetail> {
    return { idDetalle: id };
  }
}
