import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureHttp } from '../common/http/configure-http';
import { CurrentIdentityService } from './current-identity.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { StoresController } from '../modules/stores/controllers/stores.controller';
import { StoresService } from '../modules/stores/services/stores.service';
import { ProductsController } from '../modules/products/products.controller';
import { ProductsService } from '../modules/products/products.service';
import { CategoriesController } from '../modules/categories/controllers/categories.controller';
import { CategoriesService } from '../modules/categories/services/categories.service';
import { NeighborhoodsController } from '../modules/neighborhoods/controllers/neighborhoods.controller';
import { NeighborhoodsService } from '../modules/neighborhoods/services/neighborhoods.service';
import { CouriersController } from '../modules/couriers/controllers/couriers.controller';
import { CouriersService } from '../modules/couriers/services/couriers.service';

// HTTP, guards and JWT are real. Only persistence/services are replaced;
// no AppModule, environment files, database connections or migrations.
describe('Private catalog HTTP without external databases', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const roles = ['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'];
  const users = { findAuthenticationById: jest.fn() };
  const service = {
    search: jest.fn().mockResolvedValue({ content: [] }),
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({ id: 1 }),
    create: jest.fn(),
  };
  const paths = [
    'stores',
    'products',
    'categories',
    'neighborhoods',
    'couriers',
  ].flatMap((resource) => [`/api/v1/${resource}`, `/api/v1/${resource}/1`]);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: randomUUID() })],
      controllers: [
        StoresController,
        ProductsController,
        CategoriesController,
        NeighborhoodsController,
        CouriersController,
      ],
      providers: [
        CurrentIdentityService,
        JwtAuthGuard,
        RolesGuard,
        { provide: UsersRepository, useValue: users },
        ...[
          StoresService,
          ProductsService,
          CategoriesService,
          NeighborhoodsService,
          CouriersService,
        ].map((provide) => ({ provide, useValue: service })),
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>({
      logger: false,
    });
    configureHttp(app);
    await app.init();
    jwt = module.get(JwtService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    users.findAuthenticationById.mockImplementation((id: number) =>
      Promise.resolve({
        idUsuario: id,
        correo: 'actor@example.test',
        rol: roles[id - 1],
        estado: 'ACTIVO',
      }),
    );
  });
  const token = (id: number) =>
    jwt.sign({ idUsuario: id, sub: 'actor@example.test' });

  it.each(paths)(
    'rejects anonymous GET %s before reading data',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
      expect(service.search).not.toHaveBeenCalled();
      expect(service.findAll).not.toHaveBeenCalled();
      expect(service.findById).not.toHaveBeenCalled();
    },
  );
  it.each(paths)(
    'rejects invalid JWT at %s without echoing it',
    async (path) => {
      const response = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer invalid-private-marker')
        .expect(401);
      expect(response.text).not.toContain('invalid-private-marker');
    },
  );
  describe.each(roles)('%s current role', (role) => {
    it.each(paths)('applies read permissions at %s', async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token(roles.indexOf(role) + 1)}`)
        .expect(path.includes('/couriers') && role !== 'ADMIN' ? 403 : 200);
    });
  });
  it('rejects expired JWT and inactive accounts', async () => {
    const expired = jwt.sign(
      { idUsuario: 2, sub: 'actor@example.test' },
      { expiresIn: -1 },
    );
    await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    users.findAuthenticationById.mockResolvedValue({
      idUsuario: 2,
      rol: 'CLIENTE',
      estado: 'INACTIVO',
    });
    await request(app.getHttpServer())
      .get('/api/v1/stores')
      .set('Authorization', `Bearer ${token(2)}`)
      .expect(401);
  });
  it('ignores the claimed ADMIN role when the current account is CLIENTE', async () => {
    const claimed = jwt.sign({
      idUsuario: 2,
      sub: 'actor@example.test',
      rol: 'ADMIN',
    });
    await request(app.getHttpServer())
      .get('/api/v1/couriers')
      .set('Authorization', `Bearer ${claimed}`)
      .expect(403);
  });
  it.each(['stores', 'products', 'categories'])(
    'preserves CLIENTE write denial for %s',
    async (resource) => {
      await request(app.getHttpServer())
        .post(`/api/v1/${resource}`)
        .set('Authorization', `Bearer ${token(2)}`)
        .send({})
        .expect(403);
      expect(service.create).not.toHaveBeenCalled();
    },
  );
});
