import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MongoDatabaseService } from '../database/mongodb/mongodb-database.service';
import { User } from '../modules/users/entities/user.entity';
import { Store } from '../modules/stores/entities/store.entity';
import { Category } from '../modules/categories/entities/category.entity';
import { Product } from '../modules/products/entities/product.entity';
import { Neighborhood } from '../modules/neighborhoods/entities/neighborhood.entity';
import { Order } from '../modules/orders/entities/order.entity';
import { OrderDetail } from '../modules/order-details/entities/order-detail.entity';
import { Courier } from '../modules/couriers/entities/courier.entity';
import { Delivery } from '../modules/deliveries/entities/delivery.entity';
import { configureHttp } from '../common/http/configure-http';
import { configureOpenApi } from '../common/http/configure-openapi';
import { configureAdminViews } from './admin-views';

class OfflineDataSource extends DataSource {
  prepare() {
    return this.buildMetadatas();
  }
}

describe('AppModule completo: resolución y contratos sin conexiones externas', () => {
  let app: INestApplication<App> | undefined;
  const saved = new Map<string, string | undefined>();
  const source = new OfflineDataSource({
    type: 'postgres',
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
    synchronize: false,
  });
  const query = jest
    .spyOn(source, 'query')
    .mockRejectedValue(new Error('No se permiten consultas en esta prueba'));
  const mongo = {
    getDatabase: jest.fn(() => {
      throw new Error('No se permite conectar MongoDB en esta prueba');
    }),
  };
  beforeAll(async () => {
    const config = {
      NODE_ENV: 'test',
      PORT: '0',
      DATABASE_CA_CERT: '',
      DATABASE_URL: 'postgresql://localhost/offline_test',
      DATABASE_SSL: 'false',
      MONGODB_URI: 'mongodb://localhost:27017',
      MONGODB_DATABASE: 'offline_test',
      JWT_SECRET: randomBytes(32).toString('hex'),
      CORS_ORIGIN: '',
    };
    for (const [key, value] of Object.entries(config)) {
      saved.set(key, process.env[key]);
      process.env[key] = value;
    }
    await source.prepare();
    const { AppModule } =
      jest.requireActual<typeof import('../app.module')>('../app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken())
      .useValue(source)
      .overrideProvider(MongoDatabaseService)
      .useValue(mongo)
      .compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureAdminViews(app);
    configureHttp(app);
    configureOpenApi(app);
    await app.init();
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  it('resuelve todos los módulos y sirve el acceso MVC y Swagger con las 35 operaciones REST', async () => {
    if (!app) throw new Error('Aplicación no inicializada');
    await request(app.getHttpServer())
      .get('/admin/login')
      .expect(200)
      .expect('Content-Type', /text\/html/);
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const document = response.body as {
      paths: Record<string, Record<string, unknown>>;
    };
    const methods = [
      'get',
      'post',
      'patch',
      'delete',
      'put',
      'head',
      'options',
    ];
    expect(
      Object.values(document.paths).reduce(
        (total, path) =>
          total +
          Object.keys(path).filter((key) => methods.includes(key)).length,
        0,
      ),
    ).toBe(35);
    expect(
      Object.keys(document.paths).some((path) => path.includes('/admin')),
    ).toBe(false);
    expect(source.isInitialized).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(mongo.getDatabase).not.toHaveBeenCalled();
  });
});
