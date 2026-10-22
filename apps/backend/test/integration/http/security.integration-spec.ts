import { randomUUID } from 'node:crypto';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import type { Repository } from 'typeorm';

import type { ProblemDetails } from '../../../src/common/http/problem-details';
import { AuthModule } from '../../../src/auth/auth.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { Courier } from '../../../src/modules/couriers/entities/courier.entity';
import { Delivery } from '../../../src/modules/deliveries/entities/delivery.entity';
import { DeliveriesModule } from '../../../src/modules/deliveries/deliveries.module';
import { createHttpTestApp } from '../../support/create-http-test-app';

interface LoginResponseBody {
  token: string;
  tipo: string;
  expiraEnSegundos: number;
}

describe('Seguridad HTTP con JWT', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;

  let users: Repository<User>;
  let stores: Repository<Store>;
  let neighborhoods: Repository<Neighborhood>;
  let orders: Repository<Order>;
  let couriers: Repository<Courier>;
  let deliveries: Repository<Delivery>;

  const password = 'PasswordPrueba123!';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-test-jwt-secret';

    context = await createHttpTestApp([AuthModule, DeliveriesModule]);

    const dataSource = context.database.dataSource;

    users = dataSource.getRepository(User);
    stores = dataSource.getRepository(Store);
    neighborhoods = dataSource.getRepository(Neighborhood);
    orders = dataSource.getRepository(Order);
    couriers = dataSource.getRepository(Courier);
    deliveries = dataSource.getRepository(Delivery);
  });

  afterEach(async () => {
    if (!context) return;

    await context.database.dataSource.query(`
      TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor,
        barrio, producto, categoria, tienda, usuario RESTART IDENTITY
    `);
  });

  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      delete process.env.JWT_SECRET;
    }
  });

  function server() {
    if (!context) {
      throw new Error('Aplicación HTTP no inicializada');
    }

    return context.app.getHttpServer();
  }

  async function createUser(
    rol: 'ADMIN' | 'CLIENTE' | 'EMPRENDEDOR' | 'REPARTIDOR',
  ): Promise<User> {
    const claveHash = await bcrypt.hash(password, 10);

    return users.save(
      users.create({
        authId: randomUUID(),
        nombre: 'Usuario',
        apellido: 'Seguridad',
        correo: `${rol.toLowerCase()}-${randomUUID()}@test.com`,
        telefono: '88888888',
        rol,
        estado: 'ACTIVO',
        claveHash,
      }),
    );
  }

  async function login(user: User): Promise<string> {
    const response = await request(server())
      .post('/api/v1/auth/login')
      .send({
        correo: user.correo,
        clave: password,
      })
      .expect(201);

    const body = response.body as LoginResponseBody;

    expect(body).toMatchObject({
      tipo: 'Bearer',
      expiraEnSegundos: 3600,
    });

    expect(body.token).toEqual(expect.any(String));

    return body.token;
  }

  it('inicia sesión con credenciales válidas y devuelve un JWT', async () => {
    const user = await createUser('REPARTIDOR');

    const token = await login(user);

    expect(token.length).toBeGreaterThan(0);
  });

  it('rechaza credenciales incorrectas con 401', async () => {
    const user = await createUser('REPARTIDOR');

    const response = await request(server())
      .post('/api/v1/auth/login')
      .send({
        correo: user.correo,
        clave: 'clave-incorrecta',
      })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    const problem = response.body as ProblemDetails;

    expect(problem).toMatchObject({
      status: 401,
      title: 'Unauthorized',
      instance: '/api/v1/auth/login',
    });

    expect(problem).not.toHaveProperty('stack');
  });

  it('rechaza una ruta protegida cuando no se envía JWT', async () => {
    const response = await request(server())
      .post('/api/v1/deliveries')
      .send({
        idPedido: 1,
        idRepartidor: 1,
      })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    const problem = response.body as ProblemDetails;

    expect(problem).toMatchObject({
      status: 401,
      title: 'Unauthorized',
      instance: '/api/v1/deliveries',
    });

    expect(problem).not.toHaveProperty('stack');
  });

  it('rechaza con 403 a un REPARTIDOR que intenta una operación exclusiva de ADMIN', async () => {
    const courierUser = await createUser('REPARTIDOR');
    const token = await login(courierUser);

    const response = await request(server())
      .post('/api/v1/deliveries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        idPedido: 1,
        idRepartidor: 1,
      })
      .expect(403)
      .expect('Content-Type', /application\/problem\+json/);

    const problem = response.body as ProblemDetails;

    expect(problem).toMatchObject({
      status: 403,
      title: 'Forbidden',
      instance: '/api/v1/deliveries',
    });

    expect(problem).not.toHaveProperty('stack');
  });

  it('rechaza con 403 a un REPARTIDOR que intenta completar una entrega ajena', async () => {
    const entrepreneur = await createUser('EMPRENDEDOR');
    const customer = await createUser('CLIENTE');

    const authenticatedCourierUser = await createUser('REPARTIDOR');
    const ownerCourierUser = await createUser('REPARTIDOR');

    const store = await stores.save(
      stores.create({
        idEmprendedor: entrepreneur.idUsuario,
        nombre: `Tienda Seguridad ${randomUUID()}`,
        descripcion: 'Tienda para prueba HTTP de ownership',
        direccion: 'Nicoya',
        telefono: '26660000',
        horario: '8:00 - 17:00',
        estado: 'ACTIVA',
      }),
    );

    const neighborhood = await neighborhoods.save(
      neighborhoods.create({
        nombre: `Barrio Seguridad ${randomUUID()}`,
        tarifaEnvio: '1500.00',
        estado: 'ACTIVO',
      }),
    );

    const order = await orders.save(
      orders.create({
        idCliente: customer.idUsuario,
        idTienda: store.idTienda,
        idBarrio: neighborhood.idBarrio,
        estado: 'EN_CAMINO',
        subtotal: '10000.00',
        tarifaEnvio: '1500.00',
        total: '11500.00',
        direccionEntrega: 'Dirección de prueba de seguridad',
      }),
    );

    const authenticatedCourier = await couriers.save(
      couriers.create({
        idUsuario: authenticatedCourierUser.idUsuario,
        medioTransporte: 'MOTO',
        disponibilidad: 'OCUPADO',
      }),
    );

    const ownerCourier = await couriers.save(
      couriers.create({
        idUsuario: ownerCourierUser.idUsuario,
        medioTransporte: 'MOTO',
        disponibilidad: 'OCUPADO',
      }),
    );

    const delivery = await deliveries.save(
      deliveries.create({
        idPedido: order.idPedido,
        idRepartidor: ownerCourier.idRepartidor,
        estado: 'EN_CAMINO',
        fechaAsignacion: new Date(),
        fechaEntrega: null,
      }),
    );

    expect(authenticatedCourier.idRepartidor).not.toBe(
      ownerCourier.idRepartidor,
    );

    const token = await login(authenticatedCourierUser);

    const response = await request(server())
      .post(`/api/v1/deliveries/${delivery.idEntrega}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
      .expect('Content-Type', /application\/problem\+json/);

    const problem = response.body as ProblemDetails;

    expect(problem).toMatchObject({
      status: 403,
      title: 'Forbidden',
      instance: `/api/v1/deliveries/${delivery.idEntrega}/complete`,
    });

    expect(problem).not.toHaveProperty('stack');

    const persistedDelivery = await deliveries.findOneByOrFail({
      idEntrega: delivery.idEntrega,
    });

    expect(persistedDelivery.estado).toBe('EN_CAMINO');
    expect(persistedDelivery.fechaEntrega).toBeNull();
  });
});
