import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NotFoundException, type INestApplication } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { CurrentIdentityService } from '../auth/current-identity.service';
import { AuthRateLimitModule } from '../auth/rate-limit/auth-rate-limit.module';
import { AUTH_RATE_LIMIT_OPTIONS } from '../auth/rate-limit/auth-rate-limit.config';
import { regressionAuthRateLimits } from '../../test/support/auth-rate-limit-test-options';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { ProductsService } from '../modules/products/products.service';
import { StoresService } from '../modules/stores/services/stores.service';
import { configureHttp } from '../common/http/configure-http';
import { configureOpenApi } from '../common/http/configure-openapi';
import { AdminDeliveriesController } from './admin-deliveries.controller';
import { DeliveriesService } from '../modules/deliveries/services/deliveries.service';
import { CouriersService } from '../modules/couriers/services/couriers.service';
import { InvalidOrderStateException } from '../modules/deliveries/exceptions/invalid-order-state.exception';
import { AdminAuthController } from './admin-auth.controller';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminSessionService, ADMIN_COOKIE } from './admin-session.service';
import { AdminCsrfGuard, AdminSessionGuard } from './admin.guards';
import { configureAdminViews } from './admin-views';

function csrf(html: string): string {
  const token = /name=['"]_csrf['"]\s+value=['"]([a-f0-9]+)['"]/.exec(
    html,
  )?.[1];
  if (!token) throw new Error('No se renderizó CSRF');
  return token;
}

