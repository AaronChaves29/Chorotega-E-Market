import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from '../../src/database/database.options';
import { CreateInitialSchema1788732000000 } from '../../src/database/migrations/1788732000000-CreateInitialSchema';
import { AlignTimestampDefaults1788998400000 } from '../../src/database/migrations/1788998400000-AlignTimestampDefaults';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { Courier } from '../../src/modules/couriers/entities/courier.entity';
import { Delivery } from '../../src/modules/deliveries/entities/delivery.entity';
import { Neighborhood } from '../../src/modules/neighborhoods/entities/neighborhood.entity';
import { OrderDetail } from '../../src/modules/order-details/entities/order-detail.entity';
import { Order } from '../../src/modules/orders/entities/order.entity';
import { Product } from '../../src/modules/products/entities/product.entity';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { User } from '../../src/modules/users/entities/user.entity';

export interface PostgresTestDatabase {
  readonly dataSource: DataSource;
  readonly container: StartedPostgreSqlContainer;
  stop(): Promise<void>;
}

export async function startPostgresTestDatabase(): Promise<PostgresTestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('chorotega_test')
    .withUsername('test')
    .withPassword(randomUUID())
    .withLabels({ 'chorotega.test-suite': 'integration' })
    .withStartupTimeout(120_000)
    .start();

  let dataSource: DataSource | undefined;
  let stopPromise: Promise<void> | undefined;

  async function cleanup(): Promise<void> {
    const errors: unknown[] = [];
    try {
      if (dataSource?.isInitialized) await dataSource.destroy();
    } catch (error) {
      errors.push(error);
    }
    // Se intenta detener el contenedor incluso si destroy falla.
    try {
      await container.stop({
        timeout: 10_000,
        remove: true,
        removeVolumes: true,
      });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        'No se pudo limpiar la base de pruebas.',
      );
    }
  }

  function stop(): Promise<void> {
    stopPromise ??= cleanup().catch((error: unknown) => {
      stopPromise = undefined;
      throw error;
    });
    return stopPromise;
  }

  try {
    // La URL procede exclusivamente del contenedor; no se carga .env ni el CLI DataSource.
    dataSource = new DataSource({
      ...createDatabaseOptions(container.getConnectionUri(), 'false'),
      entities: [
        User,
        Store,
        Category,
        Product,
        Neighborhood,
        Order,
        OrderDetail,
        Courier,
        Delivery,
      ],
      migrations: [
        CreateInitialSchema1788732000000,
        AlignTimestampDefaults1788998400000,
      ],
      extra: { connectionTimeoutMillis: 10_000 },
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    return { dataSource, container, stop };
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Fallaron la preparación y la limpieza de la base de pruebas.',
      );
    }
    throw error;
  }
}

export async function withPostgresTestDatabase<T>(
  run: (database: PostgresTestDatabase) => Promise<T> | T,
): Promise<T> {
  const database = await startPostgresTestDatabase();
  try {
    return await run(database);
  } finally {
    await database.stop();
  }
}
