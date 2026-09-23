import type { SelectQueryBuilder } from 'typeorm';
import { Product } from '../entities/product.entity';
import type { ProductSpecification } from './product.specification';

export class ActiveProductSpecification implements ProductSpecification {
  apply(queryBuilder: SelectQueryBuilder<Product>): void {
    queryBuilder.andWhere('producto.estado = :estado', {
      estado: 'ACTIVO',
    });
  }
}
