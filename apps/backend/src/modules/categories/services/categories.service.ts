import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { assertCatalogWriter } from '../../../common/security/catalog-write-access';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { UpdateCategoryDto } from '../dtos/update-category.dto';
import { CategoryResponseDto } from '../dtos/category-response.dto';
import { CategorySearchQueryDto } from '../dtos/category-search-query.dto';
import { CategoryMapper } from '../mappers/category.mapper';
import {
  CategoriesRepository,
  type CategoryData,
} from '../repositories/categories.repository';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async search(
    query: CategorySearchQueryDto,
  ): Promise<PaginationResult<CategoryResponseDto>> {
    const result = await this.categoriesRepository.search(query);
    return {
      ...result,
      content: result.content.map((category) =>
        CategoryMapper.toResponseDto(category),
      ),
    };
  }

  async findById(id: number): Promise<CategoryResponseDto> {
    this.validateId(id);
    const category = await this.categoriesRepository.findById(id);
    if (!category) throw new NotFoundException('Categoría no encontrada.');
    return CategoryMapper.toResponseDto(category);
  }

  async create(
    dto: CreateCategoryDto,
    actor: AuthenticatedUser,
  ): Promise<CategoryResponseDto> {
    assertCatalogWriter(actor, ['ADMIN']);
    const category = this.categoriesRepository.createEntity({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      estado: dto.estado ?? 'ACTIVA',
    });
    try {
      return CategoryMapper.toResponseDto(
        await this.categoriesRepository.save(category),
      );
    } catch (error) {
      this.rethrowPersistenceError(error, 'save');
    }
  }

  async update(
    id: number,
    dto: UpdateCategoryDto,
    actor: AuthenticatedUser,
  ): Promise<CategoryResponseDto> {
    assertCatalogWriter(actor, ['ADMIN']);
    this.validateId(id);
    const data: Partial<CategoryData> = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.estado !== undefined) data.estado = dto.estado;
    try {
      const category = await this.categoriesRepository.updateById(id, data);
      if (!category) throw new NotFoundException('Categoría no encontrada.');
      return CategoryMapper.toResponseDto(category);
    } catch (error) {
      this.rethrowPersistenceError(error, 'save');
    }
  }

  async remove(id: number, actor: AuthenticatedUser): Promise<void> {
    assertCatalogWriter(actor, ['ADMIN']);
    this.validateId(id);
    try {
      if (!(await this.categoriesRepository.deleteById(id))) {
        throw new NotFoundException('Categoría no encontrada.');
      }
    } catch (error) {
      this.rethrowPersistenceError(error, 'delete');
    }
  }

  private validateId(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
      throw new BadRequestException(
        'El identificador debe ser un entero positivo de 32 bits.',
      );
    }
  }

  private rethrowPersistenceError(
    error: unknown,
    operation: 'save' | 'delete',
  ): never {
    if (error instanceof QueryFailedError) {
      const driver: unknown = error.driverError;
      if (
        typeof driver === 'object' &&
        driver !== null &&
        'code' in driver &&
        'constraint' in driver
      ) {
        if (
          operation === 'save' &&
          driver.code === '23505' &&
          driver.constraint === 'categoria_nombre_key'
        ) {
          throw new ConflictException(
            'Ya existe una categoría con ese nombre.',
          );
        }
        if (
          operation === 'delete' &&
          driver.code === '23503' &&
          driver.constraint === 'fk_producto_categoria'
        ) {
          throw new ConflictException(
            'La categoría tiene productos asociados.',
          );
        }
      }
    }
    throw error;
  }
}
