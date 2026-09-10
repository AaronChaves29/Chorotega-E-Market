import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Order } from '../entities/order.entity';

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
}
