import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AuthModule } from '../../../src/auth/auth.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Autenticación: registro de clientes HTTP con PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const path = '/api/v1/auth/register';
  const password = 'Clave-de-prueba-local-123!';

  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }

  function registration(overrides: Record<string, unknown> = {}) {
    return {
      nombre: 'Ana María',
      apellido: 'De la Cruz',
      correo: `${randomUUID()}@example.test`,
      telefono: '88888888',
      clave: password,
      ...overrides,
    };
  }

  function problem(response: request.Response, status: number) {
    expect(response.headers['content-type']).toMatch(
      /application\/problem\+json/,
    );
    expect(response.body).toMatchObject({
      type: 'about:blank',
      status,
      title: expect.any(String) as string,
      detail: expect.any(String) as string,
      instance: expect.any(String) as string,
    });
    expect(response.text).not.toMatch(
      /QueryFailedError|SELECT |INSERT |driverError|stack/,
    );
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp([AuthModule]);
  });

  beforeEach(async () => {
    await context!.database.dataSource.query(
      'TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda, usuario RESTART IDENTITY CASCADE',
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

  it('crea una cuenta CLIENTE y permite iniciar sesión sin exponer credenciales', async () => {
    const input = registration({ correo: '  ANA@Example.Test ' });
    const response = await request(server()).post(path).send(input).expect(201);

    expect(response.body).toEqual({
      idUsuario: 1,
      nombre: 'Ana María',
      apellido: 'De la Cruz',
      correo: 'ana@example.test',
      telefono: '88888888',
      rol: 'CLIENTE',
      estado: 'ACTIVO',
      fechaCreacion: expect.any(String) as string,
    });
    expect(response.body).not.toHaveProperty('clave');
    expect(response.body).not.toHaveProperty('claveHash');
    expect(response.body).not.toHaveProperty('authId');

    const user = await context!.database.dataSource
      .getRepository(User)
      .findOneByOrFail({ correo: 'ana@example.test' });
    expect(user.authId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(user.rol).toBe('CLIENTE');
    expect(user.claveHash).not.toBe(password);
    expect(await bcrypt.compare(password, user.claveHash!)).toBe(true);

    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: 'ana@example.test', clave: password })
      .expect(201);
    expect(login.body).toMatchObject({
      token: expect.any(String) as string,
      tipo: 'Bearer',
      expiraEnSegundos: 3600,
    });
    expect(login.body).not.toHaveProperty('clave');
    expect(login.body).not.toHaveProperty('claveHash');
    expect(login.body).not.toHaveProperty('authId');
  });

  it('rechaza correos repetidos tras normalizar mayúsculas y espacios', async () => {
    await request(server())
      .post(path)
      .send(registration({ correo: '  Ana@Example.Test  ' }))
      .expect(201);

    const duplicate = await request(server())
      .post(path)
      .send(registration({ correo: 'ANA@example.TEST' }))
      .expect(409);

    problem(duplicate, 409);
    expect(await context!.database.dataSource.getRepository(User).count()).toBe(
      1,
    );
  });

  it('rechaza una carrera de registros con el mismo correo', async () => {
    const correo = 'concurrente@example.test';
    const [first, second] = await Promise.all(
      [1, 2].map(() =>
        request(server()).post(path).send(registration({ correo })),
      ),
    );

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    problem(conflict, 409);
    expect(await context!.database.dataSource.getRepository(User).count()).toBe(
      1,
    );
  });

  it.each([
    { nombre: '' },
    { nombre: ' ' },
    { apellido: '' },
    { apellido: 'A'.repeat(101) },
    { correo: 'no-es-correo' },
    { correo: 'C'.repeat(151) + '@example.test' },
    { telefono: '1'.repeat(21) },
    { clave: 'corta' },
    { clave: 'a'.repeat(73) },
    { clave: 'á'.repeat(37) },
    { rol: 'ADMIN' },
    { authId: '00000000-0000-4000-8000-000000000001' },
    { extra: true },
  ])(
    'rechaza datos inválidos o protegidos %j sin crear una fila',
    async (body) => {
      const response = await request(server())
        .post(path)
        .send(registration(body))
        .expect(400);

      problem(response, 400);
      expect(
        await context!.database.dataSource.getRepository(User).count(),
      ).toBe(0);
    },
  );
});
