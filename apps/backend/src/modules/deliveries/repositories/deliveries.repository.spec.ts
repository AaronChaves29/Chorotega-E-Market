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
import { Neighborhood } from '../../neighborhoods/entities/neighborhood.entity';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { Order } from '../../orders/entities/order.entity';
import { Product } from '../../products/entities/product.entity';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { Delivery } from '../entities/delivery.entity';
import { DeliveriesRepository } from './deliveries.repository';

class MetadataDataSource extends DataSource {
  prepareMetadata(): Promise<void> {
    return this.buildMetadatas();
  }
}

describe('DeliveriesRepository: búsqueda paginada', () => {
  let repository: DeliveriesRepository;

  beforeAll(async () => {
    const source = new MetadataDataSource({
      type: 'postgres',
      entities: [
        Delivery,
        Order,
        Courier,
        User,
        Store,
        Category,
        Product,
        Neighborhood,
        OrderDetail,
      ],
      synchronize: false,
      migrationsRun: false,
    });

    await source.prepareMetadata();

    repository = new DeliveriesRepository(source.getRepository(Delivery));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devuelve la primera página con sus metadatos', async () => {
    const deliveries = [
      Object.assign(new Delivery(), {
        idEntrega: 3,
      }),
      Object.assign(new Delivery(), {
        idEntrega: 2,
      }),
    ];

    const execute = jest
      .spyOn(SelectQueryBuilder.prototype, 'getManyAndCount')
      .mockResolvedValue([deliveries, 12]);

    const result = await repository.search({
      page: 0,
      size: 5,
      sortBy: 'fechaAsignacion',
      sortDirection: 'DESC',
    });

    expect(execute).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      content: deliveries,
      page: 0,
      size: 5,
      totalElements: 12,
      totalPages: 3,
    });
  });

  it('calcula correctamente una página posterior', async () => {
    const deliveries = [
      Object.assign(new Delivery(), {
        idEntrega: 6,
      }),
    ];

    const execute = jest
      .spyOn(SelectQueryBuilder.prototype, 'getManyAndCount')
      .mockResolvedValue([deliveries, 11]);

    const result = await repository.search({
      page: 1,
      size: 5,
      sortBy: 'fechaAsignacion',
      sortDirection: 'DESC',
    });

    expect(execute).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      content: deliveries,
      page: 1,
      size: 5,
      totalElements: 11,
      totalPages: 3,
    });
  });

  it('aplica filtros y ordenamiento a la búsqueda de entregas', async () => {
    let sql = '';
    let parameters: unknown[] = [];

    const execute = jest
      .spyOn(SelectQueryBuilder.prototype, 'getManyAndCount')
      .mockImplementation(function (this: SelectQueryBuilder<Delivery>) {
        [sql, parameters] = this.getQueryAndParameters();
        return Promise.resolve([[], 0]);
      });

    const fechaDesde = new Date('2026-09-01T00:00:00');
    const fechaHasta = new Date('2026-09-30T23:59:59');

    await repository.search({
      estado: 'ASIGNADA',
      idPedido: 10,
      idRepartidor: 5,
      fechaDesde,
      fechaHasta,
      page: 0,
      size: 10,
      sortBy: 'fechaAsignacion',
      sortDirection: 'DESC',
    });

    expect(execute).toHaveBeenCalledTimes(1);

    expect(sql).toContain('"entrega"."estado" = $1');
    expect(sql).toContain('"entrega"."id_pedido" = $2');
    expect(sql).toContain('"entrega"."id_repartidor" = $3');
    expect(sql).toContain('"entrega"."fecha_asignacion" >= $4');
    expect(sql).toContain('"entrega"."fecha_asignacion" <= $5');

    expect(sql).toContain(
      'ORDER BY "entrega"."fecha_asignacion" DESC, "entrega"."id_entrega" DESC',
    );

    expect(parameters).toEqual(['ASIGNADA', 10, 5, fechaDesde, fechaHasta]);
  });
});
