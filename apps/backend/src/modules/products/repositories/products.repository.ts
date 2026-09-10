import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Product } from '../entities/product.entity';

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

  findAvailableByStore(idTienda: Product['idTienda']): Promise<Product[]> {
    return this.repository
      .createQueryBuilder('producto')
      .where('producto.idTienda = :idTienda', { idTienda })
      .andWhere('producto.estado = :estado', { estado: 'ACTIVO' })
      .andWhere('producto.cantidadDisponible > :cantidadMinima', {
        cantidadMinima: 0,
      })
      .orderBy('producto.idProducto', 'ASC')
      .getMany();
  }

  findActiveByCategory(
    idCategoria: Product['idCategoria'],
  ): Promise<Product[]> {
    return this.repository
      .createQueryBuilder('producto')
      .where('producto.idCategoria = :idCategoria', { idCategoria })
      .andWhere('producto.estado = :estado', { estado: 'ACTIVO' })
      .orderBy('producto.idProducto', 'ASC')
      .getMany();
  }
}
