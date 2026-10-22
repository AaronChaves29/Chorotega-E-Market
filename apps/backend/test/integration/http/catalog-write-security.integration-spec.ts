import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ProductsModule } from '../../../src/modules/products/products.module';
import { OrdersHttpModule } from '../../../src/modules/orders/orders-http.module';
import { ProductsRepository } from '../../../src/modules/products/repositories/products.repository';
import { StoresRepository } from '../../../src/modules/stores/repositories/stores.repository';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

const operations = [
  ['post', 'stores'],
  ['patch', 'stores'],
  ['delete', 'stores'],
  ['post', 'categories'],
  ['patch', 'categories'],
  ['delete', 'categories'],
  ['post', 'products'],
  ['patch', 'products'],
  ['delete', 'products'],
] as const;
type Role = 'ADMIN' | 'EMPRENDEDOR' | 'OTHER' | 'CLIENTE' | 'REPARTIDOR';

describe('Catálogo: seguridad de escrituras con JWT real y PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const password = randomUUID();
  let hash: string;
  let users: Record<Role, User>;
  let tokens: Record<Role, string>;
  let inactive: User;
  let own: Store, destination: Store, foreign: Store, empty: Store;
  let category: Category, emptyCategory: Category;
  let product: Product, foreignProduct: Product;
  let order: Order;

  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    hash = await bcrypt.hash(password, 10);
    context = await createHttpTestApp([ProductsModule, OrdersHttpModule]);
  });
  beforeEach(async () => {
    const ds = context!.database.dataSource;
    const entries: [Role, User][] = [];
    const tokenEntries: [Role, string][] = [];
    for (const key of [
      'ADMIN',
      'EMPRENDEDOR',
      'OTHER',
      'CLIENTE',
      'REPARTIDOR',
    ] as const) {
      const user = await ds.getRepository(User).save({
        authId: randomUUID(),
        nombre: key,
        apellido: 'Prueba',
        correo: `${key.toLowerCase()}@example.test`,
        rol: key === 'OTHER' ? 'EMPRENDEDOR' : key,
        estado: 'ACTIVO',
        claveHash: hash,
      });
      const login = await request(server())
        .post('/api/v1/auth/login')
        .send({ correo: user.correo, clave: password })
        .expect(201);
      entries.push([key, user]);
      tokenEntries.push([key, (login.body as { token: string }).token]);
    }
    users = Object.fromEntries(entries) as Record<Role, User>;
    tokens = Object.fromEntries(tokenEntries) as Record<Role, string>;
    inactive = await ds.getRepository(User).save({
      authId: randomUUID(),
      nombre: 'Inactivo',
      apellido: 'Prueba',
      correo: 'inactive@example.test',
      rol: 'EMPRENDEDOR',
      estado: 'INACTIVO',
    });
    const stores = ds.getRepository(Store);
    own = await stores.save({
      idEmprendedor: users.EMPRENDEDOR.idUsuario,
      nombre: 'Origen',
      direccion: 'Nicoya',
    });
    destination = await stores.save({
      idEmprendedor: users.EMPRENDEDOR.idUsuario,
      nombre: 'Destino',
      direccion: 'Nicoya',
    });
    foreign = await stores.save({
      idEmprendedor: users.OTHER.idUsuario,
      nombre: 'Ajena',
      direccion: 'Nicoya',
    });
    empty = await stores.save({
      idEmprendedor: users.EMPRENDEDOR.idUsuario,
      nombre: 'Sin relaciones',
      direccion: 'Nicoya',
    });
    category = await ds.getRepository(Category).save({ nombre: 'Base' });
    emptyCategory = await ds
      .getRepository(Category)
      .save({ nombre: 'Sin productos' });
    const base = {
      idCategoria: category.idCategoria,
      nombre: 'Producto',
      precio: '10.25',
      cantidadDisponible: 4,
    };
    product = await ds
      .getRepository(Product)
      .save({ ...base, idTienda: own.idTienda });
    foreignProduct = await ds
      .getRepository(Product)
      .save({ ...base, idTienda: foreign.idTienda });
    const neighborhood = await ds
      .getRepository(Neighborhood)
      .save({ nombre: 'Centro', tarifaEnvio: '1.00' });
    order = await ds.getRepository(Order).save({
      idCliente: users.CLIENTE.idUsuario,
      idTienda: own.idTienda,
      idBarrio: neighborhood.idBarrio,
      estado: 'CONFIRMADO',
      direccionEntrega: 'Nicoya',
      subtotal: '10.25',
      tarifaEnvio: '1.00',
      total: '11.25',
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
  function productInput(idTienda = own.idTienda) {
    return {
      idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Nuevo producto',
      precio: 12.5,
      cantidadDisponible: 2,
    };
  }
  function route(
    method: (typeof operations)[number][0],
    resource: (typeof operations)[number][1],
  ) {
    const id =
      resource === 'stores'
        ? empty.idTienda
        : resource === 'categories'
          ? emptyCategory.idCategoria
          : product.idProducto;
    return `/api/v1/${resource}${method === 'post' ? '' : '/' + id}`;
  }
  function body(
    method: (typeof operations)[number][0],
    resource: (typeof operations)[number][1],
  ) {
    if (method !== 'post')
      return method === 'patch' ? { nombre: 'Actualizado' } : {};
    if (resource === 'stores')
      return {
        idEmprendedor: users.EMPRENDEDOR.idUsuario,
        nombre: 'Nueva',
        direccion: 'Nicoya',
      };
    if (resource === 'products') return productInput();
    return { nombre: 'Nueva categoría' };
  }
  function problem(response: request.Response, status: number) {
    expect(response.headers['content-type']).toMatch(
      /application\/problem\+json/,
    );
    expect(response.body).toMatchObject({ type: 'about:blank', status });
    expect(response.text).not.toMatch(
      /claveHash|clave_hash|authId|SELECT |INSERT INTO|driverError|stack/,
    );
  }

  describe.each(operations)('%s %s', (method, resource) => {
    it.each(['missing', 'invalid', 'expired'] as const)(
      'JWT %s devuelve 401 sin escribir',
      async (kind) => {
        let pending = request(server())[method](route(method, resource));
        if (kind !== 'missing') {
          const token =
            kind === 'invalid'
              ? 'token.invalido'
              : await context!.app.get(JwtService).signAsync(
                  {
                    sub: users.ADMIN.correo,
                    idUsuario: users.ADMIN.idUsuario,
                    rol: 'ADMIN',
                  },
                  { expiresIn: -1 },
                );
          pending = pending.set('Authorization', `Bearer ${token}`);
        }
        problem(await pending.send(body(method, resource)).expect(401), 401);
        expect(
          await context!.database.dataSource.getRepository(Store).count(),
        ).toBe(4);
        expect(
          await context!.database.dataSource.getRepository(Category).count(),
        ).toBe(2);
        expect(
          await context!.database.dataSource.getRepository(Product).count(),
        ).toBe(2);
      },
    );
    it.each(['CLIENTE', 'REPARTIDOR'] as const)(
      '%s recibe 403 sin escribir',
      async (rol) => {
        problem(
          await request(server())
            [method](route(method, resource))
            .set('Authorization', `Bearer ${tokens[rol]}`)
            .send(body(method, resource))
            .expect(403),
          403,
        );
      },
    );
    it('ADMIN autorizado conserva el contrato HTTP', async () => {
      const status = method === 'post' ? 201 : method === 'delete' ? 204 : 200;
      const response = await request(server())
        [method](route(method, resource))
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .send(body(method, resource))
        .expect(status);
      if (status === 201)
        await request(server()).get(response.headers.location).expect(200);
      if (status === 204) expect(response.text).toBe('');
    });
    if (resource === 'categories') {
      it('EMPRENDEDOR recibe 403', async () => {
        problem(
          await request(server())
            [method](route(method, resource))
            .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
            .send(body(method, resource))
            .expect(403),
          403,
        );
      });
    } else {
      it('EMPRENDEDOR propietario autorizado', async () => {
        const status =
          method === 'post' ? 201 : method === 'delete' ? 204 : 200;
        await request(server())
          [method](route(method, resource))
          .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
          .send(body(method, resource))
          .expect(status);
      });
    }
  });

  it.each(['stores', 'categories', 'products'] as const)(
    'GET listado y detalle de %s siguen públicos incluso con token inválido',
    async (resource) => {
      await request(server()).get(`/api/v1/${resource}`).expect(200);
      await request(server()).get(route('patch', resource)).expect(200);
      await request(server())
        .get(`/api/v1/${resource}`)
        .set('Authorization', 'Bearer invalido')
        .expect(200);
    },
  );
  it('EMPRENDEDOR no crea tienda para otro usuario', async () => {
    problem(
      await request(server())
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .send({
          idEmprendedor: users.OTHER.idUsuario,
          nombre: 'Ajena',
          direccion: 'Nicoya',
        })
        .expect(403),
      403,
    );
    expect(
      await context!.database.dataSource.getRepository(Store).count(),
    ).toBe(4);
  });
  it.each(['ADMIN', 'EMPRENDEDOR'] as const)(
    '%s no transfiere tienda ni persiste cambios parciales o altera visibilidad de Orders',
    async (rol) => {
      const before = await request(server())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .expect(200);
      const otherBefore = await request(server())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tokens.OTHER}`)
        .expect(200);
      problem(
        await request(server())
          .patch(`/api/v1/stores/${own.idTienda}`)
          .set('Authorization', `Bearer ${tokens[rol]}`)
          .send({
            idEmprendedor: users.OTHER.idUsuario,
            nombre: 'No persistir',
          })
          .expect(403),
        403,
      );
      expect(
        await context!.database.dataSource
          .getRepository(Store)
          .findOneBy({ idTienda: own.idTienda }),
      ).toMatchObject({
        idEmprendedor: users.EMPRENDEDOR.idUsuario,
        nombre: 'Origen',
      });
      const after = await request(server())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .expect(200);
      const otherAfter = await request(server())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tokens.OTHER}`)
        .expect(200);
      expect(after.body).toEqual(before.body);
      expect(otherAfter.body).toEqual(otherBefore.body);
      expect(after.body).toMatchObject({
        totalElements: 1,
        content: [expect.objectContaining({ idPedido: order.idPedido })],
      });
      expect(otherAfter.body).toMatchObject({ totalElements: 0 });
    },
  );
  it('PATCH de propietario idéntico conserva semántica parcial', async () => {
    await request(server())
      .patch(`/api/v1/stores/${empty.idTienda}`)
      .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
      .send({
        idEmprendedor: users.EMPRENDEDOR.idUsuario,
        nombre: 'Mismo dueño',
      })
      .expect(200);
    await request(server())
      .patch(`/api/v1/stores/${empty.idTienda}`)
      .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
      .send({})
      .expect(200);
  });
  it.each(['ADMIN', 'CLIENTE', 'REPARTIDOR', 'INACTIVO', 'MISSING'] as const)(
    'ADMIN no crea tienda para propietario %s',
    async (kind) => {
      const id =
        kind === 'INACTIVO'
          ? inactive.idUsuario
          : kind === 'MISSING'
            ? 999
            : users[kind].idUsuario;
      const status = kind === 'MISSING' ? 404 : 422;
      problem(
        await request(server())
          .post('/api/v1/stores')
          .set('Authorization', `Bearer ${tokens.ADMIN}`)
          .send({
            idEmprendedor: id,
            nombre: 'No persistir',
            direccion: 'Nicoya',
          })
          .expect(status),
        status,
      );
      expect(
        await context!.database.dataSource.getRepository(Store).count(),
      ).toBe(4);
    },
  );
  it.each(['patch', 'delete'] as const)(
    '%s de tienda ajena devuelve 404',
    async (method) => {
      problem(
        await request(server())
          [method](`/api/v1/stores/${foreign.idTienda}`)
          .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
          .send({ nombre: 'No persistir' })
          .expect(404),
        404,
      );
      expect(
        await context!.database.dataSource
          .getRepository(Store)
          .findOneBy({ idTienda: foreign.idTienda }),
      ).toMatchObject({ nombre: 'Ajena' });
    },
  );
  it('POST producto en tienda ajena devuelve 404', async () => {
    problem(
      await request(server())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .send(productInput(foreign.idTienda))
        .expect(404),
      404,
    );
  });
  it.each(['patch', 'delete'] as const)(
    '%s de producto ajeno devuelve 404 sin cambios',
    async (method) => {
      problem(
        await request(server())
          [method](`/api/v1/products/${foreignProduct.idProducto}`)
          .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
          .send({ nombre: 'No persistir' })
          .expect(404),
        404,
      );
      expect(
        await context!.database.dataSource
          .getRepository(Product)
          .findOneBy({ idProducto: foreignProduct.idProducto }),
      ).toMatchObject({ nombre: 'Producto' });
    },
  );
  it('permite trasladar productos entre tiendas propias', async () => {
    const response = await request(server())
      .patch(`/api/v1/products/${product.idProducto}`)
      .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
      .send({ idTienda: destination.idTienda })
      .expect(200);
    expect(response.body).toMatchObject({
      idTienda: destination.idTienda,
      precio: '10.25',
    });
  });
  it('rechaza destino ajeno sin actualizar parcialmente', async () => {
    await request(server())
      .patch(`/api/v1/products/${product.idProducto}`)
      .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
      .send({ idTienda: foreign.idTienda, nombre: 'No persistir' })
      .expect(404);
    expect(
      await context!.database.dataSource
        .getRepository(Product)
        .findOneBy({ idProducto: product.idProducto }),
    ).toMatchObject({ idTienda: own.idTienda, nombre: 'Producto' });
  });
  it('rechaza origen ajeno aunque el destino sea propio', async () => {
    await request(server())
      .patch(`/api/v1/products/${foreignProduct.idProducto}`)
      .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
      .send({ idTienda: destination.idTienda })
      .expect(404);
  });
  it('ADMIN puede administrar y trasladar productos de otro propietario', async () => {
    await request(server())
      .patch(`/api/v1/products/${foreignProduct.idProducto}`)
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .send({ idTienda: own.idTienda })
      .expect(200);
    await request(server())
      .delete(`/api/v1/products/${foreignProduct.idProducto}`)
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .expect(204);
    await request(server())
      .delete(`/api/v1/stores/${foreign.idTienda}`)
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .expect(204);
    await request(server())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .send(productInput(destination.idTienda))
      .expect(201);
  });
  it('SQL vuelve a comprobar origen y destino tras la lectura previa y no permite borrar o recuperar un producto ajeno', async () => {
    const repo = context!.app.get(ProductsRepository);
    const actor = {
      sub: users.EMPRENDEDOR.correo,
      idUsuario: users.EMPRENDEDOR.idUsuario,
      rol: 'EMPRENDEDOR',
    };
    await context!.database.dataSource
      .getRepository(Product)
      .update(product.idProducto, { idTienda: foreign.idTienda });
    expect(
      await repo.updateForActor(
        product.idProducto,
        { idTienda: destination.idTienda },
        actor,
      ),
    ).toBeNull();
    expect(await repo.updateForActor(product.idProducto, {}, actor)).toBeNull();
    expect(await repo.deleteForActor(product.idProducto, actor)).toBe(false);
    expect(
      await repo.updateForActor(
        foreignProduct.idProducto,
        { nombre: 'No persistir' },
        actor,
      ),
    ).toBeNull();
    expect(
      await context!.database.dataSource
        .getRepository(Product)
        .findOneBy({ idProducto: product.idProducto }),
    ).toMatchObject({ idTienda: foreign.idTienda, nombre: 'Producto' });
    // Destino autorizado al leer, pero ya pertenece a otro al escribir.
    await context!.database.dataSource
      .getRepository(Product)
      .update(product.idProducto, { idTienda: own.idTienda });
    await context!.database.dataSource
      .getRepository(Store)
      .update(destination.idTienda, { idEmprendedor: users.OTHER.idUsuario });
    expect(
      await repo.updateForActor(
        product.idProducto,
        { idTienda: destination.idTienda, nombre: 'No persistir' },
        actor,
      ),
    ).toBeNull();
    expect(
      await context!.database.dataSource
        .getRepository(Product)
        .findOneBy({ idProducto: product.idProducto }),
    ).toMatchObject({ idTienda: own.idTienda, nombre: 'Producto' });
    const stores = context!.app.get(StoresRepository);
    expect(
      await stores.updateForActor(
        destination.idTienda,
        { nombre: 'No persistir' },
        actor,
      ),
    ).toBeNull();
    expect(await stores.deleteForActor(destination.idTienda, actor)).toBe(
      false,
    );
  });
  it('creación transaccional vuelve a comprobar la tienda y no guarda en una ajena', async () => {
    const repo = context!.app.get(ProductsRepository);
    const actor = {
      sub: users.EMPRENDEDOR.correo,
      idUsuario: users.EMPRENDEDOR.idUsuario,
      rol: 'EMPRENDEDOR',
    };
    const candidate = repo.createEntity({
      ...productInput(foreign.idTienda),
      precio: '12.50',
      descripcion: null,
      estado: 'ACTIVO',
    });
    expect(await repo.saveInAuthorizedStore(candidate, actor)).toBeNull();
    expect(
      await context!.database.dataSource.getRepository(Product).count(),
    ).toBe(2);
  });
  it.each(['patch', 'delete'] as const)(
    '%s reevalúa propiedad si ADMIN mueve el producto mientras la escritura HTTP espera un bloqueo',
    async (method) => {
      const ds = context!.database.dataSource;
      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      let responsePromise: Promise<request.Response> | undefined;
      try {
        // Movimiento legítimo de ADMIN aún sin confirmar: la lectura HTTP verá el origen anterior.
        await runner.manager
          .getRepository(Product)
          .update(product.idProducto, { idTienda: foreign.idTienda });
        responsePromise = request(server())
          [method](`/api/v1/products/${product.idProducto}`)
          .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
          .send({ nombre: 'No persistir' })
          .then((response) => response);
        const deadline = Date.now() + 5000;
        let blocked = false;
        while (Date.now() < deadline) {
          const rows = await ds.query<{ waiting: boolean }[]>(
            "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1) AS waiting",
            [
              method === 'patch'
                ? 'UPDATE "producto"%'
                : 'DELETE FROM "producto"%',
            ],
          );
          if (rows[0]?.waiting) {
            blocked = true;
            break;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
        await runner.commitTransaction();
        problem(await responsePromise, 404);
        expect(
          await ds
            .getRepository(Product)
            .findOneBy({ idProducto: product.idProducto }),
        ).toMatchObject({ idTienda: foreign.idTienda, nombre: 'Producto' });
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
        await responsePromise;
      }
    },
  );
});
