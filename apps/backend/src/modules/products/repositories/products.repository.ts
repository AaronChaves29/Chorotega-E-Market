import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Product } from '../entities/product.entity';
import type { ProductSpecification } from '../specifications/product.specification';
import { ProductStoreSpecification } from '../specifications/product-store.specification';
import { ActiveProductSpecification } from '../specifications/active-product.specification';
import { AvailableProductSpecification } from '../specifications/available-product.specification';
import { ProductCategorySpecification } from '../specifications/product-category.specification';

import type { PaginationResult } from '../../../common/pagination/pagination-result';
import type { ProductSearchQueryDto } from '../dto/product-search-query.dto';
import { ProductStateSpecification } from '../specifications/product-state.specification';

export type NewProductData = Pick<
  Product,
  | 'idTienda'
  | 'idCategoria'
  | 'nombre'
  | 'descripcion'
  | 'precio'
  | 'cantidadDisponible'
  | 'estado'
>;

@Injectable()
export class ProductsRepository extends TypeOrmBaseRepository<
  Product,
  Product['idProducto']
> {
  constructor(@InjectRepository(Product) repository: Repository<Product>) {
    super(repository);
  }

  protected whereId(id: Product['idProducto']): FindOptionsWhere<Product> {
    return { idProducto: id };
  }

  // Construye la entidad en memoria; save es la operación que la persiste.
  createEntity(data: NewProductData): Product {
    return this.repository.create(data);
  }

  async updateById(
    id: number,
    data: Partial<NewProductData>,
  ): Promise<Product | null> {
    if (Object.keys(data).length > 0) {
      const result = await this.repository.update(this.whereId(id), data);
      if (!result.affected) return null;
    }
    return this.findById(id);
  }

  async search(
    filters: ProductSearchQueryDto,
  ): Promise<PaginationResult<Product>> {
    const specifications: ProductSpecification[] = [];
    if (filters.idTienda !== undefined)
      specifications.push(new ProductStoreSpecification(filters.idTienda));
    if (filters.idCategoria !== undefined)
      specifications.push(
        new ProductCategorySpecification(filters.idCategoria),
      );
    if (filters.estado !== undefined)
      specifications.push(new ProductStateSpecification(filters.estado));
    if (filters.disponible !== undefined)
      specifications.push(
        new AvailableProductSpecification(filters.disponible),
      );
    const query = this.repository.createQueryBuilder('producto');
    for (const specification of specifications) specification.apply(query);
    const columns = {
      idProducto: 'producto.idProducto',
      nombre: 'producto.nombre',
      precio: 'producto.precio',
      cantidadDisponible: 'producto.cantidadDisponible',
      estado: 'producto.estado',
    } as const;
    query.orderBy(columns[filters.sortBy], filters.sortDirection);
    if (filters.sortBy !== 'idProducto')
      query.addOrderBy('producto.idProducto', filters.sortDirection);
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

  private applySpecifications(
    specifications: ProductSpecification[],
  ): Promise<Product[]> {
    const queryBuilder = this.repository.createQueryBuilder('producto');

    for (const specification of specifications) {
      specification.apply(queryBuilder);
    }

    return queryBuilder.orderBy('producto.idProducto', 'ASC').getMany();
  }

  // Requiere una transacción activa. El orden reduce bloqueos cruzados entre pedidos.
  findByIdsForUpdate(ids: Product['idProducto'][]): Promise<Product[]> {
    return this.repository
      .createQueryBuilder('producto')
      .where('producto.idProducto IN (:...ids)', { ids })
      .orderBy('producto.idProducto', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
  }

  findAvailableByStore(idTienda: Product['idTienda']): Promise<Product[]> {
    return this.applySpecifications([
      new ProductStoreSpecification(idTienda),
      new ActiveProductSpecification(),
      new AvailableProductSpecification(),
    ]);
  }

  findActiveByCategory(
    idCategoria: Product['idCategoria'],
  ): Promise<Product[]> {
    return this.applySpecifications([
      new ProductCategorySpecification(idCategoria),
      new ActiveProductSpecification(),
    ]);
  }
}
