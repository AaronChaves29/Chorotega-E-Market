import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  DataSource,
  SelectQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder,
} from 'typeorm';
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

  it('bloquea los productos solicitados con parámetros y orden por ID', async () => {
    const execute = captureQuery([]);
    expect(await repository.findByIdsForUpdate([5, 2])).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sql.slice(sql.indexOf(' WHERE '))).toBe(
      ' WHERE "producto"."id_producto" IN ($1, $2) ORDER BY "producto"."id_producto" ASC FOR UPDATE',
    );
    expect(parameters).toEqual([5, 2]);
  });

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
  it('genera UPDATE condicionado por origen y destino sin sustituir el nombre de la tabla de relación', async () => {
    jest
      .spyOn(UpdateQueryBuilder.prototype, 'execute')
      .mockImplementation(function (this: UpdateQueryBuilder<Product>) {
        [sql, parameters] = this.getQueryAndParameters();
        return Promise.resolve({ affected: 0, generatedMaps: [], raw: [] });
      });
    expect(
      await repository.updateForActor(
        9,
        { idTienda: 4, nombre: 'Nuevo' },
        { sub: 'owner@example.test', idUsuario: 7, rol: 'EMPRENDEDOR' },
      ),
    ).toBeNull();
    expect(sql).toContain('UPDATE "producto"');
    expect(sql).toContain('FROM "tienda" "origen"');
    expect(sql).toContain('"origen"."id_tienda" = "producto"."id_tienda"');
    expect(sql).toContain('FROM "tienda" "destino"');
    expect(sql).not.toContain('FROM "id_tienda"');
    expect(parameters).toEqual([4, 'Nuevo', 9, 7, 4]);
  });
  it('genera DELETE condicionado por propietario con parámetros', async () => {
    jest
      .spyOn(DeleteQueryBuilder.prototype, 'execute')
      .mockImplementation(function (this: DeleteQueryBuilder<Product>) {
        [sql, parameters] = this.getQueryAndParameters();
        return Promise.resolve({ affected: 0, raw: [] });
      });
    expect(
      await repository.deleteForActor(9, {
        sub: 'owner@example.test',
        idUsuario: 7,
        rol: 'EMPRENDEDOR',
      }),
    ).toBe(false);
    expect(sql).toContain('DELETE FROM "producto"');
    expect(sql).toContain('FROM "tienda" "origen"');
    expect(sql).toContain('"origen"."id_emprendedor" = $2');
    expect(parameters).toEqual([9, 7]);
  });
});
