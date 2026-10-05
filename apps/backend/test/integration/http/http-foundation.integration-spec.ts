import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import request from 'supertest';
import type { ProblemDetails } from '../../../src/common/http/problem-details';
import { HealthModule } from '../../../src/modules/health/health.module';
import { CreateProductDto } from '../../../src/modules/products/dto/create-product.dto';
import { ProductsModule } from '../../../src/modules/products/products.module';
import { ProductsService } from '../../../src/modules/products/products.service';
import { ProductsRepository } from '../../../src/modules/products/repositories/products.repository';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Base HTTP sobre PostgreSQL temporal', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;

  beforeAll(async () => {
    context = await createHttpTestApp([ProductsModule, HealthModule]);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await context?.close();
  });

  function server() {
    if (!context) throw new Error('Aplicación HTTP no inicializada');
    return context.app.getHttpServer();
  }

  it('consulta la ruta real de productos con prefijo y PostgreSQL sin seeds', async () => {
    await request(server()).get('/api/v1/products').expect(200).expect([]);
  });

  it('retira la ruta de productos sin versión', async () => {
    await request(server())
      .get('/products')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);
  });

  it('conserva health fuera del prefijo y verifica su lectura real', async () => {
    const response = await request(server())
      .get('/api/database/health')
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'connected',
      database: 'chorotega_test',
    });
    await request(server()).get('/api/v1/api/database/health').expect(404);
  });

  it('responde con Problem Details ante un DTO inválido sin llegar al servicio', async () => {
    const create = jest.spyOn(context!.app.get(ProductsService), 'create');
    const response = await request(server())
      .post('/api/v1/products')
      .send({ nombre: 123 })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    const problem = response.body as ProblemDetails;
    expect(problem).toMatchObject({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      instance: '/api/v1/products',
      detail: 'La solicitud contiene datos no válidos.',
    });
    expect(problem.errors).toEqual(
      expect.arrayContaining(['nombre must be a string']),
    );
    expect(problem).not.toHaveProperty('stack');
    expect(create).not.toHaveBeenCalled();
  });

  const validProduct = {
    idTienda: 1,
    idCategoria: 1,
    nombre: 'Prueba',
    precio: 10,
    cantidadDisponible: 1,
  };

  it('rechaza propiedades ajenas al DTO', async () => {
    const response = await request(server())
      .post('/api/v1/products')
      .send({ ...validProduct, privilegio: true })
      .expect(400);
    expect(response.body).toMatchObject({
      errors: ['property privilegio should not exist'],
    });
  });

  it('transforma el cuerpo validado a la clase DTO antes de llamar al servicio', async () => {
    const create = jest
      .spyOn(context!.app.get(ProductsService), 'create')
      .mockRejectedValueOnce(new ConflictException('Conflicto de prueba'));
    await request(server())
      .post('/api/v1/products')
      .send(validProduct)
      .expect(409);
    expect(create).toHaveBeenCalledWith(expect.any(CreateProductDto));
  });

  it('normaliza JSON mal formado como Problem Details', async () => {
    await request(server())
      .post('/api/v1/products')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
  });

  it('responde 404 para una ruta inexistente sin reflejar la query en instance', async () => {
    const response = await request(server())
      .get('/api/v1/inexistente?token=dato-privado')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/inexistente',
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('oculta SQL, mensajes internos y trazas de un fallo inesperado', async () => {
    const error = new Error(
      'SELECT secret FROM private_table; password=internal-secret',
    );
    error.stack = 'private-stack';
    jest
      .spyOn(context!.app.get(ProductsRepository), 'findAll')
      .mockRejectedValueOnce(error);
    const response = await request(server())
      .get('/api/v1/products')
      .expect(500)
      .expect('Content-Type', /application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'No fue posible completar la solicitud.',
      instance: '/api/v1/products',
    });
    expect(response.text).not.toMatch(
      /SELECT|private|password|stack|internal-secret/,
    );
  });

  it.each([
    [new UnauthorizedException('Token requerido'), 401],
    [new ForbiddenException('Acceso denegado'), 403],
    [new ConflictException('Conflicto de prueba'), 409],
    [new UnprocessableEntityException('Regla de prueba'), 422],
  ] as const)(
    'conserva una excepción HTTP conocida: %s',
    async (error, status) => {
      // Simula únicamente el error; la solicitud atraviesa Nest y el filtro real.
      jest
        .spyOn(context!.app.get(ProductsService), 'findAll')
        .mockRejectedValueOnce(error);
      const response = await request(server())
        .get('/api/v1/products')
        .expect(status)
        .expect('Content-Type', /application\/problem\+json/);
      expect(response.body).toMatchObject({ status, detail: error.message });
    },
  );
});