describe('MVC: HTTP real, servicios de catálogo simulados y guards activos', () => {
  let app: INestApplication<App>;
  const password = randomUUID();
  const secret = randomBytes(32).toString('hex');
  const users = { findByEmail: jest.fn(), findAuthenticationById: jest.fn() };
  const products = { search: jest.fn(), create: jest.fn() };
  const stores = { search: jest.fn(), create: jest.fn() };
  const deliveries = {
    searchVisible: jest.fn(),
    findVisibleById: jest.fn(),
    assignDelivery: jest.fn(),
    cancelDelivery: jest.fn(),
  };
  const couriers = { findAll: jest.fn() };
  const delivery = {
    idEntrega: 9,
    idPedido: 4,
    idRepartidor: 2,
    estado: 'ASIGNADA',
    fechaAsignacion: new Date('2026-11-17T12:00:00Z'),
    fechaEntrega: null,
  };
  let hash: string;
  beforeAll(async () => {
    hash = await bcrypt.hash(password, 4);
    const module = await Test.createTestingModule({
      imports: [
        AuthRateLimitModule,
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          skipProcessEnv: true,
          load: [() => ({ JWT_SECRET: secret, NODE_ENV: 'test' })],
        }),
        JwtModule.register({ secret, signOptions: { expiresIn: 3600 } }),
      ],
      controllers: [
        AdminAuthController,
        AdminCatalogController,
        AdminDeliveriesController,
      ],
      providers: [
        AuthService,
        CurrentIdentityService,
        RolesGuard,
        AdminSessionGuard,
        AdminCsrfGuard,
        AdminSessionService,
        { provide: UsersRepository, useValue: users },
        { provide: ProductsService, useValue: products },
        { provide: StoresService, useValue: stores },
        { provide: DeliveriesService, useValue: deliveries },
        { provide: CouriersService, useValue: couriers },
      ],
    })
      .overrideProvider(AUTH_RATE_LIMIT_OPTIONS)
      .useValue(regressionAuthRateLimits())
      .compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureAdminViews(app);
    configureHttp(app);
    configureOpenApi(app);
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    users.findByEmail.mockResolvedValue({
      idUsuario: 7,
      correo: 'admin@example.test',
      rol: 'ADMIN',
      estado: 'ACTIVO',
      claveHash: hash,
    });
    users.findAuthenticationById.mockResolvedValue({
      idUsuario: 7,
      correo: 'admin@example.test',
      rol: 'ADMIN',
      estado: 'ACTIVO',
    });
    const page = {
      content: [],
      page: 0,
      size: 20,
      totalElements: 0,
      totalPages: 0,
    };
    products.search.mockResolvedValue(page);
    stores.search.mockResolvedValue(page);
    products.create.mockResolvedValue({ idProducto: 1 });
    stores.create.mockResolvedValue({ idTienda: 1 });
    deliveries.searchVisible.mockResolvedValue(page);
    deliveries.findVisibleById.mockResolvedValue(delivery);
    deliveries.assignDelivery.mockResolvedValue(delivery);
    deliveries.cancelDelivery.mockResolvedValue({
      ...delivery,
      estado: 'CANCELADA',
    });
    couriers.findAll.mockResolvedValue([
      {
        idRepartidor: 2,
        medioTransporte: '<script>private</script>',
        disponibilidad: 'DISPONIBLE',
      },
    ]);
  });
  afterAll(async () => {
    await app?.close();
  });

  async function login(role = 'ADMIN') {
    users.findByEmail.mockResolvedValue({
      idUsuario: 7,
      correo: 'admin@example.test',
      rol: role,
      estado: 'ACTIVO',
      claveHash: hash,
    });
    const agent = request.agent(app.getHttpServer());
    const form = await agent.get('/admin/login').expect(200);
    const result = await agent
      .post('/admin/login')
      .type('form')
      .send({
        _csrf: csrf(form.text),
        correo: 'admin@example.test',
        clave: password,
      });
    return { agent, result, anonymousCsrf: csrf(form.text) };
  }
  async function loggedIn() {
    const { agent, result } = await login();
    expect(result.status).toBe(303);
    const form = await agent.get('/admin/products/new').expect(200);
    return { agent, token: csrf(form.text) };
  }
  const product = {
    idTienda: '1',
    idCategoria: '1',
    nombre: 'Nuevo',
    precio: '12.50',
    cantidadDisponible: '2',
  };
  const store = { idEmprendedor: '3', nombre: 'Nueva', direccion: 'Nicoya' };

  it.each([
    '/admin',
    '/admin/products',
    '/admin/stores',
    '/admin/products/new',
    '/admin/stores/new',
    '/admin/deliveries',
    '/admin/deliveries/new',
    '/admin/deliveries/9',
  ])('sin sesión redirige %s al acceso sin devolver datos', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .expect(303)
      .expect('Location', '/admin/login');
    expect(products.search).not.toHaveBeenCalled();
    expect(stores.search).not.toHaveBeenCalled();
  });
  it.each(['CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'rechaza login administrativo de %s',
    async (role) => {
      const output = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
      try {
        const { result } = await login(role);
        expect(result.status).toBe(403);
        expect(result.text).not.toContain(password);
        expect(result.headers['set-cookie']).toBeUndefined();
        const records = output.mock.calls.map(
          ([chunk]) => JSON.parse(String(chunk)) as { event: string },
        );
        expect(records.map((record) => record.event)).toEqual([
          'access_denied',
        ]);
      } finally {
        output.mockRestore();
      }
    },
  );
  it('GET login conserva una sesión ADMIN válida y su CSRF', async () => {
    const { agent, token } = await loggedIn();
    const result = await agent
      .get('/admin/login')
      .expect(303)
      .expect('Location', '/admin/products');
    expect(result.headers['set-cookie']).toBeUndefined();
    await agent
      .post('/admin/products')
      .type('form')
      .send({ ...product, _csrf: token })
      .expect(303);
    expect(products.create).toHaveBeenCalledTimes(1);
  });
  it('un fallo síncrono del log no cambia el rechazo MVC de permisos', async () => {
    const output = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => {
        throw new Error('private-log-sink');
      });
    try {
      const { result } = await login('CLIENTE');
      expect(result.status).toBe(403);
      expect(result.text).not.toContain('private-log-sink');
      expect(output).toHaveBeenCalledTimes(1);
    } finally {
      output.mockRestore();
    }
  });
  it.each(['alterada', 'vencida', 'otro-rol'])(
    'GET login muestra formulario nuevo para sesión %s',
    async (kind) => {
      if (kind === 'otro-rol')
        users.findAuthenticationById.mockResolvedValue({
          idUsuario: 7,
          correo: 'user@example.test',
          rol: 'CLIENTE',
          estado: 'ACTIVO',
        });
      let value = 'invalid';
      if (kind !== 'alterada') {
        const token = await app.get(JwtService).signAsync(
          {
            sub: 'user@example.test',
            idUsuario: 7,
            rol: kind === 'otro-rol' ? 'CLIENTE' : 'ADMIN',
          },
          { expiresIn: kind === 'vencida' ? -1 : 3600 },
        );
        app.get(AdminSessionService).issue(
          {
            cookie: (_name: string, cookie: string) => {
              value = cookie;
            },
          } as unknown as import('express').Response,
          token,
        );
      }
      const result = await request(app.getHttpServer())
        .get('/admin/login')
        .set('Cookie', `${ADMIN_COOKIE}=${value}`)
        .expect(200);
      expect(result.headers['set-cookie']).toBeDefined();
      expect(csrf(result.text)).toHaveLength(64);
      expect(result.headers['referrer-policy']).toBe('same-origin');
      expect(result.text).not.toContain('type="hidden" name="token"');
    },
  );
  it('valida login por campo, conserva correo y nunca devuelve la contraseña', async () => {
    const agent = request.agent(app.getHttpServer());
    const form = await agent.get('/admin/login');
    const result = await agent
      .post('/admin/login')
      .type('form')
      .send({ _csrf: csrf(form.text), correo: 'invalido', clave: '' })
      .expect(400);
    expect(result.text).toContain('invalido');
    expect(result.text).toContain('formato válido');
    expect(users.findByEmail).not.toHaveBeenCalled();
  });
  it('credenciales inválidas devuelven HTML seguro sin conservar la contraseña', async () => {
    const output = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      users.findByEmail.mockResolvedValue(null);
      const agent = request.agent(app.getHttpServer());
      const form = await agent.get('/admin/login');
      const result = await agent
        .post('/admin/login')
        .type('form')
        .send({
          _csrf: csrf(form.text),
          correo: 'admin@example.test',
          clave: password,
        })
        .expect(401);
      expect(result.text).toContain('Credenciales inválidas.');
      expect(result.text).not.toContain(password);
      const records = output.mock.calls.map(
        ([chunk]) => JSON.parse(String(chunk)) as { event: string },
      );
      expect(records.map((record) => record.event)).toEqual(['login_failed']);
      expect(
        output.mock.calls.map(([chunk]) => String(chunk)).join(''),
      ).not.toContain(password);
    } finally {
      output.mockRestore();
    }
  });
  it.each(['products', 'stores'])(
    'renderiza listado %s y conserva paginación en los enlaces',
    async (resource) => {
      const { agent } = await loggedIn();
      const service = resource === 'products' ? products : stores;
      service.search.mockResolvedValue({
        content: [
          { nombre: '<script>alert(1)</script>', idProducto: 4, idTienda: 5 },
        ],
        page: 1,
        size: 1,
        totalElements: 3,
        totalPages: 3,
      });
      const result = await agent
        .get(`/admin/${resource}?page=1&size=1`)
        .expect(200)
        .expect('Content-Type', /text\/html/);
      expect(result.text).toContain('&lt;script&gt;');
      expect(result.text).not.toContain('<script>');
      expect(result.text).toContain('page&#x3D;0');
      expect(result.text).toContain('page&#x3D;2');
      expect(service.search).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, size: 1 }),
      );
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['content-security-policy']).toContain(
        "form-action 'self'",
      );
      expect(result.text).not.toMatch(/eyJ[a-zA-Z0-9_-]+\./);
    },
  );
  it.each(['products', 'stores'])(
    'lista vacía de %s muestra un mensaje',
    async (resource) => {
      const { agent } = await loggedIn();
      const result = await agent.get(`/admin/${resource}`).expect(200);
      expect(result.text).toContain('en esta página.');
    },
  );
  it.each(['products', 'stores'])(
    'crea %s, convierte números y aplica PRG sin repetir escritura en GET',
    async (resource) => {
      const { agent, token } = await loggedIn();
      await agent
        .post(`/admin/${resource}`)
        .type('form')
        .send({ ...(resource === 'products' ? product : store), _csrf: token })
        .expect(303)
        .expect('Location', `/admin/${resource}`);
      const service = resource === 'products' ? products : stores;
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining(
          resource === 'products'
            ? { precio: 12.5, idTienda: 1 }
            : { idEmprendedor: 3 },
        ),
        expect.objectContaining({ idUsuario: 7, rol: 'ADMIN' }),
      );
      await agent.get(`/admin/${resource}`).expect(200);
      await agent.get(`/admin/${resource}`).expect(200);
      expect(service.create).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['products', 'stores'])(
    'valida %s, conserva valores escapados y no llama a guardar',
    async (resource) => {
      const { agent, token } = await loggedIn();
      const input =
        resource === 'products'
          ? { ...product, precio: '-1', nombre: '<img src=x onerror=alert(1)>' }
          : {
              ...store,
              idEmprendedor: '-1',
              nombre: '<img src=x onerror=alert(1)>',
            };
      const result = await agent
        .post(`/admin/${resource}`)
        .type('form')
        .send({ ...input, _csrf: token })
        .expect(400);
      expect(result.text).toMatch(/role=['"]alert['"]/);
      expect(result.text).toContain('&lt;img');
      expect(result.text).not.toContain('<img');
      expect(
        (resource === 'products' ? products : stores).create,
      ).not.toHaveBeenCalled();
    },
  );
  it.each(['products', 'stores'])(
    'rechaza campos extra de %s sin guardar',
    async (resource) => {
      const { agent, token } = await loggedIn();
      const result = await agent
        .post(`/admin/${resource}`)
        .type('form')
        .send({
          ...(resource === 'products' ? product : store),
          _csrf: token,
          rol: 'ADMIN',
        })
        .expect(400);
      expect(result.text).toContain('campos no permitidos');
      expect(
        (resource === 'products' ? products : stores).create,
      ).not.toHaveBeenCalled();
    },
  );
  it.each(['products', 'stores'])(
    'muestra validación de relaciones de %s sin duplicar reglas',
    async (resource) => {
      const { agent, token } = await loggedIn();
      const service = resource === 'products' ? products : stores;
      service.create.mockRejectedValueOnce(
        new NotFoundException(
          resource === 'products'
            ? 'Tienda no encontrada.'
            : 'Usuario no encontrado.',
        ),
      );
      const result = await agent
        .post(`/admin/${resource}`)
        .type('form')
        .send({ ...(resource === 'products' ? product : store), _csrf: token })
        .expect(404);
      expect(result.text).toContain(
        resource === 'products' ? 'error-idTienda' : 'error-idEmprendedor',
      );
    },
  );
  it('un fallo inesperado no expone SQL ni secretos', async () => {
    const { agent, token } = await loggedIn();
    products.create.mockRejectedValueOnce(
      new Error('SELECT secret-private-marker'),
    );
    const result = await agent
      .post('/admin/products')
      .type('form')
      .send({ ...product, _csrf: token })
      .expect(500);
    expect(result.text).not.toMatch(/SELECT|secret-private-marker|stack/);
  });
  it.each([
    '/admin/login',
    '/admin/products',
    '/admin/stores',
    '/admin/logout',
  ])('rechaza POST sin CSRF en %s', async (path) => {
    const { agent } = await loggedIn();
    await agent.post(path).type('form').send(product).expect(403);
    expect(products.create).not.toHaveBeenCalled();
    expect(stores.create).not.toHaveBeenCalled();
  });
  it('CSRF de otra sesión y del login anterior no autorizan escrituras', async () => {
    const first = await loggedIn();
    const second = await loggedIn();
    await first.agent
      .post('/admin/products')
      .type('form')
      .send({ ...product, _csrf: second.token })
      .expect(403);
    const loginResult = await login();
    await loginResult.agent
      .post('/admin/products')
      .type('form')
      .send({ ...product, _csrf: loginResult.anonymousCsrf })
      .expect(403);
    expect(products.create).not.toHaveBeenCalled();
  });
  it('logout requiere CSRF y elimina la cookie administrativa', async () => {
    const { agent, token } = await loggedIn();
    const result = await agent
      .post('/admin/logout')
      .type('form')
      .send({ _csrf: token })
      .expect(303);
    expect(result.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining(`${ADMIN_COOKIE}=`)]),
    );
    await agent
      .get('/admin/stores')
      .expect(303)
      .expect('Location', '/admin/login');
  });
  it('cookie alterada o expirada no permite leer datos', async () => {
    await request(app.getHttpServer())
      .get('/admin/products')
      .set('Cookie', `${ADMIN_COOKIE}=alterada`)
      .expect(303);
    const jwt = app.get(JwtService);
    const sessions = app.get(AdminSessionService);
    let value = '';
    const response = {
      cookie: (_name: string, cookie: string) => {
        value = cookie;
      },
    } as unknown as import('express').Response;
    sessions.issue(
      response,
      await jwt.signAsync(
        { sub: 'admin@example.test', idUsuario: 7, rol: 'ADMIN' },
        { expiresIn: -1 },
      ),
    );
    await request(app.getHttpServer())
      .get('/admin/products')
      .set('Cookie', `${ADMIN_COOKIE}=${value}`)
      .expect(303);
    expect(products.search).not.toHaveBeenCalled();
  });
  it.each(['CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'RolesGuard rechaza sesión JWT válida de %s',
    async (rol) => {
      users.findAuthenticationById.mockResolvedValue({
        idUsuario: 7,
        correo: 'user@example.test',
        rol,
        estado: 'ACTIVO',
      });
      const token = await app
        .get(JwtService)
        .signAsync({ sub: 'user@example.test', idUsuario: 7, rol });
      let value = '';
      app.get(AdminSessionService).issue(
        {
          cookie: (_name: string, cookie: string) => {
            value = cookie;
          },
        } as unknown as import('express').Response,
        token,
      );
      await request(app.getHttpServer())
        .get('/admin/products')
        .set('Cookie', `${ADMIN_COOKIE}=${value}`)
        .expect(403);
      for (const path of [
        '/admin/deliveries',
        '/admin/deliveries/new',
        '/admin/deliveries/9',
      ])
        await request(app.getHttpServer())
          .get(path)
          .set('Cookie', `${ADMIN_COOKIE}=${value}`)
          .expect(403);
      for (const path of ['/admin/deliveries', '/admin/deliveries/9/cancel'])
        await request(app.getHttpServer())
          .post(path)
          .set('Cookie', `${ADMIN_COOKIE}=${value}`)
          .type('form')
          .send({})
          .expect(403);
      expect(deliveries.searchVisible).not.toHaveBeenCalled();
      expect(deliveries.findVisibleById).not.toHaveBeenCalled();
      expect(deliveries.assignDelivery).not.toHaveBeenCalled();
      expect(deliveries.cancelDelivery).not.toHaveBeenCalled();
      expect(products.search).not.toHaveBeenCalled();
    },
  );

  it('entregas: lecturas utilizan alcance ADMIN y conservan filtros, fechas y orden en paginación', async () => {
    const { agent } = await loggedIn();
    deliveries.searchVisible.mockResolvedValue({
      content: [delivery],
      page: 1,
      size: 1,
      totalElements: 3,
      totalPages: 3,
    });
    const result = await agent
      .get(
        '/admin/deliveries?page=1&size=1&estado=ASIGNADA&idPedido=4&idRepartidor=2&fechaDesde=2026-11-01T00:00:00Z&sortBy=idEntrega&sortDirection=ASC',
      )
      .expect(200);
    expect(deliveries.searchVisible).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        idPedido: 4,
        idRepartidor: 2,
        fechaDesde: new Date('2026-11-01T00:00:00Z'),
      }),
      expect.objectContaining({ rol: 'ADMIN' }),
    );
    expect(result.text).toContain('estado&#x3D;ASIGNADA');
    expect(result.text).toContain('sortBy&#x3D;idEntrega');
    expect(result.text).toContain('page&#x3D;2');
    expect(result.text.replaceAll('\u00a0', ' ')).toContain(
      '17 nov 2026, 6:00 a. m.',
    );
    expect(result.text).toContain('Asignación (Costa Rica)');
    expect(result.text).toContain('ISO 8601 UTC');
    await agent.get('/admin/deliveries/9').expect(200);
    expect(deliveries.findVisibleById).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ rol: 'ADMIN' }),
    );
  });
  it.each([
    ['2026-11-19T05:59:00.000Z', '18 nov 2026, 11:59 p. m.'],
    ['2026-11-19T06:00:00.000Z', '19 nov 2026, 12:00 a. m.'],
  ])(
    'entregas: presenta %s en Costa Rica sin cambiar el instante',
    async (iso, text) => {
      const { agent } = await loggedIn();
      const current = {
        ...delivery,
        estado: 'ENTREGADA',
        fechaAsignacion: new Date(iso),
        fechaEntrega: new Date('2026-11-19T06:01:00.000Z'),
      };
      deliveries.searchVisible.mockResolvedValueOnce({
        content: [current],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      });
      deliveries.findVisibleById.mockResolvedValueOnce(current);
      for (const path of ['/admin/deliveries', '/admin/deliveries/9']) {
        const response = await agent.get(path).expect(200);
        const html = response.text.replaceAll('\u00a0', ' ');
        expect(html).toContain(text);
        expect(html).toContain('19 nov 2026, 12:01 a. m.');
        expect(html).toContain('(Costa Rica)');
      }
      expect(current.fechaAsignacion.toISOString()).toBe(iso);
      expect(current.fechaEntrega.toISOString()).toBe(
        '2026-11-19T06:01:00.000Z',
      );
    },
  );
  it('entregas: filtros vacíos de formulario nativo conservan los defaults', async () => {
    const { agent } = await loggedIn();
    await agent
      .get(
        '/admin/deliveries?estado=&idPedido=&idRepartidor=&fechaDesde=&fechaHasta=',
      )
      .expect(200);
    expect(deliveries.searchVisible).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, size: 20 }),
      expect.anything(),
    );
  });
  it.each([
    'idPedido=-1',
    'size=101',
    'estado=OTRO',
    'fechaDesde=invalida',
    'extra=1',
    'idPedido=1&idPedido=2',
    '_csrf=extra',
  ])('entregas: rechaza consulta inválida %s', async (query) => {
    const { agent } = await loggedIn();
    await agent.get(`/admin/deliveries?${query}`).expect(400);
    expect(deliveries.searchVisible).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1abc', '2147483648'])(
    'entregas: rechaza ID de ruta %s',
    async (id) => {
      const { agent } = await loggedIn();
      await agent.get(`/admin/deliveries/${id}`).expect(400);
      expect(deliveries.findVisibleById).not.toHaveBeenCalled();
    },
  );
  it('entregas: errores por campo, valores escapados y ausencia de escritura', async () => {
    const { agent, token } = await loggedIn();
    const result = await agent
      .post('/admin/deliveries')
      .type('form')
      .send({
        _csrf: token,
        idPedido: '<script>x</script>',
        idRepartidor: '2',
        extra: '1',
      })
      .expect(400);
    expect(result.text).toContain('error-idPedido');
    expect(result.text).toContain('&lt;script&gt;');
    expect(result.text).toContain('selected');
    expect(result.text).toContain('campos no permitidos');
    expect(result.text).not.toContain('<script>');
    expect(deliveries.assignDelivery).not.toHaveBeenCalled();
  });
  it('entregas: PRG hacia recurso y navegación sin repetir asignación', async () => {
    const { agent, token } = await loggedIn();
    await agent
      .post('/admin/deliveries')
      .type('form')
      .send({ _csrf: token, idPedido: '4', idRepartidor: '2' })
      .expect(303)
      .expect('Location', '/admin/deliveries/9');
    await agent.get('/admin/deliveries/9').expect(200);
    await agent.get('/admin/deliveries/9').expect(200);
    expect(deliveries.assignDelivery).toHaveBeenCalledTimes(1);
    expect(deliveries.assignDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ idPedido: 4, idRepartidor: 2 }),
    );
  });
  it('entregas: traduce excepción del dominio sin mostrar su mensaje original', async () => {
    const { agent, token } = await loggedIn();
    deliveries.assignDelivery.mockRejectedValueOnce(
      new InvalidOrderStateException('private-state'),
    );
    const result = await agent
      .post('/admin/deliveries')
      .type('form')
      .send({ _csrf: token, idPedido: '4', idRepartidor: '2' })
      .expect(409);
    expect(result.text).not.toContain('private-state');
    expect(result.text).toContain('conflicto');
  });
  it.each(['assign', 'cancel'])(
    'entregas: fallo inesperado %s seguro y consulta de recuperación sin reenvío',
    async (operation) => {
      const { agent, token } = await loggedIn();
      const method =
        operation === 'assign'
          ? deliveries.assignDelivery
          : deliveries.cancelDelivery;
      method.mockRejectedValueOnce(
        new Error('SELECT private-password postgres://secret'),
      );
      const result = await agent
        .post(
          operation === 'assign'
            ? '/admin/deliveries'
            : '/admin/deliveries/9/cancel',
        )
        .type('form')
        .send(
          operation === 'assign'
            ? { _csrf: token, idPedido: '4', idRepartidor: '2' }
            : { _csrf: token },
        )
        .expect(500);
      expect(result.text).not.toMatch(
        /SELECT|private-password|postgres:|stack/,
      );
      expect(result.text).toContain('Consultar estado vigente');
      expect(result.text).not.toContain('Asignar entrega</button>');
      expect(result.text).not.toContain('Confirmar cancelación</button>');
      expect(method).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['ASIGNADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA'])(
    'entregas: confirmación solo en estado %s',
    async (estado) => {
      const { agent } = await loggedIn();
      deliveries.findVisibleById.mockResolvedValueOnce({ ...delivery, estado });
      const result = await agent.get('/admin/deliveries/9').expect(200);
      expect(result.text.includes('Confirmar cancelación')).toBe(
        estado === 'ASIGNADA',
      );
    },
  );
  it.each(['/admin/deliveries', '/admin/deliveries/9/cancel'])(
    'entregas: CSRF ausente, inválido y ajeno en %s',
    async (url) => {
      const { agent, token } = await loggedIn();
      const other = await loggedIn();
      for (const body of [{}, { _csrf: 'invalid' }, { _csrf: other.token }])
        await agent.post(url).type('form').send(body).expect(403);
      if (url.endsWith('/cancel')) {
        await agent
          .post(url)
          .type('form')
          .send({ _csrf: token, extra: '1' })
          .expect(400);
        expect(deliveries.cancelDelivery).not.toHaveBeenCalled();
      }
      expect(deliveries.assignDelivery).not.toHaveBeenCalled();
    },
  );

  it('no registra rutas administrativas bajo api/v1 ni operaciones en Swagger', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/products')
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);
    const result = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(JSON.stringify(result.body)).not.toContain('/admin/');
  });
});
