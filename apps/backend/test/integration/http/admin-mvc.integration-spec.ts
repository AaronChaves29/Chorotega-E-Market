import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AdminModule } from '../../../src/admin/admin.module';
import { configureAdminViews } from '../../../src/admin/admin-views';
import { configureOpenApi } from '../../../src/common/http/configure-openapi';
import { OrdersHttpModule } from '../../../src/modules/orders/orders-http.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

function csrf(html: string): string {
  const token = /name=['"]_csrf['"]\s+value=['"]([a-f0-9]+)['"]/.exec(
    html,
  )?.[1];
  if (!token) throw new Error('Formulario sin CSRF');
  return token;
}

describe('MVC administrativo: Nest, JWT y PostgreSQL temporal reales', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const password = randomUUID();
  let hash: string;
  let owner: User, store: Store, category: Category;
  beforeAll(async () => {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    hash = await bcrypt.hash(password, 10);
    context = await createHttpTestApp(
      [AdminModule, OrdersHttpModule],
      (app) => {
        configureAdminViews(app);
        configureOpenApi(app);
      },
    );
  });
  beforeEach(async () => {
    const ds = context!.database.dataSource;
    for (const rol of ['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR']) {
      const user = await ds.getRepository(User).save({
        authId: randomUUID(),
        nombre: rol,
        apellido: 'Prueba',
        correo: `${rol.toLowerCase()}@example.test`,
        rol,
        estado: 'ACTIVO',
        claveHash: hash,
      });
      if (rol === 'EMPRENDEDOR') owner = user;
    }
    store = await ds.getRepository(Store).save({
      nombre: 'Tienda base',
      direccion: 'Nicoya',
      idEmprendedor: owner.idUsuario,
    });
    category = await ds
      .getRepository(Category)
      .save({ nombre: 'Categoría base' });
  });
  afterEach(async () => {
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
  async function login(role = 'ADMIN') {
    const agent = request.agent(server());
    const form = await agent.get('/admin/login').expect(200);
    const response = await agent
      .post('/admin/login')
      .type('form')
      .send({
        _csrf: csrf(form.text),
        correo: `${role.toLowerCase()}@example.test`,
        clave: password,
      });
    return { agent, response };
  }
  function input(resource: string) {
    return resource === 'products'
      ? {
          idTienda: String(store.idTienda),
          idCategoria: String(category.idCategoria),
          nombre: 'Nuevo producto',
          precio: '12.50',
          cantidadDisponible: '2',
        }
      : {
          idEmprendedor: String(owner.idUsuario),
          nombre: 'Nueva tienda',
          direccion: 'Nicoya',
        };
  }
  async function count(resource: string) {
    const ds = context!.database.dataSource;
    return resource === 'products'
      ? ds.getRepository(Product).count()
      : ds.getRepository(Store).count();
  }
  it.each(['products', 'stores'])(
    'sin sesión no permite consultar %s',
    async (resource) => {
      await request(server())
        .get(`/admin/${resource}`)
        .expect(303)
        .expect('Location', '/admin/login');
    },
  );
  it.each(['CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'rechaza acceso administrativo de %s',
    async (role) => {
      const { agent, response } = await login(role);
      expect(response.status).toBe(403);
      await agent.get('/admin/products').expect(303);
      await agent.get('/admin/stores').expect(303);
    },
  );
  it.each(['products', 'stores'])(
    'crea %s con persistencia real y PRG',
    async (resource) => {
      const { agent, response } = await login();
      expect(response.status).toBe(303);
      const form = await agent.get(`/admin/${resource}/new`).expect(200);
      const before = await count(resource);
      await agent
        .post(`/admin/${resource}`)
        .type('form')
        .send({ ...input(resource), _csrf: csrf(form.text) })
        .expect(303)
        .expect('Location', `/admin/${resource}`);
      expect(await count(resource)).toBe(before + 1);
      await agent
        .get(`/admin/${resource}`)
        .expect(200)
        .expect('Content-Type', /text\/html/);
      await agent.get(`/admin/${resource}`).expect(200);
      expect(await count(resource)).toBe(before + 1);
      if (resource === 'products') {
        const saved = await context!.database.dataSource
          .getRepository(Product)
          .findOneByOrFail({ nombre: 'Nuevo producto' });
        expect(saved.precio).toBe('12.50');
        expect(saved.idTienda).toBe(store.idTienda);
      }
    },
  );
  it.each(['products', 'stores'])(
    'pagina %s en SQL y escapa HTML del dominio',
    async (resource) => {
      const ds = context!.database.dataSource;
      if (resource === 'products') {
        for (const nombre of [
          'Primero',
          '<script>private-xss-marker</script>',
          'Tercero',
        ])
          await ds.getRepository(Product).save({
            nombre,
            idTienda: store.idTienda,
            idCategoria: category.idCategoria,
            precio: '1.25',
            cantidadDisponible: 1,
          });
      } else {
        await ds.getRepository(Store).save({
          nombre: '<script>private-xss-marker</script>',
          direccion: 'Nicoya',
          idEmprendedor: owner.idUsuario,
        });
        await ds.getRepository(Store).save({
          nombre: 'Tercera',
          direccion: 'Nicoya',
          idEmprendedor: owner.idUsuario,
        });
      }
      const { agent } = await login();
      const page = await agent
        .get(`/admin/${resource}?page=1&size=1`)
        .expect(200);
      expect(page.text).toContain(
        '&lt;script&gt;private-xss-marker&lt;/script&gt;',
      );
      expect(page.text).not.toContain('<script>');
      expect(page.text).toContain('Total de registros: 3');
      expect(page.text).toMatch(/rel=['"]prev['"]/);
      expect(page.text).toMatch(/rel=['"]next['"]/);
      expect(page.text).not.toContain(
        resource === 'products' ? 'Primero' : 'Tienda base',
      );
    },
  );
  it.each(['products', 'stores'])(
    'validación de %s conserva valores y no escribe',
    async (resource) => {
      const { agent } = await login();
      const form = await agent.get(`/admin/${resource}/new`);
      const before = await count(resource);
      const invalid = {
        ...input(resource),
        nombre: 'x'.repeat(151),
        _csrf: csrf(form.text),
      };
      const result = await agent
        .post(`/admin/${resource}`)
        .type('form')
        .send(invalid)
        .expect(400);
      expect(result.text).toContain('error-nombre');
      expect(result.text).toContain('x'.repeat(151));
      expect(await count(resource)).toBe(before);
    },
  );
  it.each(['products', 'stores'])(
    'relación inexistente de %s no persiste registros parciales',
    async (resource) => {
      const { agent } = await login();
      const form = await agent.get(`/admin/${resource}/new`);
      const before = await count(resource);
      const body = {
        ...input(resource),
        ...(resource === 'products'
          ? { idTienda: '2147483647' }
          : { idEmprendedor: '2147483647' }),
        _csrf: csrf(form.text),
      };
      await agent
        .post(`/admin/${resource}`)
        .type('form')
        .send(body)
        .expect(404);
      expect(await count(resource)).toBe(before);
    },
  );
  it.each(['products', 'stores'])(
    'sin CSRF o con CSRF ajeno no escribe %s',
    async (resource) => {
      const first = await login();
      const second = await login();
      const otherForm = await second.agent.get(`/admin/${resource}/new`);
      const before = await count(resource);
      await first.agent
        .post(`/admin/${resource}`)
        .type('form')
        .send(input(resource))
        .expect(403);
      await first.agent
        .post(`/admin/${resource}`)
        .type('form')
        .send({ ...input(resource), _csrf: csrf(otherForm.text) })
        .expect(403);
      expect(await count(resource)).toBe(before);
    },
  );
  it('mantiene login, REST público y protección JWT de pedidos', async () => {
    const result = await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: 'admin@example.test', clave: password })
      .expect(201);
    const token = (result.body as { token: string }).token;
    await request(server())
      .get('/api/v1/products')
      .expect(200)
      .expect('Content-Type', /application\/json/);
    await request(server()).get('/api/v1/stores').expect(200);
    await request(server())
      .post('/api/v1/products')
      .send(input('products'))
      .expect(401);
    await request(server()).get('/api/v1/orders').expect(401);
    await request(server())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { agent } = await login();
    await agent.post('/api/v1/products').send(input('products')).expect(401);
    const loginPage = await agent.get('/admin/products');
    expect(loginPage.text).not.toContain(token);
    await request(server()).get('/api/v1/admin/products').expect(404);
    await request(server()).get('/docs-json').expect(200);
  });
});
