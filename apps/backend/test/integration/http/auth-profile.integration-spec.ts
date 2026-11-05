import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthModule } from '../../../src/auth/auth.module';
import { UsersHttpModule } from '../../../src/modules/users/users-http.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import {
  AUTH_RATE_LIMIT_OPTIONS,
  AUTH_RATE_LIMIT_CLOCK,
} from '../../../src/auth/rate-limit/auth-rate-limit.config';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Perfil propio HTTP con PostgreSQL temporal', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const password = 'Clave local de prueba 123!';
  let hash: string;
  let now = 0;
  const path = '/api/v1/auth/me';
  const server = () => context!.app.getHttpServer();
  const users = () => context!.database.dataSource.getRepository(User);

  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    hash = await bcrypt.hash(password, 4);
    context = await createHttpTestApp(
      [AuthModule, UsersHttpModule],
      undefined,
      (builder) =>
        builder
          .overrideProvider(AUTH_RATE_LIMIT_OPTIONS)
          .useValue({
            windowMs: 1000,
            limits: { login: 2, register: 2, adminLogin: 2 },
          })
          .overrideProvider(AUTH_RATE_LIMIT_CLOCK)
          .useValue(() => now),
    );
  });
  beforeEach(async () => {
    now += 2000;
    await users().createQueryBuilder().delete().execute();
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  async function account(rol = 'CLIENTE') {
    return users().save(
      users().create({
        authId: randomUUID(),
        nombre: 'Ana María',
        apellido: 'Prueba',
        correo: `${randomUUID()}@example.test`,
        rol,
        estado: 'ACTIVO',
        claveHash: hash,
      }),
    );
  }
  const token = (user: User, expiresIn = 3600) =>
    context!.app
      .get(JwtService)
      .signAsync(
        { sub: user.correo, idUsuario: user.idUsuario, rol: user.rol },
        { expiresIn },
      );

  it.each(['CLIENTE', 'EMPRENDEDOR', 'ADMIN', 'REPARTIDOR'])(
    'devuelve únicamente el perfil propio seguro de %s',
    async (rol) => {
      const user = await account(rol);
      await account();
      const response = await request(server())
        .get(`${path}?idUsuario=999`)
        .set('Authorization', `Bearer ${await token(user)}`)
        .expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        idUsuario: user.idUsuario,
        nombre: user.nombre,
        apellido: user.apellido,
        correo: user.correo,
        telefono: null,
        rol,
        estado: 'ACTIVO',
        fechaCreacion: user.fechaCreacion.toISOString(),
      });
      expect(response.text).not.toMatch(/clave|authId|token|tiendas|pedidos/);
    },
  );
  it.each(['ausente', 'inválido', 'vencido'])(
    'rechaza JWT %s',
    async (kind) => {
      const user = await account();
      const pending = request(server()).get(path);
      if (kind !== 'ausente')
        pending.set(
          'Authorization',
          `Bearer ${kind === 'vencido' ? await token(user, -1) : 'invalid'}`,
        );
      await pending.expect(401);
    },
  );
  it.each(['INACTIVO', 'eliminado'])(
    'rechaza usuario %s después de emitir JWT',
    async (state) => {
      const user = await account();
      const jwt = await token(user);
      if (state === 'eliminado') await users().delete(user.idUsuario);
      else await users().update(user.idUsuario, { estado: state });
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${jwt}`)
        .expect(401);
    },
  );
  it('recupera nombre, correo y rol vigentes y conserva restricciones administrativas', async () => {
    const user = await account('ADMIN');
    const jwt = await token(user);
    await users().update(user.idUsuario, {
      rol: 'CLIENTE',
      nombre: 'Nombre vigente',
      correo: 'vigente@example.test',
    });
    const response = await request(server())
      .get(path)
      .set('Authorization', `Bearer ${jwt}`)
      .expect(200);
    expect(response.body).toMatchObject({
      rol: 'CLIENTE',
      nombre: 'Nombre vigente',
      correo: 'vigente@example.test',
    });
    await request(server())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${jwt}`)
      .expect(403);
  });
  it('perfil no consume cuotas y login/registro siguen limitados', async () => {
    const user = await account();
    const jwt = await token(user);
    for (let i = 0; i < 4; i++)
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${jwt}`)
        .expect(200);
    for (let i = 0; i < 2; i++)
      await request(server())
        .post('/api/v1/auth/login')
        .send({ correo: user.correo, clave: password })
        .expect(201);
    await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: user.correo, clave: password })
      .expect(429);
    for (let i = 0; i < 2; i++)
      await request(server())
        .post('/api/v1/auth/register')
        .send({
          nombre: 'Cliente',
          apellido: 'Prueba',
          correo: `${randomUUID()}@example.test`,
          clave: password,
        })
        .expect(201);
    await request(server()).post('/api/v1/auth/register').send({}).expect(429);
    await request(server())
      .get(path)
      .set('Authorization', `Bearer ${jwt}`)
      .expect(200);
  });
});
