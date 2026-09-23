import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Neighborhood } from '../../neighborhoods/entities/neighborhood.entity';
import { NeighborhoodsRepository } from '../../neighborhoods/repositories/neighborhoods.repository';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { OrderDetailsRepository } from '../../order-details/repositories/order-details.repository';
import { Product } from '../../products/entities/product.entity';
import { ProductsRepository } from '../../products/repositories/products.repository';
import { Store } from '../../stores/entities/store.entity';
import { StoresRepository } from '../../stores/repositories/stores.repository';
import { User } from '../../users/entities/user.entity';
import { UsersRepository } from '../../users/repositories/users.repository';
import { Order } from '../entities/order.entity';
import { OrdersRepository } from '../repositories/orders.repository';

export interface OrderTransactionRepositories {
  users: Pick<UsersRepository, 'findById'>;
  neighborhoods: Pick<NeighborhoodsRepository, 'findById'>;
  stores: Pick<StoresRepository, 'findById'>;
  products: Pick<ProductsRepository, 'findByIdsForUpdate' | 'save'>;
  orders: Pick<OrdersRepository, 'save'>;
  details: Pick<OrderDetailsRepository, 'save'>;
}

export interface OrderTransactionRunner {
  run<T>(
    work: (repositories: OrderTransactionRepositories) => Promise<T>,
  ): Promise<T>;
}

@Injectable()
export class OrderTransaction implements OrderTransactionRunner {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(
    work: (repositories: OrderTransactionRepositories) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) =>
      work({
        users: new UsersRepository(manager.getRepository(User)),
        neighborhoods: new NeighborhoodsRepository(
          manager.getRepository(Neighborhood),
        ),
        stores: new StoresRepository(manager.getRepository(Store)),
        products: new ProductsRepository(manager.getRepository(Product)),
        orders: new OrdersRepository(manager.getRepository(Order)),
        details: new OrderDetailsRepository(manager.getRepository(OrderDetail)),
      }),
    );
  }
}
