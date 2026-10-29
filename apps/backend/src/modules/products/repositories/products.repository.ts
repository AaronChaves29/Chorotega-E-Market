import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { Store } from '../../stores/entities/store.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder,
} from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Product } from '../entities/product.entity';
import { ProductVersionConflictError } from '../exceptions/product-version-conflict.error';
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

  // La tienda se vuelve a autorizar bajo bloqueo dentro de la transacción.
  async saveInAuthorizedStore(
    product: Product,
    actor: AuthenticatedUser,
  ): Promise<Product | null> {
    return this.repository.manager.transaction(async (manager) => {
      const where: FindOptionsWhere<Store> = { idTienda: product.idTienda };
      if (actor.rol === 'EMPRENDEDOR') where.idEmprendedor = actor.idUsuario;
      const store = await manager
        .getRepository(Store)
        .findOne({ where, lock: { mode: 'pessimistic_write' } });
      if (!store) return null;
      return manager.getRepository(Product).save(product);
    });
  }

  async updateForActor(
    id: number,
    data: Partial<NewProductData>,
    actor: AuthenticatedUser,
    expectedVersion: number,
  ): Promise<Product | null> {
    const query = this.repository
      .createQueryBuilder()
      .update(Product)
      // Se incrementa incluso cuando el PATCH solo contiene la precondición.
      .set({ ...data, version: () => '"version" + 1' })
      .where('"id_producto" = :productId', { productId: id })
      .andWhere('"version" = :expectedVersion', { expectedVersion });
    this.applyWriteOwnership(query, actor);
    this.applyDestinationOwnership(query, data, actor);
    const result = await query.returning('*').execute();
    if (!result.affected) {
      // No se revela un conflicto para un producto o destino no autorizado.
      const visible = this.repository
        .createQueryBuilder('producto')
        .where('producto.idProducto = :productId', { productId: id });
      this.applyWriteOwnership(visible, actor);
      this.applyDestinationOwnership(visible, data, actor);
      if (!(await visible.getOne())) return null;
      throw new ProductVersionConflictError();
    }
    // RETURNING pertenece al mismo UPDATE: no hay otra lectura que pueda devolver
    // datos de una escritura posterior o de un traslado a una tienda ajena.
    const [row] = result.raw as {
      id_producto: number;
      version: number;
      id_tienda: number;
      id_categoria: number;
      nombre: string;
      descripcion: string | null;
      precio: string;
      cantidad_disponible: number;
      estado: string;
      fecha_publicacion: Date;
    }[];
    return this.repository.create({
      idProducto: row.id_producto,
      version: row.version,
      idTienda: row.id_tienda,
      idCategoria: row.id_categoria,
      nombre: row.nombre,
      descripcion: row.descripcion,
      precio: row.precio,
      cantidadDisponible: row.cantidad_disponible,
      estado: row.estado,
      fechaPublicacion: row.fecha_publicacion,
    });
  }

  private applyDestinationOwnership(
    query: SelectQueryBuilder<Product> | UpdateQueryBuilder<Product>,
    data: Partial<NewProductData>,
    actor: AuthenticatedUser,
  ): void {
    if (actor.rol === 'EMPRENDEDOR' && data.idTienda !== undefined)
      query.andWhere(
        'EXISTS (SELECT 1 FROM "tienda" "destino" WHERE "destino"."id_tienda" = :destinationStoreId AND "destino"."id_emprendedor" = :scopeUserId)',
        { destinationStoreId: data.idTienda },
      );
  }

  async deleteForActor(id: number, actor: AuthenticatedUser): Promise<boolean> {
    const query = this.repository
      .createQueryBuilder()
      .delete()
      .from(Product)
      .where('"id_producto" = :productId', { productId: id });
    this.applyWriteOwnership(query, actor);
    const result = await query.execute();
    return (result.affected ?? 0) > 0;
  }

  private applyWriteOwnership(
    query:
      | SelectQueryBuilder<Product>
      | UpdateQueryBuilder<Product>
      | DeleteQueryBuilder<Product>,
    actor: AuthenticatedUser,
  ): void {
    if (actor.rol === 'EMPRENDEDOR') {
      // Predicado correlacionado con la tienda actual, evaluado en la escritura SQL.
      query.andWhere(
        'EXISTS (SELECT 1 FROM "tienda" "origen" WHERE "origen"."id_tienda" = "producto"."id_tienda" AND "origen"."id_emprendedor" = :scopeUserId)',
        { scopeUserId: actor.idUsuario },
      );
    }
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
