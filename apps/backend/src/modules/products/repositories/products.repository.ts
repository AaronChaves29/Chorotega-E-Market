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
