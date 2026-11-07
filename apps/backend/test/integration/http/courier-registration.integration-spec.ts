import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AuthModule } from '../../../src/auth/auth.module';
import { CouriersModule } from '../../../src/modules/couriers/couriers.module';
import { DeliveriesModule } from '../../../src/modules/deliveries/deliveries.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Courier } from '../../../src/modules/couriers/entities/courier.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Courier registration: HTTP and ephemeral PostgreSQL transaction', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const path = '/api/v1/auth/register/courier';
  const source = () => context!.database.dataSource;
  const server = () => context!.app.getHttpServer();
  const input = () => ({
    nombre: 'Ana',
    apellido: 'Jimenez',
    correo: `${randomUUID()}@example.test`,
    clave: 'Clave-negocio-local-123!',
    telefono: '+506 8888-8888',
    medioTransporte: 'Bicicleta',
  });
  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp([
      AuthModule,
      CouriersModule,
      DeliveriesModule,
    ]);
  });
  afterEach(async () => {
    if (!context) return;
    await source().query(
      'DROP TRIGGER IF EXISTS fail_courier_store ON repartidor',
    );
    await source().query('DROP FUNCTION IF EXISTS fail_courier_store()');
    await source().query(
      'TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda, usuario RESTART IDENTITY',
    );
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  it('creates a courier, hashes the password, logs in and preserves delivery permissions', async () => {
    const body = input();
    body.correo = '  REPARTIDOR@Example.Test  ';
    const registered = await request(server())
      .post(path)
      .send(body)
      .expect(201);
    expect(registered.body).toMatchObject({
      usuario: {
        rol: 'REPARTIDOR',
        correo: 'repartidor@example.test',
        estado: 'ACTIVO',
      },
      repartidor: {
        medioTransporte: 'Bicicleta',
        disponibilidad: 'DISPONIBLE',
      },
    });
    expect(registered.text).not.toMatch(/clave|authId|token|Bearer/);
    const user = await source()
      .getRepository(User)
      .findOneByOrFail({ correo: 'repartidor@example.test' });
    const courier = await source()
      .getRepository(Courier)
      .findOneByOrFail({ idUsuario: user.idUsuario });
    expect(courier.idUsuario).toBe(user.idUsuario);
    expect(await bcrypt.compare(body.clave, user.claveHash!)).toBe(true);
    expect(bcrypt.getRounds(user.claveHash!)).toBe(10);
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: body.correo, clave: body.clave })
      .expect(201);
    const token = (login.body as { token: string }).token;
    const me = await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(me.body).toMatchObject({
      idUsuario: user.idUsuario,
      rol: 'REPARTIDOR',
    });
    await request(server())
      .get('/api/v1/couriers')
      .set('Authorization', 'Bearer ' + token)
      .expect(403);
    await request(server())
      .get('/api/v1/deliveries')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    await request(server())
      .post('/api/v1/deliveries')
      .set('Authorization', 'Bearer ' + token)
      .send({ idPedido: 1, idRepartidor: courier.idRepartidor })
      .expect(403);
  });
  it('accepts an omitted optional phone and persists the actual trimmed transport', async () => {
    const { telefono: _phone, ...body } = input();
    expect(_phone).toBeDefined();
    await request(server())
      .post(path)
      .send({ ...body, medioTransporte: '  Motocicleta  ' })
      .expect(201);
    expect(
      await source()
        .getRepository(User)
        .findOneByOrFail({ correo: body.correo }),
    ).toMatchObject({ telefono: null });
    expect(
      await source()
        .getRepository(Courier)
        .findOneByOrFail({ idRepartidor: 1 }),
    ).toMatchObject({ medioTransporte: 'Motocicleta' });
  });
  it.each(['client', 'entrepreneur'])(
    'does not convert an existing %s account or create a profile',
    async (role) => {
      const { medioTransporte: _transport, ...body } = input();
      expect(_transport).toBeDefined();
      const url =
        role === 'client'
          ? '/api/v1/auth/register'
          : '/api/v1/auth/register/entrepreneur';
      await request(server())
        .post(url)
        .send({
          ...body,
          ...(role === 'entrepreneur'
            ? { tienda: { nombre: 'Negocio', direccion: 'Nicoya' } }
            : {}),
        })
        .expect(201);
      await request(server())
        .post(path)
        .send({ ...input(), correo: body.correo.toUpperCase() })
        .expect(409);
      expect(await source().getRepository(User).count()).toBe(1);
      expect(await source().getRepository(Courier).count()).toBe(0);
      expect(
        (
          await source()
            .getRepository(User)
            .findOneByOrFail({ correo: body.correo })
        ).rol,
      ).toBe(role === 'client' ? 'CLIENTE' : 'EMPRENDEDOR');
    },
  );
  it('handles concurrent normalized duplicates without a second account or profile', async () => {
    const body = input();
    const results = await Promise.all([
      request(server()).post(path).send(body),
      request(server())
        .post(path)
        .send({ ...body, correo: body.correo.toUpperCase() }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await source().getRepository(User).count()).toBe(1);
    expect(await source().getRepository(Courier).count()).toBe(1);
  });
  it('rolls back user and profile on a real profile insert failure, then permits retry', async () => {
    await source().query(
      `CREATE FUNCTION fail_courier_store() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'private-profile-failure'; END; $$ LANGUAGE plpgsql`,
    );
    await source().query(
      `CREATE TRIGGER fail_courier_store AFTER INSERT ON repartidor FOR EACH ROW EXECUTE FUNCTION fail_courier_store()`,
    );
    const body = input();
    const response = await request(server()).post(path).send(body).expect(500);
    expect(response.text).not.toMatch(
      /private-profile-failure|INSERT|clave|driverError|stack/,
    );
    expect(await source().getRepository(User).count()).toBe(0);
    expect(await source().getRepository(Courier).count()).toBe(0);
    await source().query('DROP TRIGGER fail_courier_store ON repartidor');
    await request(server()).post(path).send(body).expect(201);
  });
  it.each([
    { rol: 'ADMIN' },
    { rol: 'EMPRENDEDOR' },
    { estado: 'ACTIVO' },
    { idUsuario: 99 },
    { authId: randomUUID() },
    { nombre: ' ' },
    { apellido: '' },
    { correo: 'invalid' },
    { clave: 'short' },
    { clave: '🔒'.repeat(19) },
    { telefono: 'abc' },
    { telefono: '123' },
    { telefono: '1'.repeat(21) },
    { medioTransporte: undefined },
    { medioTransporte: null },
    { medioTransporte: ' ' },
    { medioTransporte: 123 },
    { medioTransporte: 'T'.repeat(51) },
    { idRepartidor: 99 },
    { disponibilidad: 'OCUPADO' },
    { placa: 'unsupported' },
    { usuario: { idUsuario: 99 } },
  ])(
    'rejects invalid or privileged input %# without partial records',
    async (override) => {
      await request(server())
        .post(path)
        .send({ ...input(), ...override })
        .expect(400);
      expect(await source().getRepository(User).count()).toBe(0);
      expect(await source().getRepository(Courier).count()).toBe(0);
    },
  );
});
