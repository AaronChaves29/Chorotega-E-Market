import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  Res,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
import request from 'supertest';
import type { Server } from 'node:http';
import { startHttpServer } from './start-http-server';
import { validateEnvironment } from '../../config/environment';

class ProbeDto {
  @IsString() @MinLength(1) nombre!: string;
}
@Controller('configuration-probe')
class ProbeController {
  @Get() get() {
    return { ok: true };
  }
  @Post() create(
    @Body() body: ProbeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.location('/api/v1/configuration-probe');
    return { nombre: body.nombre };
  }
}
@Controller('api/database')
class HealthRouteProbeController {
  @Get('health') get() {
    return { ok: true };
  }
}
@Module({ controllers: [ProbeController, HealthRouteProbeController] })
class ProbeModule {}

function values() {
  return {
    NODE_ENV: 'test',
    PORT: 0,
    DATABASE_URL: 'postgresql://localhost/config_test',
    DATABASE_SSL: 'false',
    MONGODB_URI: 'mongodb://localhost:27017',
    MONGODB_DATABASE: 'config_test',
    JWT_SECRET: randomBytes(32).toString('hex'),
    CORS_ORIGIN: 'https://frontend.example.test',
  };
}

describe('Arranque HTTP con configuración validada, sin bases de datos', () => {
  let app: INestApplication<Server> | undefined;
  let destroyed = false;
  beforeEach(async () => {
    destroyed = false;
    const module = await Test.createTestingModule({
      imports: [
        ProbeModule,
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          skipProcessEnv: true,
          load: [() => validateEnvironment(values())],
        }),
      ],
      providers: [
        {
          provide: 'cleanup-probe',
          useValue: {
            onModuleDestroy() {
              destroyed = true;
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    await startHttpServer(app);
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });
  function server() {
    if (!app) throw new Error('Aplicación no inicializada');
    return app.getHttpServer();
  }

  it('arranca realmente en puerto efímero con bind público', async () => {
    const address = server().address() as AddressInfo;
    expect(address.port).toBeGreaterThan(0);
    expect(address.address).toBe('0.0.0.0');
    await request(server())
      .get('/api/v1/configuration-probe')
      .expect(200)
      .expect({ ok: true });
  });
  it('autoriza origen configurado, expone Location y conserva 201', async () => {
    const response = await request(server())
      .post('/api/v1/configuration-probe')
      .set('Origin', 'https://frontend.example.test')
      .send({ nombre: 'Prueba' })
      .expect(201);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://frontend.example.test',
    );
    expect(response.headers['access-control-expose-headers']).toBe('Location');
    expect(response.headers.location).toBe('/api/v1/configuration-probe');
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    expect(response.body).toEqual({ nombre: 'Prueba' });
  });
  it('responde preflight con métodos y encabezados acotados sin pedir JWT', async () => {
    const response = await request(server())
      .options('/api/v1/configuration-probe')
      .set('Origin', 'https://frontend.example.test')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);
    expect(response.text).toBe('');
    expect(response.headers['access-control-allow-methods']).toBe(
      'GET,HEAD,POST,PATCH,DELETE,OPTIONS',
    );
    expect(response.headers['access-control-allow-headers']).toBe(
      'Authorization,Content-Type',
    );
  });
  it.each(['https://other.example.test', 'null'])(
    'rechaza origen ajeno antes de ejecutar la ruta',
    async (origin) => {
      const response = await request(server())
        .post('/api/v1/configuration-probe')
        .set('Origin', origin)
        .send({ nombre: 'Prueba' })
        .expect(403)
        .expect('Content-Type', /application\/problem\+json/);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.body).toMatchObject({
        type: 'about:blank',
        status: 403,
        detail: 'Origen no autorizado.',
      });
    },
  );
  it('conserva peticiones sin Origin y exclusión de Health', async () => {
    await request(server()).get('/api/database/health').expect(200);
    await request(server()).get('/api/v1/api/database/health').expect(404);
  });
  it('mantiene validación, whitelist y Problem Details del Lab 5', async () => {
    const response = await request(server())
      .post('/api/v1/configuration-probe')
      .send({ nombre: 'Prueba', extra: 'rechazar' })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(response.body).toMatchObject({
      status: 400,
      instance: '/api/v1/configuration-probe',
      errors: ['property extra should not exist'],
    });
    await request(server())
      .post('/api/v1/configuration-probe')
      .send({ nombre: 123 })
      .expect(400);
  });
  it('conserva Swagger público y rutas versionadas', async () => {
    await request(server()).get('/docs').expect(200);
    const response = await request(server()).get('/docs-json').expect(200);
    expect(response.body).toMatchObject({
      openapi: '3.0.0',
      paths: { '/api/v1/configuration-probe': expect.any(Object) as object },
    });
  });
  it('ejecuta limpieza de proveedores al cerrar', async () => {
    await app!.close();
    app = undefined;
    expect(destroyed).toBe(true);
  });
});

describe('Validación de producción antes de arrancar Nest', () => {
  it('rechaza configuración incompleta sin cargar .env ni conectar servicios', async () => {
    const root = ConfigModule.forRoot({
      ignoreEnvFile: true,
      ignoreEnvVars: true,
      skipProcessEnv: true,
      load: [() => validateEnvironment({ NODE_ENV: 'production' })],
    });
    await expect(
      Test.createTestingModule({ imports: [root] }).compile(),
    ).rejects.toThrow('DATABASE_URL');
  });

  it('inicializa Nest con configuración de producción válida sin servicios externos', async () => {
    const root = ConfigModule.forRoot({
      ignoreEnvFile: true,
      ignoreEnvVars: true,
      skipProcessEnv: true,
      load: [
        () =>
          validateEnvironment({
            ...values(),
            NODE_ENV: 'production',
            PORT: 3000,
            DATABASE_SSL: 'true',
            MONGODB_URI: 'mongodb+srv://cluster.example.test/config_test',
          }),
      ],
    });
    const module = await Test.createTestingModule({
      imports: [ProbeModule, root],
    }).compile();
    const application = module.createNestApplication();
    try {
      await application.init();
    } finally {
      await application.close();
    }
  });
});
