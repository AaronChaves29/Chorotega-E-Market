import type { SelectQueryBuilder } from 'typeorm';
import { Product } from '../entities/product.entity';

export interface ProductSpecification {
  apply(queryBuilder: SelectQueryBuilder<Product>): void;
}
