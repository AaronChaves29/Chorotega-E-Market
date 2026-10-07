import type { SelectQueryBuilder } from 'typeorm';
import { Product } from '../entities/product.entity';
import type { ProductSpecification } from './product.specification';

export class ProductStateSpecification implements ProductSpecification {
  constructor(private readonly estado: Product['estado']) {}
  apply(queryBuilder: SelectQueryBuilder<Product>): void {
    queryBuilder.andWhere('producto.estado = :estado', { estado: this.estado });
  }
}
