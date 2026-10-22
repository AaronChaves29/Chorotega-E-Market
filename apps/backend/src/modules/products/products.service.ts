import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { assertCatalogWriter } from '../../common/security/catalog-write-access';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import {
  ProductsRepository,
  type NewProductData,
} from './repositories/products.repository';

import { QueryFailedError } from 'typeorm';
import { StoresRepository } from '../stores/repositories/stores.repository';
import { CategoriesRepository } from '../categories/repositories/categories.repository';
import { ProductMapper } from './mappers/product.mapper';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSearchQueryDto } from './dto/product-search-query.dto';
import type { PaginationResult } from '../../common/pagination/pagination-result';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly storesRepository: StoresRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  findAll(): Promise<Product[]> {
    return this.productsRepository.findAll();
  }

  findAvailableByStore(idTienda: Product['idTienda']): Promise<Product[]> {
    return this.productsRepository.findAvailableByStore(idTienda);
  }

  findActiveByCategory(
    idCategoria: Product['idCategoria'],
  ): Promise<Product[]> {
    return this.productsRepository.findActiveByCategory(idCategoria);
  }

  async create(
    createProductDto: CreateProductDto,
    actor: AuthenticatedUser,
  ): Promise<ProductResponseDto> {
    assertCatalogWriter(actor, ['ADMIN', 'EMPRENDEDOR']);
    await this.validateRelations(createProductDto, actor);
    const product = this.productsRepository.createEntity({
      idTienda: createProductDto.idTienda,
      idCategoria: createProductDto.idCategoria,
      nombre: createProductDto.nombre,
      descripcion: createProductDto.descripcion ?? null,
      precio: createProductDto.precio.toString(),
      cantidadDisponible: createProductDto.cantidadDisponible,
      estado: createProductDto.estado ?? 'ACTIVO',
    });

    try {
      const saved = await this.productsRepository.saveInAuthorizedStore(
        product,
        actor,
      );
      if (!saved) throw new NotFoundException('Tienda no encontrada.');
      return ProductMapper.toResponseDto(saved);
    } catch (error) {
      this.rethrowPersistenceError(error, 'save');
    }
  }

  async search(
    query: ProductSearchQueryDto,
  ): Promise<PaginationResult<ProductResponseDto>> {
    const result = await this.productsRepository.search(query);
    return {
      ...result,
      content: result.content.map((product) =>
        ProductMapper.toResponseDto(product),
      ),
    };
  }

  async findById(id: number): Promise<ProductResponseDto> {
    this.validateId(id);
    const product = await this.productsRepository.findById(id);
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return ProductMapper.toResponseDto(product);
  }

  async update(
    id: number,
    dto: UpdateProductDto,
    actor: AuthenticatedUser,
  ): Promise<ProductResponseDto> {
    assertCatalogWriter(actor, ['ADMIN', 'EMPRENDEDOR']);
    this.validateId(id);
    await this.requireOwnedProduct(id, actor);
    await this.validateRelations(dto, actor);
    const data: Partial<NewProductData> = {};
    if (dto.idTienda !== undefined) data.idTienda = dto.idTienda;
    if (dto.idCategoria !== undefined) data.idCategoria = dto.idCategoria;
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.precio !== undefined) data.precio = dto.precio.toString();
    if (dto.cantidadDisponible !== undefined)
      data.cantidadDisponible = dto.cantidadDisponible;
    if (dto.estado !== undefined) data.estado = dto.estado;
    try {
      const product = await this.productsRepository.updateForActor(
        id,
        data,
        actor,
      );
      if (!product) throw new NotFoundException('Producto no encontrado.');
      return ProductMapper.toResponseDto(product);
    } catch (error) {
      this.rethrowPersistenceError(error, 'save');
    }
  }

  async remove(id: number, actor: AuthenticatedUser): Promise<void> {
    assertCatalogWriter(actor, ['ADMIN', 'EMPRENDEDOR']);
    this.validateId(id);
    await this.requireOwnedProduct(id, actor);
    try {
      if (!(await this.productsRepository.deleteForActor(id, actor)))
        throw new NotFoundException('Producto no encontrado.');
    } catch (error) {
      this.rethrowPersistenceError(error, 'delete');
    }
  }

  private async requireOwnedProduct(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<Product> {
    const product = await this.productsRepository.findById(id);
    if (!product) throw new NotFoundException('Producto no encontrado.');
    if (actor.rol === 'EMPRENDEDOR')
      await this.requireOwnedStore(product.idTienda, actor);
    return product;
  }

  private async requireOwnedStore(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const store = await this.storesRepository.findById(id);
    if (
      !store ||
      (actor.rol === 'EMPRENDEDOR' && store.idEmprendedor !== actor.idUsuario)
    )
      throw new NotFoundException('Tienda no encontrada.');
  }

  private validateId(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647)
      throw new BadRequestException(
        'El identificador debe ser un entero positivo de 32 bits.',
      );
  }

  private async validateRelations(
    dto: { idTienda?: number; idCategoria?: number },
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (dto.idTienda !== undefined)
      await this.requireOwnedStore(dto.idTienda, actor);
    if (
      dto.idCategoria !== undefined &&
      !(await this.categoriesRepository.findById(dto.idCategoria))
    )
      throw new NotFoundException('Categoría no encontrada.');
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
        driver.code === '23503' &&
        'constraint' in driver
      ) {
        if (
          operation === 'delete' &&
          driver.constraint === 'fk_detalle_producto'
        )
          throw new ConflictException(
            'El producto tiene detalles de pedido asociados.',
          );
        // Cubre la eliminación concurrente de la relación después de validarla.
        if (operation === 'save' && driver.constraint === 'fk_producto_tienda')
          throw new NotFoundException('Tienda no encontrada.');
        if (
          operation === 'save' &&
          driver.constraint === 'fk_producto_categoria'
        )
          throw new NotFoundException('Categoría no encontrada.');
      }
    }
    throw error;
  }
}
