import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import type { DataSource, Repository } from 'typeorm';

import {
  startPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../support/postgres-test-database';

import { Neighborhood } from '../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Order } from '../../src/modules/orders/entities/order.entity';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { OrderDetail } from '../../src/modules/order-details/entities/order-detail.entity';
import { Product } from '../../src/modules/products/entities/product.entity';
import { OrdersRepository } from '../../src/modules/orders/repositories/orders.repository';

describe('Orders integration', () => {
  let database: PostgresTestDatabase | undefined;
  let dataSource: DataSource;

  let userRepository: Repository<User>;
  let storeRepository: Repository<Store>;
  let neighborhoodRepository: Repository<Neighborhood>;
  let orderRepository: Repository<Order>;
  let ordersRepository: OrdersRepository;
  let categoryRepository: Repository<Category>;
  let productRepository: Repository<Product>;
  let orderDetailRepository: Repository<OrderDetail>;

  beforeAll(async () => {
    database = await startPostgresTestDatabase();
    dataSource = database.dataSource;

    userRepository = dataSource.getRepository(User);
    storeRepository = dataSource.getRepository(Store);
    neighborhoodRepository = dataSource.getRepository(Neighborhood);
    orderRepository = dataSource.getRepository(Order);
    ordersRepository = new OrdersRepository(orderRepository);
    categoryRepository = dataSource.getRepository(Category);
    productRepository = dataSource.getRepository(Product);
    orderDetailRepository = dataSource.getRepository(OrderDetail);
  });

  afterEach(async () => {
    if (!database) return;
    // Conserva el esquema y el historial de migraciones del contenedor de pruebas.
    await database.dataSource.query(`
      TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor,
        barrio, producto, categoria, tienda, usuario RESTART IDENTITY
    `);
    expect(
      await database.dataSource.query<{ name: string }[]>(
        'SELECT name FROM typeorm_migrations ORDER BY id',
      ),
    ).toEqual([
      { name: 'CreateInitialSchema1788732000000' },
      { name: 'AlignTimestampDefaults1788998400000' },
    ]);
  });

  afterAll(async () => {
    await database?.stop();
  });

  it('should persist and retrieve an order from PostgreSQL', async () => {
    const entrepreneur = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Emprendedor',
        apellido: 'Prueba',
        correo: 'emprendedor@test.com',
        telefono: '88888888',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      }),
    );

    const customer = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Cliente',
        apellido: 'Prueba',
        correo: 'cliente@test.com',
        telefono: '87777777',
        rol: 'CLIENTE',
        estado: 'ACTIVO',
      }),
    );

    const store = await storeRepository.save(
      storeRepository.create({
        idEmprendedor: entrepreneur.idUsuario,
        nombre: 'Tienda de Prueba',
        descripcion: 'Tienda creada para pruebas de integración',
        direccion: 'Nicoya',
        telefono: '26660000',
        horario: '8:00 - 17:00',
        estado: 'ACTIVA',
      }),
    );

    const neighborhood = await neighborhoodRepository.save(
      neighborhoodRepository.create({
        nombre: 'Barrio Test',
        tarifaEnvio: '1500.00',
        estado: 'ACTIVO',
      }),
    );

    const savedOrder = await orderRepository.save(
      orderRepository.create({
        idCliente: customer.idUsuario,
        idTienda: store.idTienda,
        idBarrio: neighborhood.idBarrio,
        estado: 'PENDIENTE',
        subtotal: '10000.00',
        tarifaEnvio: '1500.00',
        total: '11500.00',
        direccionEntrega: 'Dirección de prueba',
      }),
    );

    const foundOrder = await orderRepository.findOneBy({
      idPedido: savedOrder.idPedido,
    });

    expect(foundOrder).not.toBeNull();

    expect(foundOrder?.idPedido).toBe(savedOrder.idPedido);
    expect(foundOrder?.idCliente).toBe(customer.idUsuario);
    expect(foundOrder?.idTienda).toBe(store.idTienda);
    expect(foundOrder?.idBarrio).toBe(neighborhood.idBarrio);
    expect(foundOrder?.estado).toBe('PENDIENTE');
    expect(foundOrder?.subtotal).toBe('10000.00');
    expect(foundOrder?.tarifaEnvio).toBe('1500.00');
    expect(foundOrder?.total).toBe('11500.00');
    expect(foundOrder?.direccionEntrega).toBe('Dirección de prueba');
  });

  it('should filter orders by status and neighborhood', async () => {
    const suffix = randomUUID();

    const entrepreneur = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Emprendedor',
        apellido: 'Busqueda',
        correo: `emprendedor-${suffix}@test.com`,
        telefono: '88888888',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      }),
    );

    const customer = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Cliente',
        apellido: 'Busqueda',
        correo: `cliente-${suffix}@test.com`,
        telefono: '87777777',
        rol: 'CLIENTE',
        estado: 'ACTIVO',
      }),
    );

    const store = await storeRepository.save(
      storeRepository.create({
        idEmprendedor: entrepreneur.idUsuario,
        nombre: `Tienda ${suffix}`,
        descripcion: 'Tienda para probar búsqueda dinámica',
        direccion: 'Nicoya',
        telefono: '26660000',
        horario: '8:00 - 17:00',
        estado: 'ACTIVA',
      }),
    );

    const neighborhood = await neighborhoodRepository.save(
      neighborhoodRepository.create({
        nombre: `Barrio ${suffix}`,
        tarifaEnvio: '1500.00',
        estado: 'ACTIVO',
      }),
    );

    await orderRepository.save([
      orderRepository.create({
        idCliente: customer.idUsuario,
        idTienda: store.idTienda,
        idBarrio: neighborhood.idBarrio,
        estado: 'PENDIENTE',
        subtotal: '5000.00',
        tarifaEnvio: '1500.00',
        total: '6500.00',
        direccionEntrega: 'Dirección pendiente',
      }),

      orderRepository.create({
        idCliente: customer.idUsuario,
        idTienda: store.idTienda,
        idBarrio: neighborhood.idBarrio,
        estado: 'ENTREGADO',
        subtotal: '10000.00',
        tarifaEnvio: '1500.00',
        total: '11500.00',
        direccionEntrega: 'Dirección entregada',
      }),
    ]);

    const results = await ordersRepository.search({
      estado: 'ENTREGADO',
      idBarrio: neighborhood.idBarrio,
    });

    expect(results).toHaveLength(1);
    expect(results[0].estado).toBe('ENTREGADO');
    expect(results[0].idBarrio).toBe(neighborhood.idBarrio);
    expect(results[0].idCliente).toBe(customer.idUsuario);
    expect(results[0].cliente).toBeDefined();
    expect(results[0].tienda).toBeDefined();
    expect(results[0].barrio).toBeDefined();
  });

  it('should retrieve orders with their details using the optimized query', async () => {
    const suffix = randomUUID();

    const entrepreneur = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Emprendedor',
        apellido: 'Detalle',
        correo: `emprendedor-detalle-${suffix}@test.com`,
        telefono: '88888888',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      }),
    );

    const customer = await userRepository.save(
      userRepository.create({
        authId: randomUUID(),
        nombre: 'Cliente',
        apellido: 'Detalle',
        correo: `cliente-detalle-${suffix}@test.com`,
        telefono: '87777777',
        rol: 'CLIENTE',
        estado: 'ACTIVO',
      }),
    );

    const store = await storeRepository.save(
      storeRepository.create({
        idEmprendedor: entrepreneur.idUsuario,
        nombre: `Tienda Detalle ${suffix}`,
        descripcion: 'Tienda para prueba de pedidos con detalles',
        direccion: 'Nicoya',
        telefono: '26660000',
        horario: '8:00 - 17:00',
        estado: 'ACTIVA',
      }),
    );

    const neighborhood = await neighborhoodRepository.save(
      neighborhoodRepository.create({
        nombre: `Barrio Detalle ${suffix}`,
        tarifaEnvio: '1500.00',
        estado: 'ACTIVO',
      }),
    );

    const category = await categoryRepository.save(
      categoryRepository.create({
        nombre: `Categoria ${suffix}`,
        descripcion: 'Categoría para prueba de integración',
        estado: 'ACTIVA',
      }),
    );

    const product = await productRepository.save(
      productRepository.create({
        idTienda: store.idTienda,
        idCategoria: category.idCategoria,
        nombre: `Producto ${suffix}`,
        descripcion: 'Producto para prueba de integración',
        precio: '4500.00',
        cantidadDisponible: 10,
        estado: 'ACTIVO',
      }),
    );

    const order = await orderRepository.save(
      orderRepository.create({
        idCliente: customer.idUsuario,
        idTienda: store.idTienda,
        idBarrio: neighborhood.idBarrio,
        estado: 'PENDIENTE',
        subtotal: '4500.00',
        tarifaEnvio: '1500.00',
        total: '6000.00',
        direccionEntrega: 'Dirección de prueba con detalle',
      }),
    );

    await orderDetailRepository.save(
      orderDetailRepository.create({
        idPedido: order.idPedido,
        idProducto: product.idProducto,
        cantidad: 1,
        precioUnitario: '4500.00',
        subtotal: '4500.00',
      }),
    );

    const results = await ordersRepository.findAllWithDetails();

    const foundOrder = results.find(
      (result) => result.idPedido === order.idPedido,
    );

    expect(foundOrder).toBeDefined();
    expect(foundOrder?.detalles).toHaveLength(1);
    expect(foundOrder?.detalles[0].idProducto).toBe(product.idProducto);
    expect(foundOrder?.detalles[0].cantidad).toBe(1);
    expect(foundOrder?.detalles[0].precioUnitario).toBe('4500.00');
    expect(foundOrder?.detalles[0].subtotal).toBe('4500.00');
  });
});
