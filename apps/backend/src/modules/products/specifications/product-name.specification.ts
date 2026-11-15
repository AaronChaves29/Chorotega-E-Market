import type { SelectQueryBuilder } from 'typeorm';
import type { Product } from '../entities/product.entity';
import type { ProductSpecification } from './product.specification';

export class ProductNameSpecification implements ProductSpecification {
  constructor(private readonly nombre: string) {}

  apply(query: SelectQueryBuilder<Product>): void {
    // % y _ pertenecen al texto del cliente, no son comodines SQL.
    const literal = this.nombre.replace(/[\\%_]/g, '\\$&');
    query.andWhere('producto.nombre ILIKE :nombre', { nombre: `%${literal}%` });
  }
}
