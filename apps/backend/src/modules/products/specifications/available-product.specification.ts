import type { SelectQueryBuilder } from 'typeorm';
import { Product } from '../entities/product.entity';
import type { ProductSpecification } from './product.specification';

export class AvailableProductSpecification implements ProductSpecification {
  constructor(private readonly disponible = true) {}

  apply(queryBuilder: SelectQueryBuilder<Product>): void {
    queryBuilder.andWhere(
      this.disponible
        ? 'producto.cantidadDisponible > :cantidadMinima'
        : 'producto.cantidadDisponible = :cantidadMinima',
      {
        cantidadMinima: 0,
      },
    );
  }
}
