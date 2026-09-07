import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesRepository extends TypeOrmBaseRepository<
  Category,
  Category['idCategoria']
> {
  constructor(@InjectRepository(Category) repository: Repository<Category>) {
    super(repository);
  }

  protected whereId(id: Category['idCategoria']): FindOptionsWhere<Category> {
    return { idCategoria: id };
  }
}
