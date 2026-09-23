import type { SelectQueryBuilder } from 'typeorm';
import { Product } from '../entities/product.entity';
import type { ProductSpecification } from './product.specification';

export class ProductStoreSpecification implements ProductSpecification {
  constructor(private readonly idTienda: Product['idTienda']) {}

  apply(queryBuilder: SelectQueryBuilder<Product>): void {
    queryBuilder.andWhere('producto.idTienda = :idTienda', {
      idTienda: this.idTienda,
    });
  }
}
