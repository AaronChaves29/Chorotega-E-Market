import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Category } from '../entities/category.entity';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import type { CategorySearchQueryDto } from '../dtos/category-search-query.dto';

export type CategoryData = Pick<Category, 'nombre' | 'descripcion' | 'estado'>;

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

  createEntity(data: CategoryData): Category {
    return this.repository.create(data);
  }

  async updateById(
    id: number,
    data: Partial<CategoryData>,
  ): Promise<Category | null> {
    if (Object.keys(data).length > 0) {
      const result = await this.repository.update(this.whereId(id), data);
      if (!result.affected) return null;
    }
    return this.findById(id);
  }

  async search(
    filters: CategorySearchQueryDto,
  ): Promise<PaginationResult<Category>> {
    const query = this.repository.createQueryBuilder('categoria');
    const sortColumns = {
      idCategoria: 'categoria.idCategoria',
      nombre: 'categoria.nombre',
      estado: 'categoria.estado',
    } as const;
    query.orderBy(sortColumns[filters.sortBy], filters.sortDirection);
    if (filters.sortBy !== 'idCategoria') {
      query.addOrderBy('categoria.idCategoria', filters.sortDirection);
    }
    if (filters.nombre !== undefined) {
      // Búsqueda literal: % y _ del cliente no son comodines SQL.
      const nombre = filters.nombre.replace(/[\\%_]/g, '\\$&');
      query.andWhere('categoria.nombre ILIKE :nombre', {
        nombre: `%${nombre}%`,
      });
    }
    if (filters.estado !== undefined) {
      query.andWhere('categoria.estado = :estado', { estado: filters.estado });
    }
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
