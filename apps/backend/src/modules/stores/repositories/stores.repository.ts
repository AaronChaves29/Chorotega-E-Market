import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Store } from '../entities/store.entity';

@Injectable()
export class StoresRepository extends TypeOrmBaseRepository<
  Store,
  Store['idTienda']
> {
  constructor(@InjectRepository(Store) repository: Repository<Store>) {
    super(repository);
  }

  protected whereId(id: Store['idTienda']): FindOptionsWhere<Store> {
    return { idTienda: id };
  }
}
