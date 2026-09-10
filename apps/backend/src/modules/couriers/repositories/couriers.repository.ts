import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Courier } from '../entities/courier.entity';

@Injectable()
export class CouriersRepository extends TypeOrmBaseRepository<
  Courier,
  Courier['idRepartidor']
> {
  constructor(@InjectRepository(Courier) repository: Repository<Courier>) {
    super(repository);
  }

  protected whereId(id: Courier['idRepartidor']): FindOptionsWhere<Courier> {
    return { idRepartidor: id };
  }
}
