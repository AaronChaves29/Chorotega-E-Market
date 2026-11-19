import { DataSource } from 'typeorm';
import { writeOrderAudit } from '../../src/modules/order-audits/outbox/order-audit-writer';
import { randomUUID } from 'node:crypto';
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from 'testcontainers';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { Db } from 'mongodb';
import { createHttpTestApp } from '../support/create-http-test-app';
import { OrdersHttpModule } from '../../src/modules/orders/orders-http.module';
import { DeliveriesModule } from '../../src/modules/deliveries/deliveries.module';
import { OrdersService } from '../../src/modules/orders/services/orders.service';
import { OrderPreparationService } from '../../src/modules/orders/services/order-preparation.service';
import { OrderCancellationService } from '../../src/modules/orders/services/order-cancellation.service';
import { DeliveriesService } from '../../src/modules/deliveries/services/deliveries.service';
import { User } from '../../src/modules/users/entities/user.entity';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { Product } from '../../src/modules/products/entities/product.entity';
import { Neighborhood } from '../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Courier } from '../../src/modules/couriers/entities/courier.entity';
import { Order } from '../../src/modules/orders/entities/order.entity';
import { MongoDatabaseService } from '../../src/database/mongodb/mongodb-database.service';
import { provisionOrderAudits } from '../../src/modules/order-audits/provision-order-audits';
import { OrderAuditsRepository } from '../../src/modules/order-audits/repositories/order-audits.repository';
import { OutboxStore } from '../../src/modules/order-audits/outbox/outbox-store';
import { OrderAuditPublisher } from '../../src/modules/order-audits/outbox/order-audit-publisher';
import type {
  OrderAudit,
  OrderAuditEvent,
} from '../../src/modules/order-audits/models/order-audit.model';

