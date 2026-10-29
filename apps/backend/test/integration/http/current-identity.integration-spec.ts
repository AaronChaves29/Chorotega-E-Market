import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AdminModule } from '../../../src/admin/admin.module';
import { configureAdminViews } from '../../../src/admin/admin-views';
import { User } from '../../../src/modules/users/entities/user.entity';
import { UsersRepository } from '../../../src/modules/users/repositories/users.repository';
import { UsersHttpModule } from '../../../src/modules/users/users-http.module';
import { OrdersHttpModule } from '../../../src/modules/orders/orders-http.module';
import { DeliveriesModule } from '../../../src/modules/deliveries/deliveries.module';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

function csrf(html: string): string {
  const value = /name=['"]_csrf['"]\s+value=['"]([a-f0-9]+)['"]/.exec(
    html,
  )?.[1];
  if (!value) throw new Error('Formulario sin CSRF');
  return value;
}

describe('Cuentas activas y permisos vigentes: REST y MVC con PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  let user: User;
  let hash: string;
  const password = randomUUID();
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    hash = await bcrypt.hash(password, 10);
    context = await createHttpTestApp(
      [UsersHttpModule, AdminModule, OrdersHttpModule, DeliveriesModule],
      configureAdminViews,
    );
    await context.app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    user = await users().save({
      authId: randomUUID(),
      nombre: 'Administrador',
      apellido: 'Prueba',
      correo: 'admin@example.test',
      rol: 'ADMIN',
      estado: 'ACTIVO',
      claveHash: hash,
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await context?.database.dataSource.query(
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
  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }
  function users() {
    return context!.database.dataSource.getRepository(User);
  }
  function identities() {
    return context!.app.get(UsersRepository);
  }
  async function login() {
    const result = await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: user.correo, clave: password })
      .expect(201);
    expect(Object.keys(result.body as object).sort()).toEqual(
      ['token', 'tipo', 'expiraEnSegundos'].sort(),
    );
    const { tipo, expiraEnSegundos } = result.body as {
      tipo: string;
      expiraEnSegundos: number;
    };
    expect({ tipo, expiraEnSegundos }).toEqual({
      tipo: 'Bearer',
      expiraEnSegundos: 3600,
    });
    return (result.body as { token: string }).token;
  }
  async function mvcLogin() {
    const agent = request.agent(server());
    const form = await agent.get('/admin/login').expect(200);
    const result = await agent
      .post('/admin/login')
      .type('form')
      .send({ _csrf: csrf(form.text), correo: user.correo, clave: password });
    return { agent, result };
  }

  it('conserva el contrato de login y permite a ADMIN activo consultar usuarios', async () => {
    const token = await login();
    const claims = await context!.app
      .get(JwtService)
      .verifyAsync<{ exp: number; iat: number; idUsuario: number }>(token);
    expect(claims.exp - claims.iat).toBe(3600);
    expect(claims.idUsuario).toBe(user.idUsuario);
    await request(server())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it.each(['inactiva', 'contraseña incorrecta', 'inexistente'])(
    'REST devuelve el mismo 401 genérico para cuenta %s',
    async (scenario) => {
      if (scenario === 'inactiva')
        await users().update(user.idUsuario, { estado: 'INACTIVO' });
      const result = await request(server())
        .post('/api/v1/auth/login')
        .send({
          correo:
            scenario === 'inexistente' ? 'missing@example.test' : user.correo,
          clave: scenario === 'contraseña incorrecta' ? 'incorrecta' : password,
        })
        .expect(401)
        .expect('Content-Type', /application\/problem\+json/);
      expect(result.body).toEqual({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Credenciales inválidas.',
        instance: '/api/v1/auth/login',
      });
    },
  );

  it.each(['ausente', 'inválido', 'vencido'])(
    'rechaza JWT %s antes de consultar usuarios',
    async (kind) => {
      const lookup = jest.spyOn(identities(), 'findAuthenticationById');
      const req = request(server()).get('/api/v1/users');
      if (kind !== 'ausente') {
        const token =
          kind === 'inválido'
            ? 'invalid'
            : await context!.app.get(JwtService).signAsync(
                {
                  idUsuario: user.idUsuario,
                  sub: user.correo,
                  rol: user.rol,
                },
                { expiresIn: -1 },
              );
        req.set('Authorization', `Bearer ${token}`);
      }
      await req.expect(401);
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it.each(['desactivada', 'eliminada'])(
    'rechaza el JWT emitido antes de que la cuenta sea %s',
    async (kind) => {
      const token = await login();
      await request(server())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (kind === 'eliminada') await users().delete(user.idUsuario);
      else await users().update(user.idUsuario, { estado: 'INACTIVO' });
      await request(server())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
        .expect('Content-Type', /application\/problem\+json/);
    },
  );

  it.each([
    ['ADMIN', '/api/v1/users'],
    ['CLIENTE', '/api/v1/orders'],
    ['EMPRENDEDOR', '/api/v1/orders'],
    ['REPARTIDOR', '/api/v1/deliveries'],
  ])(
    'el JWT anterior usa el rol vigente %s y conserva su acceso permitido',
    async (rol, path) => {
      const token = await login();
      await users().update(user.idUsuario, { rol });
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (rol !== 'ADMIN')
        await request(server())
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
    },
  );

  it('toma también una promoción desde el rol persistido, sin exigir otro JWT', async () => {
    await users().update(user.idUsuario, { rol: 'CLIENTE' });
    const token = await login();
    await request(server())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await users().update(user.idUsuario, { rol: 'ADMIN' });
    await request(server())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('consulta una vez por solicitud la PK y solo los campos de identidad necesarios', async () => {
    const token = await login();
    const lookup = jest.spyOn(identities(), 'findAuthenticationById');
    const log = jest.spyOn(context!.database.dataSource.logger, 'logQuery');
    await request(server())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(user.idUsuario);
    const sql = log.mock.calls
      .map(([query]) => query)
      .filter((query) => query.includes('FROM "usuario"'));
    expect(sql).toHaveLength(1);
    expect(sql[0]).not.toContain('clave_hash');
    expect(sql[0]).not.toContain('auth_id');
  });

  it.each(['inactiva', 'contraseña incorrecta', 'inexistente'])(
    'MVC muestra un error genérico para cuenta %s y no crea sesión autenticada',
    async (scenario) => {
      if (scenario === 'inactiva')
        await users().update(user.idUsuario, { estado: 'INACTIVO' });
      const agent = request.agent(server());
      const form = await agent.get('/admin/login').expect(200);
      const result = await agent
        .post('/admin/login')
        .type('form')
        .send({
          _csrf: csrf(form.text),
          correo:
            scenario === 'inexistente' ? 'missing@example.test' : user.correo,
          clave: scenario === 'contraseña incorrecta' ? 'incorrecta' : password,
        })
        .expect(401);
      expect(result.text).toContain('Credenciales inválidas.');
      expect(result.text.includes(password)).toBe(false);
      expect(result.text.includes(hash)).toBe(false);
      expect(result.headers['set-cookie'] === undefined).toBe(true);
      await agent
        .get('/admin/products')
        .expect(303)
        .expect('Location', '/admin/login');
    },
  );

  it('MVC conserva ADMIN activo, PRG y una sola consulta al autenticar credenciales', async () => {
    const credentials = jest.spyOn(identities(), 'findByEmail');
    const lookup = jest.spyOn(identities(), 'findAuthenticationById');
    const { agent, result } = await mvcLogin();
    expect(result.status).toBe(303);
    expect(result.headers.location).toBe('/admin/products');
    expect(credentials).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
    await agent.get('/admin/products').expect(200);
    expect(lookup).toHaveBeenCalledTimes(1);
    lookup.mockClear();
    await agent
      .get('/admin/login')
      .expect(303)
      .expect('Location', '/admin/products');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it.each(['desactivada', 'eliminada'])(
    'MVC deja de aceptar la sesión de una cuenta %s',
    async (kind) => {
      const { agent, result } = await mvcLogin();
      expect(result.status).toBe(303);
      const form = await agent.get('/admin/products/new').expect(200);
      if (kind === 'eliminada') await users().delete(user.idUsuario);
      else await users().update(user.idUsuario, { estado: 'INACTIVO' });
      await agent
        .get('/admin/products')
        .expect(303)
        .expect('Location', '/admin/login');
      await agent
        .post('/admin/products')
        .type('form')
        .send({ _csrf: csrf(form.text) })
        .expect(303)
        .expect('Location', '/admin/login');
      expect(
        await context!.database.dataSource.getRepository(Product).count(),
      ).toBe(0);
      const page = await agent.get('/admin/login').expect(200);
      expect(/name=['"]correo['"]/.test(page.text)).toBe(true);
    },
  );

  it.each(['CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'MVC rechaza la sesión y escrituras después de revocar ADMIN a %s',
    async (rol) => {
      const { agent, result } = await mvcLogin();
      expect(result.status).toBe(303);
      const form = await agent.get('/admin/products/new').expect(200);
      await users().update(user.idUsuario, { rol });
      await agent.get('/admin/products').expect(403);
      await agent.get('/admin/stores').expect(403);
      await agent
        .post('/admin/products')
        .type('form')
        .send({ _csrf: csrf(form.text) })
        .expect(403);
      expect(
        await context!.database.dataSource.getRepository(Product).count(),
      ).toBe(0);
      await agent.get('/admin/login').expect(200);
    },
  );

  it('un error de persistencia devuelve 500 seguro en REST y MVC, no un falso 401', async () => {
    const token = await login();
    const { agent, result } = await mvcLogin();
    expect(result.status).toBe(303);
    jest
      .spyOn(identities(), 'findAuthenticationById')
      .mockRejectedValue(new Error('private-database-error-marker'));
    const rest = await request(server())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(500);
    expect(rest.body as object).toMatchObject({
      status: 500,
      detail: 'No fue posible completar la solicitud.',
    });
    expect(JSON.stringify(rest.body)).not.toContain(
      'private-database-error-marker',
    );
    const mvc = await agent.get('/admin/products').expect(500);
    expect(mvc.text).not.toContain('private-database-error-marker');
  });
});
