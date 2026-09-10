import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Delivery } from '../entities/delivery.entity';

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
}
