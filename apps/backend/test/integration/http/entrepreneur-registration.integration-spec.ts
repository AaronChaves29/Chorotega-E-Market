import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AuthModule } from '../../../src/auth/auth.module';
import { StoresModule } from '../../../src/modules/stores/stores.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Entrepreneur registration: HTTP and ephemeral PostgreSQL transaction', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const path = '/api/v1/auth/register/entrepreneur';
  const source = () => context!.database.dataSource;
  const server = () => context!.app.getHttpServer();
  const input = () => ({
    nombre: 'Ana',
    apellido: 'Jimenez',
    correo: `${randomUUID()}@example.test`,
    clave: 'Clave-negocio-local-123!',
    telefono: '+506 8888-8888',
    tienda: {
      nombre: 'Artesanias locales',
      direccion: 'Nicoya, direccion de prueba',
      descripcion: 'Ceramica local',
      horario: 'Lunes a viernes',
    },
  });
  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp([AuthModule, StoresModule]);
  });
  afterEach(async () => {
    if (!context) return;
    await source().query(
      'DROP TRIGGER IF EXISTS fail_entrepreneur_store ON tienda',
    );
    await source().query('DROP FUNCTION IF EXISTS fail_entrepreneur_store()');
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
  it('creates distinct person/business, hashes password, links ownership, logs in and reads the private store', async () => {
    const body = input();
    body.correo = '  ANA@Example.Test  ';
    const registered = await request(server())
      .post(path)
      .send(body)
      .expect(201);
    expect(registered.body).toMatchObject({
      usuario: {
        nombre: 'Ana',
        apellido: 'Jimenez',
        correo: 'ana@example.test',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      },
      tienda: {
        nombre: body.tienda.nombre,
        direccion: body.tienda.direccion,
        descripcion: body.tienda.descripcion,
        horario: body.tienda.horario,
        telefono: body.telefono,
        estado: 'ACTIVA',
      },
    });
    expect(registered.text).not.toMatch(/clave|authId|token|Bearer/);
    const user = await source()
      .getRepository(User)
      .findOneByOrFail({ correo: 'ana@example.test' });
    const store = await source()
      .getRepository(Store)
      .findOneByOrFail({ idEmprendedor: user.idUsuario });
    expect(store.nombre).not.toBe(user.nombre);
    expect(store.telefono).toBe(user.telefono);
    expect(await bcrypt.compare(body.clave, user.claveHash!)).toBe(true);
    expect(bcrypt.getRounds(user.claveHash!)).toBe(10);
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: body.correo, clave: body.clave })
      .expect(201);
    const token = (login.body as { token: string }).token;
    const profile = await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(profile.body).toMatchObject({
      idUsuario: user.idUsuario,
      rol: 'EMPRENDEDOR',
    });
    await request(server()).get(`/api/v1/stores/${store.idTienda}`).expect(401);
    const visible = await request(server())
      .get(`/api/v1/stores/${store.idTienda}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(visible.body).toMatchObject({
      idEmprendedor: user.idUsuario,
      idTienda: store.idTienda,
    });
  });
  it('accepts optional omissions without inventing data', async () => {
    const body = input();
    const minimal = {
      nombre: body.nombre,
      apellido: body.apellido,
      correo: body.correo,
      clave: body.clave,
      tienda: { nombre: body.tienda.nombre, direccion: body.tienda.direccion },
    };
    await request(server()).post(path).send(minimal).expect(201);
    expect(
      await source().getRepository(Store).findOneByOrFail({ idTienda: 1 }),
    ).toMatchObject({ descripcion: null, horario: null, telefono: null });
  });
  it('rejects a duplicate client email without changing its role or creating a store', async () => {
    const body = input();
    await request(server())
      .post('/api/v1/auth/register')
      .send({
        nombre: body.nombre,
        apellido: body.apellido,
        correo: body.correo,
        clave: body.clave,
      })
      .expect(201);
    await request(server())
      .post(path)
      .send({ ...body, correo: body.correo.toUpperCase() })
      .expect(409);
    expect(await source().getRepository(User).count()).toBe(1);
    expect(await source().getRepository(Store).count()).toBe(0);
    expect(
      await source()
        .getRepository(User)
        .findOneByOrFail({ correo: body.correo }),
    ).toMatchObject({ rol: 'CLIENTE' });
  });
  it('handles concurrent registrations with the same normalized email atomically', async () => {
    const body = input();
    const results = await Promise.all([
      request(server()).post(path).send(body),
      request(server())
        .post(path)
        .send({ ...body, correo: body.correo.toUpperCase() }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await source().getRepository(User).count()).toBe(1);
    expect(await source().getRepository(Store).count()).toBe(1);
  });
  it('rolls back both inserts when the real store insert fails and permits a clean retry', async () => {
    await source().query(
      `CREATE FUNCTION fail_entrepreneur_store() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'private-store-failure'; END; $$ LANGUAGE plpgsql`,
    );
    await source().query(
      `CREATE TRIGGER fail_entrepreneur_store AFTER INSERT ON tienda FOR EACH ROW EXECUTE FUNCTION fail_entrepreneur_store()`,
    );
    const body = input();
    const response = await request(server()).post(path).send(body).expect(500);
    expect(response.text).not.toMatch(
      /private-store-failure|INSERT|clave|driverError|stack/,
    );
    expect(await source().getRepository(User).count()).toBe(0);
    expect(await source().getRepository(Store).count()).toBe(0);
    await source().query('DROP TRIGGER fail_entrepreneur_store ON tienda');
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
    { tienda: undefined },
    { tienda: [] },
    { tienda: {} },
    { tienda: { nombre: 'Negocio' } },
    { tienda: { nombre: ' ', direccion: 'Nicoya' } },
    { tienda: { nombre: 'Negocio', direccion: ' ' } },
    { tienda: { nombre: 'N'.repeat(151), direccion: 'Nicoya' } },
    { tienda: { nombre: 'Negocio', direccion: 'D'.repeat(256) } },
    { tienda: { nombre: 'Negocio', direccion: 'Nicoya', idEmprendedor: 123 } },
    { tienda: { nombre: 'Negocio', direccion: 'Nicoya', estado: 'ACTIVA' } },
    {
      tienda: {
        nombre: 'Negocio',
        direccion: 'Nicoya',
        descripcion: 'D'.repeat(501),
      },
    },
    {
      tienda: {
        nombre: 'Negocio',
        direccion: 'Nicoya',
        horario: 'H'.repeat(151),
      },
    },
    {
      tienda: {
        nombre: 'Negocio',
        direccion: 'Nicoya',
        logo: 'pretend-upload',
      },
    },
    {
      tienda: {
        nombre: 'Negocio',
        direccion: 'Nicoya',
        redesSociales: 'not-supported',
      },
    },
  ])(
    'rejects invalid or privileged input %# without partial records',
    async (override) => {
      const response = await request(server())
        .post(path)
        .send({ ...input(), ...override })
        .expect(400);
      expect(response.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );
      expect(await source().getRepository(User).count()).toBe(0);
      expect(await source().getRepository(Store).count()).toBe(0);
    },
  );
});
