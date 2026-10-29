import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { ProductsModule } from '../../../src/modules/products/products.module';
import { ProductsRepository } from '../../../src/modules/products/repositories/products.repository';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { ProductResponseDto } from '../../../src/modules/products/dto/product-response.dto';
import { OrdersHttpModule } from '../../../src/modules/orders/orders-http.module';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { OrderDetail } from '../../../src/modules/order-details/entities/order-detail.entity';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('Productos: concurrencia optimista con HTTP y PostgreSQL real', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>>;
  let ds: DataSource;
  let product: Product;
  let tokens: Record<string, string>;
  let owner: User;
  let neighborhood: Neighborhood;
  const previousSecret = process.env.JWT_SECRET;
  const password = randomUUID();
  let hash: string;
  const path = () => `/api/v1/products/${product.idProducto}`;

  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    hash = await bcrypt.hash(password, 4);
    context = await createHttpTestApp([ProductsModule, OrdersHttpModule]);
    ds = context.database.dataSource;
  });
  beforeEach(async () => {
    tokens = {};
    for (const key of ['ADMIN', 'EMPRENDEDOR', 'OTHER', 'CLIENTE']) {
      const user = await ds.getRepository(User).save({
        authId: randomUUID(),
        nombre: key,
        apellido: 'Prueba',
        correo: `${key.toLowerCase()}@example.test`,
        rol: key === 'OTHER' ? 'EMPRENDEDOR' : key,
        estado: 'ACTIVO',
        claveHash: hash,
      });
      if (key === 'EMPRENDEDOR') owner = user;
      const login = await request(server())
        .post('/api/v1/auth/login')
        .send({ correo: user.correo, clave: password })
        .expect(201);
      tokens[key] = (login.body as { token: string }).token;
    }
    const store = await ds.getRepository(Store).save({
      idEmprendedor: owner.idUsuario,
      nombre: 'Propia',
      direccion: 'Prueba',
    });
    const category = await ds
      .getRepository(Category)
      .save({ nombre: 'Prueba' });
    neighborhood = await ds
      .getRepository(Neighborhood)
      .save({ nombre: 'Prueba', tarifaEnvio: '0.00' });
    product = await ds.getRepository(Product).save({
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Original',
      precio: '10.25',
      cantidadDisponible: 5,
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await ds.query(
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
    return context.app.getHttpServer();
  }
  const patch = (body: object, role = 'ADMIN') =>
    request(server())
      .patch(path())
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(body);
  const buy = () =>
    request(server())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokens.CLIENTE}`)
      .send({
        idBarrio: neighborhood.idBarrio,
        direccionEntrega: 'Dirección de prueba',
        items: [{ idProducto: product.idProducto, cantidad: 2 }],
      });
  const current = () =>
    ds
      .getRepository(Product)
      .findOneByOrFail({ idProducto: product.idProducto });
  function conflict(response: request.Response) {
    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(
      /application\/problem\+json/,
    );
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail:
        'El producto cambió desde su lectura. Consulte la versión vigente antes de volver a editar.',
      instance: path(),
    });
    expect(response.text).not.toMatch(
      /UPDATE |SELECT |driverError|stack|constraint/,
    );
  }
  async function waitForLock(sql: string) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await ds.query<{ waiting: boolean }[]>(
        "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1) AS waiting",
        [sql],
      );
      if (row.waiting) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('La operación no alcanzó el bloqueo PostgreSQL esperado.');
  }

  it('dos sesiones leen la misma versión; una guarda, otra recibe 409 sin sobrescribir y puede recargar', async () => {
    const first = request.agent(server()),
      second = request.agent(server());
    const [readA, readB] = await Promise.all([
      first.get(path()).expect(200),
      second.get(path()).expect(200),
    ]);
    const a = readA.body as ProductResponseDto,
      b = readB.body as ProductResponseDto;
    expect(a.version).toBe(1);
    expect(b.version).toBe(a.version);
    const saved = await first
      .patch(path())
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .send({
        nombre: 'Primera edición',
        cantidadDisponible: 8,
        version: a.version,
      })
      .expect(200);
    expect(saved.body).toMatchObject({
      nombre: 'Primera edición',
      cantidadDisponible: 8,
      version: 2,
    });
    conflict(
      await second
        .patch(path())
        .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
        .send({
          nombre: 'Edición obsoleta',
          cantidadDisponible: 100,
          version: b.version,
        }),
    );
    expect(await current()).toMatchObject({
      nombre: 'Primera edición',
      cantidadDisponible: 8,
      version: 2,
    });
    const fresh = await second.get(path()).expect(200);
    await second
      .patch(path())
      .set('Authorization', `Bearer ${tokens.EMPRENDEDOR}`)
      .send({
        descripcion: 'Vigente',
        version: (fresh.body as ProductResponseDto).version,
      })
      .expect(200);
    expect(await current()).toMatchObject({
      nombre: 'Primera edición',
      cantidadDisponible: 8,
      descripcion: 'Vigente',
      version: 3,
    });
  });

  it('dos PATCH concurrentes de la misma versión permiten exactamente una escritura', async () => {
    const results = await Promise.all([
      patch({ nombre: 'A', cantidadDisponible: 6, version: 1 }),
      patch({ nombre: 'B', cantidadDisponible: 7, version: 1 }, 'EMPRENDEDOR'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!
      .body as ProductResponseDto;
    conflict(results.find((r) => r.status === 409)!);
    expect(await current()).toMatchObject({
      nombre: winner.nombre,
      cantidadDisponible: winner.cantidadDisponible,
      version: 2,
    });
  });

  it.each([undefined, null, 0, -1, 1.5, '1', 2147483648])(
    'rechaza versión inválida %j con 400 sin escribir',
    async (version) => {
      const response = await patch({
        nombre: 'No guardar',
        ...(version === undefined ? {} : { version }),
      }).expect(400);
      expect(response.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );
      expect(await current()).toMatchObject({
        nombre: 'Original',
        version: 1,
        cantidadDisponible: 5,
      });
    },
  );

  it('mantiene 401, 403 y 404; un ajeno no conoce si hay conflicto', async () => {
    await request(server()).patch(path()).send({ version: 1 }).expect(401);
    await patch({ version: 1 }, 'CLIENTE').expect(403);
    await patch({ version: 999 }, 'OTHER').expect(404);
    await request(server())
      .patch('/api/v1/products/999')
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .send({ version: 1 })
      .expect(404);
    expect(await current()).toMatchObject({ version: 1 });
  });

  it('PATCH de solo versión también consume la versión, sin perder campos', async () => {
    const result = await patch({ version: 1 }, 'EMPRENDEDOR').expect(200);
    expect(result.body).toMatchObject({
      nombre: 'Original',
      cantidadDisponible: 5,
      version: 2,
    });
    conflict(await patch({ version: 1 }));
  });

  it('la compra bloquea primero; el PATCH espera, recibe 409 y no repone las existencias vendidas', async () => {
    const locked = barrier(),
      proceed = barrier();
    const original = Object.getOwnPropertyDescriptor(
      ProductsRepository.prototype,
      'findByIdsForUpdate',
    )!.value as ProductsRepository['findByIdsForUpdate'];
    jest
      .spyOn(ProductsRepository.prototype, 'findByIdsForUpdate')
      .mockImplementation(async function (
        this: ProductsRepository,
        ids: number[],
      ) {
        const read = original.bind(
          this,
        ) as ProductsRepository['findByIdsForUpdate'];
        const rows = await read(ids); // SQL y FOR UPDATE reales.
        locked.release();
        await proceed.promise;
        return rows;
      });
    let editing: Promise<request.Response> | undefined;
    const purchase = buy().then((r) => r);
    try {
      await Promise.race([
        locked.promise,
        purchase.then((response) => {
          throw new Error(
            `La compra terminó antes del bloqueo esperado: HTTP ${response.status}`,
          );
        }),
      ]);
      editing = patch({ cantidadDisponible: 100, version: 1 }).then((r) => r);
      await waitForLock('UPDATE "producto"%');
    } finally {
      proceed.release();
    }
    const [purchaseResult, editResult] = await Promise.all([purchase, editing]);
    expect(purchaseResult.status).toBe(201);
    conflict(editResult);
    expect(await current()).toMatchObject({
      cantidadDisponible: 3,
      version: 2,
    });
    expect(
      await ds.getRepository(Order).countBy({ estado: 'CONFIRMADO' }),
    ).toBe(1);
    expect(await ds.getRepository(OrderDetail).count()).toBe(1);
  });

  it('la edición guarda primero bajo transacción; la compra espera y descuenta del stock vigente', async () => {
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let purchase: Promise<request.Response> | undefined;
    try {
      const repo = new ProductsRepository(
        runner.manager.getRepository(Product),
      );
      expect(
        await repo.updateForActor(
          product.idProducto,
          { cantidadDisponible: 9 },
          { sub: owner.correo, idUsuario: owner.idUsuario, rol: 'EMPRENDEDOR' },
          1,
        ),
      ).toMatchObject({ cantidadDisponible: 9, version: 2 });
      purchase = buy().then((r) => r);
      await waitForLock('SELECT %FOR UPDATE');
      await runner.commitTransaction();
      expect((await purchase).status).toBe(201);
      expect(await current()).toMatchObject({
        cantidadDisponible: 7,
        version: 3,
      });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if (purchase) await purchase;
      await runner.release();
    }
  });
});
