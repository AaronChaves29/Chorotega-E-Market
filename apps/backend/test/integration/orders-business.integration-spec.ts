import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Category } from '../../src/modules/categories/entities/category.entity';
import { Neighborhood } from '../../src/modules/neighborhoods/entities/neighborhood.entity';
import { OrderDetail } from '../../src/modules/order-details/entities/order-detail.entity';
import { Order } from '../../src/modules/orders/entities/order.entity';
import { InsufficientOrderStockException } from '../../src/modules/orders/exceptions/order.exceptions';
import { OrdersModule } from '../../src/modules/orders/orders.module';
import { OrdersService } from '../../src/modules/orders/services/orders.service';
import { Product } from '../../src/modules/products/entities/product.entity';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import {
  type PostgresTestDatabase,
  startPostgresTestDatabase,
} from '../support/postgres-test-database';

describe('Pedidos: negocio transaccional', () => {
  let database: PostgresTestDatabase | undefined;
  let module: TestingModule | undefined;
  let source: DataSource;
  let service: OrdersService;

  beforeAll(async () => {
    database = await startPostgresTestDatabase();
    source = database.dataSource;
    // El módulo real resuelve sus proveedores usando exclusivamente el DataSource temporal.
    module = await Test.createTestingModule({ imports: [OrdersModule] })
      .useMocker((token) => (token === DataSource ? source : undefined))
      .compile();
    service = module.get(OrdersService);
  });

  afterEach(async () => {
    if (!database) return;
    await source.query(
      'DROP TRIGGER IF EXISTS trg_order_confirmation_failure ON pedido',
    );
    await source.query('DROP FUNCTION IF EXISTS fail_order_confirmation()');
    await source.query(`TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor,
      barrio, producto, categoria, tienda, usuario RESTART IDENTITY`);
  });

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      await database?.stop();
    }
  });

  async function fixture(stock = 5) {
    const users = source.getRepository(User);
    const buyer = await users.save(
      users.create({
        authId: randomUUID(),
        nombre: 'Comprador',
        apellido: 'Prueba',
        correo: 'pedido@example.test',
        rol: 'EMPRENDEDOR',
        estado: 'ACTIVO',
      }),
    );
    const stores = source.getRepository(Store);
    const store = await stores.save(
      stores.create({
        idEmprendedor: buyer.idUsuario,
        nombre: 'Tienda',
        direccion: 'Nicoya',
        estado: 'ACTIVA',
      }),
    );
    const categories = source.getRepository(Category);
    const category = await categories.save(
      categories.create({ nombre: 'Categoría de prueba', estado: 'ACTIVA' }),
    );
    const neighborhoods = source.getRepository(Neighborhood);
    const neighborhood = await neighborhoods.save(
      neighborhoods.create({
        nombre: 'Barrio de prueba',
        tarifaEnvio: '1.25',
        estado: 'ACTIVO',
      }),
    );
    const products = source.getRepository(Product);
    const product = await products.save(
      products.create({
        idTienda: store.idTienda,
        idCategoria: category.idCategoria,
        nombre: 'Producto de prueba',
        precio: '0.10',
        cantidadDisponible: stock,
        estado: 'ACTIVO',
      }),
    );
    const input = {
      idBarrio: neighborhood.idBarrio,
      direccionEntrega: 'Nicoya, dirección de prueba',
      items: [{ idProducto: product.idProducto, cantidad: 1 }],
    };
    return { buyer, neighborhood, product, input };
  }

  it('confirma, descuenta inventario y conserva precio y tarifa históricos', async () => {
    const { buyer, product, neighborhood, input } = await fixture();
    input.items[0].cantidad = 3;
    const result = await service.createAndConfirm(buyer.idUsuario, input);
    const orders = source.getRepository(Order);
    const details = source.getRepository(OrderDetail);
    expect(
      await orders.findOneByOrFail({ idPedido: result.idPedido }),
    ).toMatchObject({
      estado: 'CONFIRMADO',
      subtotal: '0.30',
      tarifaEnvio: '1.25',
      total: '1.55',
    });
    expect(
      await source
        .getRepository(Product)
        .findOneByOrFail({ idProducto: product.idProducto }),
    ).toMatchObject({ cantidadDisponible: 2 });
    await source
      .getRepository(Product)
      .update(product.idProducto, { precio: '99.00' });
    await source
      .getRepository(Neighborhood)
      .update(neighborhood.idBarrio, { tarifaEnvio: '80.00' });
    expect(
      await details.findOneByOrFail({ idPedido: result.idPedido }),
    ).toMatchObject({ cantidad: 3, precioUnitario: '0.10', subtotal: '0.30' });
    expect(
      await orders.findOneByOrFail({ idPedido: result.idPedido }),
    ).toMatchObject({ tarifaEnvio: '1.25', total: '1.55' });
    expect(result.items[0].precioUnitario).toBe('0.10');
  });

  it('revierte pedido, detalles e inventario tras fallar después de escrituras reales', async () => {
    const { buyer, product, input } = await fixture();
    await source.query(`
      CREATE FUNCTION fail_order_confirmation() RETURNS trigger AS $$
      BEGIN
        IF NEW.estado = 'CONFIRMADO' THEN
          IF NOT EXISTS (SELECT 1 FROM detalle_pedido WHERE id_pedido = NEW.id_pedido)
            OR NOT EXISTS (
              SELECT 1 FROM detalle_pedido d JOIN producto p USING (id_producto)
              WHERE d.id_pedido = NEW.id_pedido AND p.cantidad_disponible = 4
            ) THEN
            RAISE EXCEPTION 'No se ejecutaron las escrituras previas esperadas';
          END IF;
          RAISE EXCEPTION 'Fallo controlado después de detalle e inventario';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_order_confirmation_failure BEFORE UPDATE ON pedido
      FOR EACH ROW EXECUTE FUNCTION fail_order_confirmation();
    `);
    await expect(
      service.createAndConfirm(buyer.idUsuario, input),
    ).rejects.toThrow('Fallo controlado después de detalle e inventario');
    expect(await source.getRepository(Order).count()).toBe(0);
    expect(await source.getRepository(OrderDetail).count()).toBe(0);
    expect(
      await source
        .getRepository(Product)
        .findOneByOrFail({ idProducto: product.idProducto }),
    ).toMatchObject({ cantidadDisponible: 5 });
  });

  it('solo una de dos compras concurrentes obtiene la última unidad', async () => {
    const { buyer, product, input } = await fixture(1);
    const users = source.getRepository(User);
    const otherBuyer = await users.save(
      users.create({
        authId: randomUUID(),
        nombre: 'Segundo',
        apellido: 'Comprador',
        correo: 'segundo@example.test',
        rol: 'CLIENTE',
        estado: 'ACTIVO',
      }),
    );
    // Ambas compras arrancan juntas; el bloqueo serializa la lectura y descuento del producto.
    const results = await Promise.allSettled([
      service.createAndConfirm(buyer.idUsuario, input),
      service.createAndConfirm(otherBuyer.idUsuario, input),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.reason).toBeInstanceOf(InsufficientOrderStockException);
    expect(
      await source.getRepository(Order).countBy({ estado: 'CONFIRMADO' }),
    ).toBe(1);
    expect(await source.getRepository(OrderDetail).count()).toBe(1);
    expect(
      await source
        .getRepository(Product)
        .findOneByOrFail({ idProducto: product.idProducto }),
    ).toMatchObject({ cantidadDisponible: 0 });
  });
});
