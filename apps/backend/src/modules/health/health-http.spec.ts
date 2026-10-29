import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HealthModule } from './health.module';
import { configureHttp } from '../../common/http/configure-http';

describe('Health HTTP y OpenAPI sin bases externas', () => {
  let app: INestApplication<App>;
  const query = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [HealthModule] })
      .useMocker((token) => (token === DataSource ? { query } : undefined))
      .compile();
    app = module.createNestApplication<INestApplication<App>>({
      logger: false,
    });
    configureHttp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => query.mockReset());
  it('conserva ruta pública y 200 sin nombre de BD ni timestamp', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await request(app.getHttpServer())
      .get('/api/database/health')
      .expect(200)
      .expect({ status: 'connected' });
    await request(app.getHttpServer())
      .get('/api/v1/api/database/health')
      .expect(404);
  });
  it('conserva 503 Problem Details sin SQL, credenciales ni nombre de BD', async () => {
    query.mockRejectedValue(
      new Error('SELECT private FROM secret_db password=marker'),
    );
    const result = await request(app.getHttpServer())
      .get('/api/database/health')
      .expect(503)
      .expect('Content-Type', /application\/problem\+json/);
    expect(result.body).toEqual({
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
      detail: 'No fue posible completar la solicitud.',
      instance: '/api/database/health',
    });
    expect(JSON.stringify(result.body)).not.toMatch(/SELECT|secret_db|marker/);
  });
  it('documenta exclusivamente status en el esquema exitoso vigente', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schema = doc.components!.schemas!.DatabaseHealthResponseDto;
    expect(schema).toHaveProperty('properties.status');
    expect(schema).not.toHaveProperty('properties.database');
    expect(schema).not.toHaveProperty('properties.timestamp');
  });
});
