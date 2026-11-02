import {
  Body,
  ConflictException,
  Controller,
  Post,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../auth/auth.service';
import { UsersRepository } from '../../modules/users/repositories/users.repository';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ProductsRepository } from '../../modules/products/repositories/products.repository';
import { ProductsService } from '../../modules/products/products.service';
import { Product } from '../../modules/products/entities/product.entity';
import { LoginDto } from '../../auth/dto/login.dto';
import { configureHttp } from '../http/configure-http';

@Controller('events-test')
class EventsController {
  constructor(
    private readonly auth: AuthService,
    private readonly products: ProductsService,
  ) {}
  @Post('login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Post('forbidden')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  forbidden() {
    return 'never';
  }
  @Post('other-conflict') otherConflict() {
    throw new ConflictException('Otro conflicto');
  }
  @Post('optimistic') optimistic() {
    return this.products.update(
      1,
      { version: 1, nombre: 'Private product' },
      { idUsuario: 1, sub: 'private@example.test', rol: 'ADMIN' },
    );
  }
}

describe('Eventos de seguridad: HTTP real y persistencia simulada', () => {
  let app: INestApplication<App>;
  let output: jest.SpyInstance<
    boolean,
    Parameters<typeof process.stdout.write>
  >;
  const product = Object.assign(new Product(), {
    idProducto: 1,
    idTienda: 1,
    version: 2,
  });
  const query = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    getOne: jest.fn(),
  };
  const repo = new ProductsRepository({
    createQueryBuilder: () => query,
  } as unknown as Repository<Product>);
  const products = new ProductsService(repo, {} as never, {} as never);
  beforeAll(async () => {
    jest.spyOn(repo, 'findById').mockResolvedValue(product);
    const module = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        AuthService,
        RolesGuard,
        {
          provide: UsersRepository,
          useValue: { findByEmail: jest.fn().mockResolvedValue(null) },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: ProductsService, useValue: products },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>({
      logger: false,
    });
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, {
        user: { idUsuario: 7, sub: 'private@example.test', rol: 'CLIENTE' },
      });
      next();
    });
    configureHttp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });
  beforeEach(() => {
    query.execute.mockResolvedValue({ affected: 0 });
    query.getOne.mockResolvedValue(product);
    query.andWhere.mockClear();
    output = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  });
  afterEach(() => output.mockRestore());
  function events() {
    return output.mock.calls.map(([chunk]) => {
      const line = String(chunk);
      expect(line.split('\n')).toHaveLength(2);
      expect(line).not.toMatch(
        /private|password-marker|jwt-marker|cookie-marker|SELECT|stack/i,
      );
      return JSON.parse(line) as {
        event: string;
        level: string;
        context: string;
        reason: string;
        timestamp: string;
      };
    });
  }
  it('login rechazado conserva 401 y emite exactamente login_failed', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events-test/login')
      .send({ correo: 'private@example.test', clave: 'password-marker' })
      .expect(401);
    expect(events().map((e) => e.event)).toEqual(['login_failed']);
    expect(events()[0]).toMatchObject({
      level: 'warn',
      context: 'Authentication',
      reason: 'credentials_rejected',
    });
  });
  it('RolesGuard conserva 403 y solo el filtro emite access_denied', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events-test/forbidden')
      .set('Cookie', 'cookie-marker')
      .set('Authorization', 'Bearer jwt-marker')
      .expect(403);
    expect(events().map((e) => e.event)).toEqual(['access_denied']);
  });
  it('rechazo de UPDATE optimista conserva 409 y registra un único conflicto tipificado', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events-test/optimistic')
      .expect(409);
    expect(query.andWhere).toHaveBeenCalledWith(
      '"version" = :expectedVersion',
      { expectedVersion: 1 },
    );
    expect(events().map((e) => e.event)).toEqual(['concurrency_conflict']);
    expect(events()[0].reason).toBe('optimistic_version_mismatch');
  });
  it('otros 409 no se etiquetan como concurrencia', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events-test/other-conflict')
      .expect(409);
    expect(events()).toEqual([]);
  });
  it('producto no visible conserva 404 sin revelar conflicto de versión', async () => {
    query.getOne.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/api/v1/events-test/optimistic')
      .expect(404);
    expect(events()).toEqual([]);
  });
  it.each([
    ['login', 401],
    ['forbidden', 403],
    ['optimistic', 409],
  ] as const)(
    'un fallo síncrono del log no reemplaza el error de %s',
    async (route, status) => {
      output.mockImplementation(() => {
        throw new Error('sink-password-private');
      });
      const result = await request(app.getHttpServer())
        .post(`/api/v1/events-test/${route}`)
        .send(
          route === 'login'
            ? { correo: 'private@example.test', clave: 'password-marker' }
            : {},
        )
        .expect(status);
      expect(result.body).toHaveProperty('status', status);
      expect(JSON.stringify(result.body)).not.toContain(
        'sink-password-private',
      );
      expect(output).toHaveBeenCalledTimes(1);
    },
  );
});
