import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AuthModule } from '../../../src/auth/auth.module';
import { AuthService } from '../../../src/auth/auth.service';
import { AdminModule } from '../../../src/admin/admin.module';
import { configureAdminViews } from '../../../src/admin/admin-views';
import { configureOpenApi } from '../../../src/common/http/configure-openapi';
import {
  AUTH_RATE_LIMIT_CLOCK,
  AUTH_RATE_LIMIT_OPTIONS,
  type AuthRateLimitOptions,
} from '../../../src/auth/rate-limit/auth-rate-limit.config';
import { User } from '../../../src/modules/users/entities/user.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

function csrf(html: string): string {
  const value = /name=['"]_csrf['"]\s+value=['"]([a-f0-9]+)['"]/.exec(
    html,
  )?.[1];
  if (!value) throw new Error('Formulario sin CSRF');
  return value;
}

describe('Límites HTTP de autenticación: ventanas deterministas y PostgreSQL temporal', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const password = randomUUID();
  let hash: string;
  let now = 0;
  const policy: AuthRateLimitOptions = {
    windowMs: 2500,
    limits: { login: 2, adminLogin: 2, register: 2 },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    hash = await bcrypt.hash(password, 4);
    context = await createHttpTestApp(
      [AuthModule, AdminModule],
      (app) => {
        configureAdminViews(app);
        configureOpenApi(app);
      },
      (builder) =>
        builder
          .overrideProvider(AUTH_RATE_LIMIT_OPTIONS)
          .useValue(policy)
          .overrideProvider(AUTH_RATE_LIMIT_CLOCK)
          .useValue(() => now),
    );
    await context.app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    now += 10_000;
    await users().save({
      authId: randomUUID(),
      nombre: 'Admin',
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
  const credentials = () => ({ correo: 'admin@example.test', clave: password });
  const invalidCredentials = () => ({
    correo: 'admin@example.test',
    clave: 'incorrecta',
  });
  const registration = () => ({
    nombre: 'Cliente',
    apellido: 'Prueba',
    correo: `${randomUUID()}@example.test`,
    clave: password,
  });
  function limited(result: request.Response, path: string) {
    expect(result.status).toBe(429);
    expect(result.headers['retry-after']).toBe('3');
    expect(result.headers['content-type']).toMatch(
      /application\/problem\+json/,
    );
    expect(result.body).toEqual({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Demasiadas solicitudes. Inténtelo más tarde.',
      instance: path,
    });
  }

  it('login REST cuenta éxitos y fallos y rechaza antes de volver a autenticar', async () => {
    const login = jest.spyOn(context!.app.get(AuthService), 'login');
    await request(server())
      .post('/api/v1/auth/login')
      .send(credentials())
      .expect(201);
    await request(server())
      .post('/api/v1/auth/login')
      .send(invalidCredentials())
      .expect(401);
    limited(
      await request(server()).post('/api/v1/auth/login').send(credentials()),
      '/api/v1/auth/login',
    );
    expect(login).toHaveBeenCalledTimes(2);
  });

  it('Retry-After disminuye y el login se recupera sin esperas reales ni prolongar la ventana', async () => {
    for (let i = 0; i < 2; i++)
      await request(server())
        .post('/api/v1/auth/login')
        .send(invalidCredentials())
        .expect(401);
    limited(
      await request(server()).post('/api/v1/auth/login').send(credentials()),
      '/api/v1/auth/login',
    );
    now += 2001;
    await request(server())
      .post('/api/v1/auth/login')
      .send(credentials())
      .expect(429)
      .expect('Retry-After', '1');
    now += 499;
    const result = await request(server())
      .post('/api/v1/auth/login')
      .send(credentials())
      .expect(201);
    expect(result.headers['retry-after'] === undefined).toBe(true);
    expect(Object.keys(result.body as object).sort()).toEqual(
      ['token', 'tipo', 'expiraEnSegundos'].sort(),
    );
  });

  it('cuenta DTO inválido y no revela existencia, estado ni rol al superar el presupuesto', async () => {
    const inactive = await users().save({
      authId: randomUUID(),
      nombre: 'Inactivo',
      apellido: 'Prueba',
      correo: 'inactive@example.test',
      rol: 'CLIENTE',
      estado: 'INACTIVO',
      claveHash: hash,
    });
    const missing = await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: 'missing@example.test', clave: password })
      .expect(401);
    const disabled = await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: inactive.correo, clave: password })
      .expect(401);
    expect(missing.body).toEqual(disabled.body);
    for (const correo of [
      'missing@example.test',
      inactive.correo,
      'admin@example.test',
    ])
      limited(
        await request(server())
          .post('/api/v1/auth/login')
          .send({ correo, clave: password }),
        '/api/v1/auth/login',
      );
    now += 2500;
    await request(server()).post('/api/v1/auth/login').send({}).expect(400);
    await request(server()).post('/api/v1/auth/login').send({}).expect(400);
    await request(server())
      .post('/api/v1/auth/login')
      .send(credentials())
      .expect(429);
  });

  it('registro devuelve 429 sin insertar y recupera el contrato público al finalizar la ventana', async () => {
    const register = jest.spyOn(context!.app.get(AuthService), 'register');
    const before = await users().count();
    for (let i = 0; i < 2; i++) {
      const result = await request(server())
        .post('/api/v1/auth/register')
        .send(registration())
        .expect(201);
      expect((result.body as { rol: string }).rol).toBe('CLIENTE');
    }
    limited(
      await request(server())
        .post('/api/v1/auth/register')
        .send(registration()),
      '/api/v1/auth/register',
    );
    expect(register).toHaveBeenCalledTimes(2);
    expect(await users().count()).toBe(before + 2);
    now += 2500;
    await request(server())
      .post('/api/v1/auth/register')
      .send(registration())
      .expect(201);
    expect(await users().count()).toBe(before + 3);
  });

  it('registro inválido consume presupuesto sin crear cuentas', async () => {
    const before = await users().count();
    for (let i = 0; i < 2; i++)
      await request(server())
        .post('/api/v1/auth/register')
        .send({})
        .expect(400);
    limited(
      await request(server())
        .post('/api/v1/auth/register')
        .send(registration()),
      '/api/v1/auth/register',
    );
    expect(await users().count()).toBe(before);
  });

  it('MVC conserva CSRF, sesiones y PRG, limita el login y se recupera', async () => {
    const agent = request.agent(server());
    const form = await agent.get('/admin/login').expect(200);
    await agent
      .post('/admin/login')
      .type('form')
      .send({ ...invalidCredentials(), _csrf: csrf(form.text) })
      .expect(401);
    const success = await agent
      .post('/admin/login')
      .type('form')
      .send({ ...credentials(), _csrf: csrf(form.text) })
      .expect(303)
      .expect('Location', '/admin/products');
    const cookies = success.headers['set-cookie'] as unknown as string[];
    expect(
      cookies.some(
        (cookie) =>
          cookie.includes('HttpOnly') &&
          cookie.includes('SameSite=Strict') &&
          cookie.includes('Path=/admin'),
      ),
    ).toBe(true);
    const page = await agent.get('/admin/products/new').expect(200);
    const blocked = await agent
      .post('/admin/login')
      .type('form')
      .send({ ...credentials(), _csrf: csrf(page.text) })
      .expect(429)
      .expect('Retry-After', '3');
    expect(blocked.headers['content-type']).toMatch(/text\/html/);
    expect(blocked.text.includes('Demasiadas solicitudes.')).toBe(true);
    expect(blocked.text.includes(password)).toBe(false);
    expect(blocked.headers['set-cookie'] === undefined).toBe(true);
    await agent.get('/admin/products').expect(200);
    await agent
      .get('/admin/login')
      .expect(303)
      .expect('Location', '/admin/products');
    now += 2500;
    await agent
      .post('/admin/login')
      .type('form')
      .send({ ...credentials(), _csrf: csrf(page.text) })
      .expect(303);
  });

  it('CSRF sigue siendo obligatorio y cambiar de sesión no reinicia el presupuesto MVC', async () => {
    const agent = request.agent(server());
    await agent.get('/admin/login').expect(200);
    await agent
      .post('/admin/login')
      .type('form')
      .send(credentials())
      .expect(403);
    const other = request.agent(server());
    const form = await other.get('/admin/login').expect(200);
    await other
      .post('/admin/login')
      .type('form')
      .send({ ...credentials(), _csrf: '0'.repeat(64) })
      .expect(403);
    await other
      .post('/admin/login')
      .type('form')
      .send({ ...credentials(), _csrf: csrf(form.text) })
      .expect(429);
    now += 2500;
    await other
      .post('/admin/login')
      .type('form')
      .send({ ...credentials(), _csrf: csrf(form.text) })
      .expect(303);
  });

  it('los presupuestos REST, MVC y registro son independientes', async () => {
    for (let i = 0; i < 2; i++)
      await request(server())
        .post('/api/v1/auth/login')
        .send(invalidCredentials())
        .expect(401);
    await request(server())
      .post('/api/v1/auth/login')
      .send(credentials())
      .expect(429);
    await request(server())
      .post('/api/v1/auth/register')
      .send(registration())
      .expect(201);
    const agent = request.agent(server());
    const form = await agent.get('/admin/login').expect(200);
    await agent
      .post('/admin/login')
      .type('form')
      .send({ ...credentials(), _csrf: csrf(form.text) })
      .expect(303);
  });

  it.each([
    ['/api/v1/auth/login', 'json', 401],
    ['/admin/login', 'form', 403],
    ['/api/v1/auth/register', 'json', 400],
  ] as const)(
    'cambiar encabezados IP no evade el límite de %s',
    async (path, type, status) => {
      const instance = context!.app.getHttpAdapter().getInstance() as {
        get(name: string): unknown;
      };
      expect(instance.get('trust proxy')).toBe(false);
      for (let i = 0; i < 3; i++) {
        const req = request(server())
          .post(path)
          .set('X-Forwarded-For', `203.0.113.${i + 1}, 127.0.0.1`)
          .set('X-Real-IP', `198.51.100.${i + 1}`)
          .set('CF-Connecting-IP', `192.0.2.${i + 1}`)
          .set('True-Client-IP', `192.0.2.${i + 4}`)
          .set('Forwarded', `for=203.0.113.${i + 1}`);
        if (type === 'form') req.type('form');
        await req
          .send({ correo: `${i}@example.test`, clave: password })
          .expect(i < 2 ? status : 429);
      }
    },
  );

  it('solicitudes simultáneas no exceden la reserva anterior a bcrypt', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(server()).post('/api/v1/auth/login').send(invalidCredentials()),
      ),
    );
    expect(results.filter((result) => result.status === 401)).toHaveLength(2);
    expect(results.filter((result) => result.status === 429)).toHaveLength(4);
  });

  it('OpenAPI documenta 429, Problem Details y Retry-After de login y registro', async () => {
    const result = await request(server()).get('/docs-json').expect(200);
    const document = result.body as {
      paths: Record<
        string,
        {
          post: {
            responses: Record<
              string,
              {
                headers: Record<string, { schema: { type: string } }>;
                content: Record<string, unknown>;
              }
            >;
          };
        }
      >;
    };
    for (const path of ['/api/v1/auth/login', '/api/v1/auth/register']) {
      const response = document.paths[path].post.responses['429'];
      expect(response.headers['Retry-After'].schema.type).toBe('integer');
      expect(response.content).toHaveProperty('application/problem+json');
    }
  });
});
