import type { SelectQueryBuilder } from 'typeorm';
import { Product } from '../entities/product.entity';
import type { ProductSpecification } from './product.specification';

export class ProductCategorySpecification implements ProductSpecification {
  constructor(private readonly idCategoria: Product['idCategoria']) {}

  apply(queryBuilder: SelectQueryBuilder<Product>): void {
    queryBuilder.andWhere('producto.idCategoria = :idCategoria', {
      idCategoria: this.idCategoria,
    });
  }
}
