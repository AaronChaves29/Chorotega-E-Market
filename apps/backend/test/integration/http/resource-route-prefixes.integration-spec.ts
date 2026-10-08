import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CouriersModule } from '../../../src/modules/couriers/couriers.module';
import { Courier } from '../../../src/modules/couriers/entities/courier.entity';
import { CourierResponseDto } from '../../../src/modules/couriers/dtos/courier-response.dto';
import { NeighborhoodsModule } from '../../../src/modules/neighborhoods/neighborhoods.module';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { NeighborhoodResponseDto } from '../../../src/modules/neighborhoods/dtos/neighborhood-response.dto';
import { User } from '../../../src/modules/users/entities/user.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Prefijos HTTP de barrios y repartidores', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  let neighborhood: NeighborhoodResponseDto;
  let courier: CourierResponseDto;

  beforeAll(async () => {
    context = await createHttpTestApp([NeighborhoodsModule, CouriersModule]);
    const source = context.database.dataSource;
    const savedNeighborhood = await source.getRepository(Neighborhood).save({
      nombre: 'Barrio de prueba',
      tarifaEnvio: '1.25',
      estado: 'ACTIVO',
    });
    const user = await source.getRepository(User).save({
      authId: randomUUID(),
      nombre: 'Repartidor',
      apellido: 'Prueba',
      correo: 'rutas@example.test',
      rol: 'REPARTIDOR',
      estado: 'ACTIVO',
    });
    const savedCourier = await source.getRepository(Courier).save({
      idUsuario: user.idUsuario,
      medioTransporte: 'BICICLETA',
      disponibilidad: 'DISPONIBLE',
    });
    neighborhood = {
      idBarrio: savedNeighborhood.idBarrio,
      nombre: 'Barrio de prueba',
      tarifaEnvio: '1.25',
      estado: 'ACTIVO',
    };
    courier = {
      idRepartidor: savedCourier.idRepartidor,
      idUsuario: user.idUsuario,
      medioTransporte: 'BICICLETA',
      disponibilidad: 'DISPONIBLE',
    };
  });

  afterAll(async () => {
    await context?.close();
  });

  function server() {
    if (!context) throw new Error('Aplicación HTTP no inicializada');
    return context.app.getHttpServer();
  }

  describe.each(['neighborhoods', 'couriers'] as const)('%s', (resource) => {
    const path = `/api/v1/${resource}`;
    const oldPath = `/api/v1/api/v1/${resource}`;
    const result = () =>
      resource === 'neighborhoods' ? neighborhood : courier;
    const id = () =>
      resource === 'neighborhoods'
        ? neighborhood.idBarrio
        : courier.idRepartidor;

    it('expone la colección pública con un único prefijo y DTOs', async () => {
      await request(server()).get(path).expect(200).expect([result()]);
    });

    it('expone el detalle público con un único prefijo y DTO', async () => {
      await request(server())
        .get(`${path}/${id()}`)
        .expect(200)
        .expect(result());
    });

    it.each(['listado', 'detalle'] as const)(
      'no registra la ruta anterior de %s aunque exista el recurso',
      async (operation) => {
        const route = operation === 'listado' ? oldPath : `${oldPath}/${id()}`;
        const response = await request(server())
          .get(route)
          .expect(404)
          .expect('Content-Type', /application\/problem\+json/);
        expect(response.body).toMatchObject({
          status: 404,
          instance: route,
          detail: `Cannot GET ${route}`,
        });
      },
    );

    it('conserva el 400 de ID inválido en la ruta corregida', async () => {
      const response = await request(server())
        .get(`${path}/abc`)
        .expect(400)
        .expect('Content-Type', /application\/problem\+json/);
      expect(response.body).toMatchObject({
        status: 400,
        instance: `${path}/abc`,
      });
    });

    it('conserva el 404 de un recurso inexistente', async () => {
      const response = await request(server())
        .get(`${path}/2147483647`)
        .expect(404)
        .expect('Content-Type', /application\/problem\+json/);
      expect(response.body).toMatchObject({
        status: 404,
        instance: `${path}/2147483647`,
        detail:
          resource === 'neighborhoods'
            ? 'Barrio 2147483647 no encontrado'
            : 'Repartidor 2147483647 no encontrado',
      });
    });
  });
});