// Real HTTP/services, PostgreSQL and MongoDB. Only failure injection uses spies.
describe('Outbox transaccional y MongoDB reales', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>>;
  let container: StartedTestContainer, mongo: MongoDatabaseService, db: Db;
  let mongoConfig: ConfigService;
  let repository: OrderAuditsRepository,
    store: OutboxStore,
    publisher: OrderAuditPublisher;
  let product: Product, courier: Courier, barrio: Neighborhood;
  const actors: Record<
    string,
    { idUsuario: number; sub: string; rol: string }
  > = {};
  const previousSecret = process.env.JWT_SECRET;
  const ds = () => context.database.dataSource;
  const orders = () => context.app.get(OrdersService);
  const cancellations = () => context.app.get(OrderCancellationService);
  const preparations = () => context.app.get(OrderPreparationService);
  const deliveries = () => context.app.get(DeliveriesService);
  const buy = () =>
    orders().createAndConfirm(actors.CLIENTE.idUsuario, {
      idBarrio: barrio.idBarrio,
      direccionEntrega: 'Dirección sintética privada',
      items: [{ idProducto: product.idProducto, cantidad: 2 }],
    });
  const rows = () =>
    ds().query<
      {
        evento_id: string;
        tipo: string;
        estado: string;
        intentos: number;
        payload: OrderAuditEvent;
      }[]
    >('SELECT * FROM pedido_audit_outbox ORDER BY pedido_id,secuencia');
  const savedProduct = () =>
    ds()
      .getRepository(Product)
      .findOneByOrFail({ idProducto: product.idProducto });
  const drain = async () => {
    for (let i = 0; i < 8; i++) await publisher.runOnce();
  };
  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    try {
      context = await createHttpTestApp([OrdersHttpModule, DeliveriesModule]);
      container = await new GenericContainer('mongo:7')
        .withExposedPorts(27017)
        .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
        .start();
      mongoConfig = new ConfigService({
        MONGODB_URI: `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/?serverSelectionTimeoutMS=1000`,
        MONGODB_DATABASE: 'outbox_temporal',
      });
      mongo = new MongoDatabaseService(mongoConfig);
      await mongo.onModuleInit();
      db = mongo.getDatabase();
      await provisionOrderAudits(db);
      repository = new OrderAuditsRepository(mongo);
      store = new OutboxStore(ds());
      publisher = new OrderAuditPublisher(store, repository);
      for (const rol of ['CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR', 'ADMIN']) {
        const user = await ds()
          .getRepository(User)
          .save({
            authId: randomUUID(),
            nombre: 'Prueba',
            apellido: 'Temporal',
            correo: `${randomUUID()}@example.test`,
            rol,
          });
        actors[rol] = { idUsuario: user.idUsuario, sub: user.correo, rol };
      }
      const shop = await ds().getRepository(Store).save({
        idEmprendedor: actors.EMPRENDEDOR.idUsuario,
        nombre: 'Sintética',
        direccion: 'Prueba',
      });
      const category = await ds()
        .getRepository(Category)
        .save({ nombre: 'Temporal' });
      product = await ds().getRepository(Product).save({
        idTienda: shop.idTienda,
        idCategoria: category.idCategoria,
        nombre: 'Temporal',
        precio: '10.25',
        cantidadDisponible: 100,
      });
      barrio = await ds()
        .getRepository(Neighborhood)
        .save({ nombre: 'Temporal', tarifaEnvio: '1.25' });
      courier = await ds().getRepository(Courier).save({
        idUsuario: actors.REPARTIDOR.idUsuario,
        medioTransporte: 'MOTO',
      });
    } catch (error) {
      await cleanup();
      throw error;
    }
  });
  beforeEach(async () => {
    await ds().query('TRUNCATE pedido_audit_outbox, pedido_audit_sequence');
    await db.collection('bitacora_pedidos').deleteMany({});
    await ds()
      .getRepository(Product)
      .update(product.idProducto, { cantidadDisponible: 100 });
    await ds().query(
      "DELETE FROM entrega; DELETE FROM detalle_pedido; DELETE FROM pedido; UPDATE repartidor SET disponibilidad = 'DISPONIBLE'",
    );
  });
  async function cleanup() {
    await publisher?.onModuleDestroy();
    await mongo?.onModuleDestroy();
    await container?.stop();
    await context?.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
  afterAll(cleanup);
  async function assigned() {
    const order = await buy();
    await preparations().prepare(actors.EMPRENDEDOR, order.idPedido);
    const delivery = await deliveries().assignDelivery(
      { idPedido: order.idPedido, idRepartidor: courier.idRepartidor },
      actors.ADMIN,
    );
    return { order, delivery };
  }
  it('registra los siete eventos reales, actores, secuencias y fechas sin datos sensibles', async () => {
    const { order, delivery } = await assigned();
    await deliveries().cancelDelivery(delivery.idEntrega, actors.ADMIN);
    const second = await deliveries().assignDelivery(
      { idPedido: order.idPedido, idRepartidor: courier.idRepartidor },
      actors.ADMIN,
    );
    await deliveries().startDelivery(
      second.idEntrega,
      actors.REPARTIDOR.idUsuario,
    );
    await deliveries().completeDelivery(
      second.idEntrega,
      actors.REPARTIDOR.idUsuario,
    );
    const canceled = await buy();
    await cancellations().cancel(actors.CLIENTE, canceled.idPedido);
    expect(await db.collection('bitacora_pedidos').countDocuments()).toBe(0);
    await drain();
    const history = await repository.findByPedidoId(order.idPedido);
    expect(history!.eventos.map((e) => e.tipo)).toEqual([
      'PEDIDO_CONFIRMADO',
      'PEDIDO_PREPARANDO',
      'ENTREGA_ASIGNADA',
      'ENTREGA_CANCELADA',
      'ENTREGA_ASIGNADA',
      'ENTREGA_EN_CAMINO',
      'PEDIDO_ENTREGADO',
    ]);
    expect(
      history!.eventos.map((e) => (e as OrderAuditEvent).secuencia),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      (await repository.findByPedidoId(canceled.idPedido))!.eventos.map(
        (e) => e.tipo,
      ),
    ).toEqual(['PEDIDO_CONFIRMADO', 'PEDIDO_CANCELADO']);
    const events = (await rows()).map((r) => r.payload);
    expect(new Set(events.map((e) => e.tipo)).size).toBe(7);
    for (const event of events)
      expect(event.actor.idUsuario).toBe(actors[event.actor.rol].idUsuario);
    expect(history!.eventos.every((e) => e.fecha instanceof Date)).toBe(true);
    expect(JSON.stringify(history)).not.toMatch(
      /correo|password|direccion|cookie|JWT|@example|sintética privada/,
    );
    expect((await rows()).every((r) => r.estado === 'PUBLICADO')).toBe(true);
    expect((await savedProduct()).cantidadDisponible).toBe(98);
  });
  it('fallo de outbox revierte compra, detalles, inventario y contador', async () => {
    await ds().query(
      `CREATE FUNCTION fail_audit_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$`,
    );
    await ds().query(
      `CREATE TRIGGER fail_audit BEFORE INSERT ON pedido_audit_outbox FOR EACH ROW EXECUTE FUNCTION fail_audit_insert()`,
    );
    try {
      await expect(buy()).rejects.toThrow();
    } finally {
      await ds().query(
        'DROP TRIGGER fail_audit ON pedido_audit_outbox; DROP FUNCTION fail_audit_insert()',
      );
    }
    expect((await savedProduct()).cantidadDisponible).toBe(100);
    expect(await ds().getRepository(Order).count()).toBe(0);
    expect(await rows()).toHaveLength(0);
    expect(
      await ds().query('SELECT * FROM pedido_audit_sequence'),
    ).toHaveLength(0);
    await drain();
    expect(await db.collection('bitacora_pedidos').countDocuments()).toBe(0);
  });
  it('rollback comercial posterior a outbox revierte también el evento', async () => {
    const order = await buy();
    await ds().query(
      `CREATE FUNCTION fail_audit_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$`,
    );
    await ds().query(
      `CREATE CONSTRAINT TRIGGER fail_audit_commit AFTER INSERT ON pedido_audit_outbox DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_audit_commit()`,
    );
    try {
      await expect(
        cancellations().cancel(actors.CLIENTE, order.idPedido),
      ).rejects.toThrow();
    } finally {
      await ds().query(
        'DROP TRIGGER fail_audit_commit ON pedido_audit_outbox; DROP FUNCTION fail_audit_commit()',
      );
    }
    expect((await rows()).map((r) => r.tipo)).toEqual(['PEDIDO_CONFIRMADO']);
    expect((await savedProduct()).cantidadDisponible).toBe(98);
    await drain();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(1);
  });
  it('MongoDB no disponible conserva pendientes y bloquea N+1; reinicio recupera', async () => {
    const order = await buy();
    await preparations().prepare(actors.EMPRENDEDOR, order.idPedido);
    // Stop the actual MongoDB process, not merely a mocked/closed collection.
    await container.exec([
      'mongosh',
      '--quiet',
      '--eval',
      "db.getSiblingDB('admin').shutdownServer()",
    ]);
    try {
      await publisher.runOnce();
      expect((await rows()).map((r) => [r.estado, r.intentos])).toEqual([
        ['PENDIENTE', 1],
        ['PENDIENTE', 0],
      ]);
      expect(
        (
          await ds()
            .getRepository(Order)
            .findOneByOrFail({ idPedido: order.idPedido })
        ).estado,
      ).toBe('PREPARANDO');
    } finally {
      await container.restart();
      mongoConfig.set(
        'MONGODB_URI',
        `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/?serverSelectionTimeoutMS=1000`,
      );
      await mongo.onModuleDestroy();
      await mongo.onModuleInit();
      db = mongo.getDatabase();
    }
    await ds().query(
      "UPDATE pedido_audit_outbox SET proxima_ejecucion = clock_timestamp() WHERE estado = 'PENDIENTE'",
    );
    await new OrderAuditPublisher(
      new OutboxStore(ds()),
      new OrderAuditsRepository(mongo),
    ).runOnce();
    await drain();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(2);
  });
  it('respuesta perdida después de escritura real se reconcilia sin duplicados', async () => {
    const order = await buy();
    const original = repository.appendEvent.bind(
      repository,
    ) as OrderAuditsRepository['appendEvent'];
    const spy = jest
      .spyOn(repository, 'appendEvent')
      .mockImplementationOnce(async (id, event) => {
        await original(id, event);
        throw new Error('synthetic lost response');
      });
    await publisher.runOnce();
    spy.mockRestore();
    expect((await rows())[0].estado).toBe('PENDIENTE');
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(1);
    await ds().query(
      'UPDATE pedido_audit_outbox SET proxima_ejecucion = clock_timestamp()',
    );
    await drain();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(1);
    expect((await rows())[0].estado).toBe('PUBLICADO');
  });
  it('concesión vencida recupera el mismo evento; dueño anterior no puede confirmar', async () => {
    await buy();
    const [old] = await store.claim();
    expect(await store.claim()).toHaveLength(0);
    await ds().query(
      "UPDATE pedido_audit_outbox SET concesion_hasta = clock_timestamp() - interval '1 second'",
    );
    const [current] = await store.claim();
    expect(current.evento_id).toBe(old.evento_id);
    expect(current.concesion_id).not.toBe(old.concesion_id);
    await store.published(old);
    expect((await rows())[0].estado).toBe('PUBLICANDO');
    await repository.appendEvent(current.payload.pedidoId, current.payload);
    await store.published(current);
    expect((await rows())[0].estado).toBe('PUBLICADO');
  });
  it('dos publicadores y pedidos distintos conservan orden y unicidad', async () => {
    const first = await buy(),
      second = await buy();
    await preparations().prepare(actors.EMPRENDEDOR, first.idPedido);
    await cancellations().cancel(actors.CLIENTE, second.idPedido);
    const another = new OrderAuditPublisher(new OutboxStore(ds()), repository);
    let active = 0,
      maximum = 0;
    const original = repository.appendEvent.bind(
      repository,
    ) as OrderAuditsRepository['appendEvent'];
    const spy = jest
      .spyOn(repository, 'appendEvent')
      .mockImplementation(async (id, event) => {
        active++;
        maximum = Math.max(maximum, active);
        try {
          await original(id, event);
        } finally {
          active--;
        }
      });
    try {
      for (let n = 0; n < 3; n++)
        await Promise.all([publisher.runOnce(), another.runOnce()]);
      for (const order of [first, second]) {
        const history = (await repository.findByPedidoId(order.idPedido))!;
        expect(
          history.eventos.map((e) => (e as OrderAuditEvent).secuencia),
        ).toEqual([1, 2]);
        expect(
          new Set(history.eventos.map((e) => (e as OrderAuditEvent).eventoId))
            .size,
        ).toBe(2);
      }
      expect((await rows()).every((r) => r.estado === 'PUBLICADO')).toBe(true);
      expect(maximum).toBeGreaterThan(1);
    } finally {
      spy.mockRestore();
    }
  });
  it('creación concurrente del primer documento y reenvío concurrente no duplican', async () => {
    const order = await buy();
    const [row] = await store.claim();
    await Promise.all(
      Array.from({ length: 4 }, () =>
        repository.appendEvent(order.idPedido, row.payload),
      ),
    );
    expect(
      await db
        .collection('bitacora_pedidos')
        .countDocuments({ pedidoId: order.idPedido }),
    ).toBe(1);
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(1);
    await store.published(row);
  });
  it('rechaza secuencia fuera de orden y mismo ID con payload contradictorio', async () => {
    const order = await buy();
    await preparations().prepare(actors.EMPRENDEDOR, order.idPedido);
    const events = await rows();
    await expect(
      repository.appendEvent(order.idPedido, events[1].payload),
    ).rejects.toThrow();
    await repository.appendEvent(order.idPedido, events[0].payload);
    await expect(
      repository.appendEvent(order.idPedido, {
        ...events[0].payload,
        actor: { ...events[0].payload.actor, idUsuario: 999 },
      }),
    ).rejects.toThrow();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(1);
  });
  it('historial legacy se conserva y aprovisionamiento repetido no carga fixtures', async () => {
    const order = await buy();
    const legacy = {
      tipo: 'PEDIDO_CREADO',
      fecha: new Date('2026-01-01T00:00:00Z'),
      detalle: 'Histórico sintético',
    };
    await db
      .collection<OrderAudit>('bitacora_pedidos')
      .insertOne({ pedidoId: order.idPedido, eventos: [legacy] });
    await provisionOrderAudits(db);
    await provisionOrderAudits(db);
    await drain();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos[0],
    ).toEqual(legacy);
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(2);
    expect(await db.collection('bitacora_pedidos').countDocuments()).toBe(1);
  });
  it('cancelaciones simultáneas reponen una vez y generan un evento de cancelación', async () => {
    const order = await buy();
    const results = await Promise.allSettled([
      cancellations().cancel(actors.CLIENTE, order.idPedido),
      cancellations().cancel(actors.CLIENTE, order.idPedido),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await savedProduct()).cantidadDisponible).toBe(100);
    await drain();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos.map(
        (e) => e.tipo,
      ),
    ).toEqual(['PEDIDO_CONFIRMADO', 'PEDIDO_CANCELADO']);
  });
  it('preparación contra cancelación tiene un único ganador y evento coherente', async () => {
    const order = await buy();
    const results = await Promise.allSettled([
      preparations().prepare(actors.EMPRENDEDOR, order.idPedido),
      cancellations().cancel(actors.CLIENTE, order.idPedido),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const saved = await ds()
      .getRepository(Order)
      .findOneByOrFail({ idPedido: order.idPedido });
    await drain();
    const history = (await repository.findByPedidoId(order.idPedido))!;
    expect(history.eventos).toHaveLength(2);
    expect(history.eventos[1].tipo).toBe(
      saved.estado === 'CANCELADO' ? 'PEDIDO_CANCELADO' : 'PEDIDO_PREPARANDO',
    );
  });
  it('JWT, rol y propiedad rechazados no agregan eventos', async () => {
    const order = await buy();
    const jwt = context.app.get(JwtService);
    await request(context.app.getHttpServer())
      .patch(`/api/v1/orders/${order.idPedido}/cancel`)
      .expect(401);
    await request(context.app.getHttpServer())
      .patch(`/api/v1/orders/${order.idPedido}/cancel`)
      .set('Authorization', `Bearer ${jwt.sign(actors.ADMIN)}`)
      .expect(403);
    await expect(
      cancellations().cancel(
        { ...actors.CLIENTE, idUsuario: actors.ADMIN.idUsuario },
        order.idPedido,
      ),
    ).rejects.toThrow();
    await expect(
      deliveries().assignDelivery(
        { idPedido: order.idPedido, idRepartidor: courier.idRepartidor },
        actors.CLIENTE,
      ),
    ).rejects.toThrow();
    expect(await rows()).toHaveLength(1);
  });
  it('FALLIDO bloquea sucesores y recuperación interna no repite la compra', async () => {
    const order = await buy();
    await preparations().prepare(actors.EMPRENDEDOR, order.idPedido);
    const [row] = await store.claim();
    await ds().query(
      'UPDATE pedido_audit_outbox SET intentos = 10 WHERE evento_id=$1',
      [row.evento_id],
    );
    await store.failed(row);
    expect(await store.claim()).toHaveLength(0);
    expect(
      (await store.status()).find((r) => r.estado === 'FALLIDO')!.cantidad,
    ).toBe('1');
    await store.retryFailed(row.evento_id);
    await drain();
    expect((await rows()).every((r) => r.estado === 'PUBLICADO')).toBe(true);
    expect((await savedProduct()).cantidadDisponible).toBe(98);
  });
  it('la contención transitoria del contador espera sin rechazar una preparación válida', async () => {
    const order = await buy();
    const blocker = ds().createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    let done = false;
    let preparing: Promise<unknown> | undefined;
    try {
      // Simulate an emitter finishing with both locks of the previous implementation.
      await blocker.query('SELECT pg_advisory_xact_lock(512, $1)', [
        order.idPedido,
      ]);
      await blocker.query(
        'SELECT pedido_id FROM pedido_audit_sequence WHERE pedido_id=$1 FOR UPDATE',
        [order.idPedido],
      );
      preparing = preparations()
        .prepare(actors.EMPRENDEDOR, order.idPedido)
        .then(
          (value) => {
            done = true;
            return value;
          },
          () => {
            done = true;
            return null;
          },
        );
      const deadline = Date.now() + 2000;
      let waiting = false;
      while (!done && Date.now() < deadline) {
        const locks = await ds().query<{ present: boolean }[]>(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event_type='Lock' AND query LIKE 'INSERT INTO pedido_audit_sequence%'
        ) AS present`);
        if (locks[0].present) {
          waiting = true;
          break;
        }
        // Poll a real observable PostgreSQL lock, not a timing-based assertion.
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
    } finally {
      await blocker.rollbackTransaction();
      await blocker.release();
    }
    await expect(preparing).resolves.toMatchObject({ estado: 'PREPARANDO' });
    await drain();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos.map(
        (e) => (e as OrderAuditEvent).secuencia,
      ),
    ).toEqual([1, 2]);
  });
  it('el escritor conserva un lock_timeout más estricto del llamador', async () => {
    const order = await buy();
    await ds().transaction(async (manager) => {
      await manager.query("SET LOCAL lock_timeout='250ms'");
      await manager
        .getRepository(Order)
        .update(order.idPedido, { estado: 'PREPARANDO' });
      await writeOrderAudit(manager, {
        pedidoId: order.idPedido,
        tipo: 'PEDIDO_PREPARANDO',
        actor: actors.EMPRENDEDOR,
        pedidoAnterior: 'CONFIRMADO',
      });
      const [setting] = await manager.query<{ value: string }[]>(
        "SELECT current_setting('lock_timeout') AS value",
      );
      expect(setting.value).toBe('250ms');
    });
    await drain();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(2);
  });
  it('el publicador libera PostgreSQL antes de Mongo y funciona con pool de una conexión', async () => {
    const order = await buy();
    const options = ds().options;
    if (options.type !== 'postgres')
      throw new Error('Se requiere PostgreSQL temporal.');
    const single = new DataSource({
      ...options,
      poolSize: 1,
      extra: { max: 1, connectionTimeoutMillis: 500 },
    });
    await single.initialize();
    const singleStore = new OutboxStore(single);
    const original = repository.appendEvent.bind(
      repository,
    ) as OrderAuditsRepository['appendEvent'];
    const spy = jest
      .spyOn(repository, 'appendEvent')
      .mockImplementation(async (id, event) => {
        expect(await single.query('SELECT 1 AS available')).toEqual([
          { available: 1 },
        ]);
        await original(id, event);
      });
    try {
      await new OrderAuditPublisher(singleStore, repository).runOnce();
    } finally {
      spy.mockRestore();
      await single.destroy();
    }
    expect((await rows())[0].estado).toBe('PUBLICADO');
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(1);
  });
  it('un publicador vencido termina tarde sin duplicar ni adelantar eventos', async () => {
    const order = await buy();
    await preparations().prepare(actors.EMPRENDEDOR, order.idPedido);
    const [old] = await store.claim();
    await ds().query(
      "UPDATE pedido_audit_outbox SET concesion_hasta=clock_timestamp()-interval '1 second' WHERE evento_id=$1",
      [old.evento_id],
    );
    const [replacement] = await store.claim();
    await repository.appendEvent(order.idPedido, replacement.payload);
    await store.published(replacement);
    await publisher.runOnce();
    await repository.appendEvent(order.idPedido, old.payload);
    await store.failed(old);
    await store.published(old);
    expect((await rows()).every((r) => r.estado === 'PUBLICADO')).toBe(true);
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos.map(
        (e) => (e as OrderAuditEvent).secuencia,
      ),
    ).toEqual([1, 2]);
  });
  it('sin índice global falla cerrado incluso si existe un índice parcial', async () => {
    const order = await buy();
    await db.collection('bitacora_pedidos').dropIndex('uq_bitacora_pedido_id');
    await db.collection('bitacora_pedidos').createIndex(
      { pedidoId: 1 },
      {
        unique: true,
        name: 'indice_parcial',
        partialFilterExpression: { pedidoId: { $gt: 9999 } },
      },
    );
    try {
      await publisher.runOnce();
      expect((await rows())[0].estado).toBe('PENDIENTE');
      expect(await db.collection('bitacora_pedidos').countDocuments()).toBe(0);
    } finally {
      await db.collection('bitacora_pedidos').dropIndex('indice_parcial');
      await provisionOrderAudits(db);
    }
    await ds().query(
      'UPDATE pedido_audit_outbox SET proxima_ejecucion=clock_timestamp()',
    );
    await drain();
    expect(
      (await repository.findByPedidoId(order.idPedido))!.eventos,
    ).toHaveLength(1);
  });
  it('el validador Mongo rechaza campos sensibles y actores contradictorios', async () => {
    await buy();
    const [row] = await store.claim();
    for (const patch of [
      { correo: 'sensitive@example.test' },
      { actor: { idUsuario: actors.ADMIN.idUsuario, rol: 'ADMIN' } },
    ]) {
      await expect(
        db.collection('bitacora_pedidos').insertOne({
          pedidoId: row.payload.pedidoId,
          eventos: [
            { ...row.payload, fecha: new Date(row.payload.fecha), ...patch },
          ],
          ultimaSecuencia: 1,
        }),
      ).rejects.toMatchObject({ code: 121 });
    }
    expect(await db.collection('bitacora_pedidos').countDocuments()).toBe(0);
  });
  it('PostgreSQL rechaza payload nulo o incompatible con sus metadatos', async () => {
    await buy();
    const [row] = await rows();
    for (const [key, value] of [
      ['fecha', null],
      ['tipo', null],
      ['pedidoId', 999],
      ['correo', 'private@example.test'],
    ]) {
      await expect(
        ds().query(
          'UPDATE pedido_audit_outbox SET payload = jsonb_set(payload, ARRAY[$2]::text[], $3::jsonb) WHERE evento_id=$1',
          [row.evento_id, key, JSON.stringify(value)],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    }
    await drain();
    expect((await rows())[0].estado).toBe('PUBLICADO');
  });
});
