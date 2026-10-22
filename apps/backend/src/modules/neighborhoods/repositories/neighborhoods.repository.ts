import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Neighborhood } from '../entities/neighborhood.entity';

@Injectable()
export class NeighborhoodsRepository extends TypeOrmBaseRepository<
  Neighborhood,
  Neighborhood['idBarrio']
> {
  constructor(
    @InjectRepository(Neighborhood)
    repository: Repository<Neighborhood>,
  ) {
    super(repository);
  }

  protected whereId(
    id: Neighborhood['idBarrio'],
  ): FindOptionsWhere<Neighborhood> {
    return { idBarrio: id };
  }
}
