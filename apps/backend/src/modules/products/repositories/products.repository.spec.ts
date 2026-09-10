import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Courier } from '../../couriers/entities/courier.entity';
import { Delivery } from '../../deliveries/entities/delivery.entity';
import { Neighborhood } from '../../neighborhoods/entities/neighborhood.entity';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { Order } from '../../orders/entities/order.entity';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { Product } from '../entities/product.entity';
import { ProductsRepository } from './products.repository';

// Genera SQL con los metadatos reales sin abrir una conexión a PostgreSQL.
class MetadataDataSource extends DataSource {
  prepareMetadata(): Promise<void> {
    return this.buildMetadatas();
  }
}

describe('ProductsRepository: consultas fijas', () => {
  let repository: ProductsRepository;
  let sql: string;
  let parameters: unknown[];

  beforeAll(async () => {
    const source = new MetadataDataSource({
      type: 'postgres',
      entities: [
        Product,
        Store,
        Category,
        User,
        Order,
        OrderDetail,
        Neighborhood,
        Courier,
        Delivery,
      ],
      synchronize: false,
      migrationsRun: false,
    });
    await source.prepareMetadata();
    repository = new ProductsRepository(source.getRepository(Product));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function captureQuery(result: Product[]) {
    return jest
      .spyOn(SelectQueryBuilder.prototype, 'getMany')
      .mockImplementation(function (this: SelectQueryBuilder<Product>) {
        [sql, parameters] = this.getQueryAndParameters();
        return Promise.resolve(result);
      });
  }

  it.each([7, 42])(
    'filtra la tienda %i, estado y existencias con parámetros y orden estable',
    async (idTienda) => {
      const result = [Object.assign(new Product(), { idProducto: 2 })];
      const execute = captureQuery(result);

      expect(await repository.findAvailableByStore(idTienda)).toBe(result);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(sql.slice(sql.indexOf(' WHERE '))).toBe(
        ' WHERE "producto"."id_tienda" = $1 AND "producto"."estado" = $2 AND "producto"."cantidad_disponible" > $3 ORDER BY "producto"."id_producto" ASC',
      );
      expect(parameters).toEqual([idTienda, 'ACTIVO', 0]);
    },
  );

  it.each([9, 43])(
    'filtra la categoría %i y estado sin exigir existencias',
    async (idCategoria) => {
      const result = [Object.assign(new Product(), { idProducto: 3 })];
      const execute = captureQuery(result);

      expect(await repository.findActiveByCategory(idCategoria)).toBe(result);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(sql.slice(sql.indexOf(' WHERE '))).toBe(
        ' WHERE "producto"."id_categoria" = $1 AND "producto"."estado" = $2 ORDER BY "producto"."id_producto" ASC',
      );
      expect(parameters).toEqual([idCategoria, 'ACTIVO']);
    },
  );
});
