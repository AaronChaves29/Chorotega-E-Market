import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Neighborhood } from '../../neighborhoods/entities/neighborhood.entity';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { Product } from '../../products/entities/product.entity';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { CreateOrderDto } from '../dtos/create-order.dto';
import {
  OrderItemResponseDto,
  OrderResponseDto,
} from '../dtos/order-response.dto';
import { Order } from '../entities/order.entity';
import * as errors from '../exceptions/order.exceptions';
import type {
  OrderTransactionRepositories,
  OrderTransactionRunner,
} from '../transactions/order-transaction';
import { OrdersService } from './orders.service';

type Repositories = {
  [K in keyof OrderTransactionRepositories]: jest.Mocked<
    OrderTransactionRepositories[K]
  >;
};

describe('OrdersService: crear y confirmar', () => {
  let repositories: Repositories;
  let service: OrdersService;
  let runner: OrderTransactionRunner;
  let run: jest.SpiedFunction<OrderTransactionRunner['run']>;
  let input: CreateOrderDto;
  let products: Product[];
  let buyer: User;
  let neighborhood: Neighborhood;
  let store: Store;

  beforeEach(() => {
    buyer = Object.assign(new User(), {
      idUsuario: 1,
      estado: 'ACTIVO',
      rol: 'EMPRENDEDOR',
    });
    neighborhood = Object.assign(new Neighborhood(), {
      idBarrio: 2,
      estado: 'ACTIVO',
      tarifaEnvio: '0.15',
    });
    store = Object.assign(new Store(), { idTienda: 3, estado: 'ACTIVA' });
    products = [
      Object.assign(new Product(), {
        idProducto: 4,
        idTienda: 3,
        estado: 'ACTIVO',
        cantidadDisponible: 5,
        precio: '0.10',
      }),
      Object.assign(new Product(), {
        idProducto: 5,
        idTienda: 3,
        estado: 'ACTIVO',
        cantidadDisponible: 2,
        precio: '0.20',
      }),
    ];
    input = {
      idBarrio: 2,
      direccionEntrega: '  Nicoya, dirección de prueba  ',
      items: [
        { idProducto: 4, cantidad: 3 },
        { idProducto: 5, cantidad: 2 },
      ],
    };
    let detailId = 0;
    repositories = {
      users: {
        findById: jest
          .fn<OrderTransactionRepositories['users']['findById']>()
          .mockResolvedValue(buyer),
      },
      neighborhoods: {
        findById: jest
          .fn<OrderTransactionRepositories['neighborhoods']['findById']>()
          .mockResolvedValue(neighborhood),
      },
      stores: {
        findById: jest
          .fn<OrderTransactionRepositories['stores']['findById']>()
          .mockResolvedValue(store),
      },
      products: {
        findByIdsForUpdate: jest
          .fn<OrderTransactionRepositories['products']['findByIdsForUpdate']>()
          .mockResolvedValue(products),
        save: jest
          .fn<OrderTransactionRepositories['products']['save']>()
          .mockImplementation((product) => Promise.resolve(product)),
      },
      orders: {
        save: jest
          .fn<OrderTransactionRepositories['orders']['save']>()
          .mockImplementation((order) =>
            Promise.resolve(
              Object.assign(new Order(), order, {
                idPedido: 10,
                fechaCreacion: new Date('2026-09-22T12:00:00Z'),
              }),
            ),
          ),
      },
      details: {
        save: jest
          .fn<OrderTransactionRepositories['details']['save']>()
          .mockImplementation((detail) =>
            Promise.resolve(
              Object.assign(new OrderDetail(), detail, {
                idDetalle: ++detailId,
              }),
            ),
          ),
      },
    };
    runner = { run: (work) => work(repositories) };
    run = jest.spyOn(runner, 'run');
    service = new OrdersService(runner);
  });

  function expectNoWrites() {
    expect(repositories.orders.save).not.toHaveBeenCalled();
    expect(repositories.details.save).not.toHaveBeenCalled();
    expect(repositories.products.save).not.toHaveBeenCalled();
  }

  it('confirma varias líneas, calcula con datos del servidor y devuelve DTOs sin entidades', async () => {
    const response = await service.createAndConfirm(1, input);
    expect(response).toBeInstanceOf(OrderResponseDto);
    expect(response).not.toBeInstanceOf(Order);
    expect(response).toMatchObject({
      idPedido: 10,
      idCliente: 1,
      idTienda: 3,
      idBarrio: 2,
      estado: 'CONFIRMADO',
      subtotal: '0.70',
      tarifaEnvio: '0.15',
      total: '0.85',
      direccionEntrega: 'Nicoya, dirección de prueba',
    });
    expect(
      response.items.map((item) => [item.precioUnitario, item.subtotal]),
    ).toEqual([
      ['0.10', '0.30'],
      ['0.20', '0.40'],
    ]);
    for (const item of response.items) {
      expect(item).toBeInstanceOf(OrderItemResponseDto);
      expect(item).not.toBeInstanceOf(OrderDetail);
      expect(item).not.toHaveProperty('producto');
      expect(item).not.toHaveProperty('pedido');
    }
    expect(response).not.toHaveProperty('cliente');
    expect(response).not.toHaveProperty('detalles');
    expect(run).toHaveBeenCalledTimes(1);
    expect(repositories.products.findByIdsForUpdate).toHaveBeenCalledWith([
      4, 5,
    ]);
    expect(repositories.orders.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ estado: 'PENDIENTE' }),
    );
    expect(repositories.orders.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ estado: 'CONFIRMADO' }),
    );
    expect(products.map((product) => product.cantidadDisponible)).toEqual([
      2, 0,
    ]);
    expect(repositories.details.save).toHaveBeenCalledTimes(2);
    // El precio histórico del detalle y del DTO no depende de cambios posteriores.
    products[0].precio = '99.99';
    neighborhood.tarifaEnvio = '50.00';
    expect(response.items[0].precioUnitario).toBe('0.10');
    expect(repositories.details.save.mock.calls[0][0].precioUnitario).toBe(
      '0.10',
    );
    expect(response.tarifaEnvio).toBe('0.15');
  });

  it.each([
    { items: [] },
    { items: [{ idProducto: 4, cantidad: 0 }] },
    { items: [{ idProducto: 4, cantidad: -1 }] },
    { items: [{ idProducto: 4, cantidad: 1.5 }] },
    { items: [{ idProducto: 4, cantidad: 2_147_483_648 }] },
    { direccionEntrega: '   ' },
    { direccionEntrega: 'a'.repeat(256) },
    { idBarrio: 0 },
    { precio: '0.01' },
    { subtotal: '0.01' },
    { tarifa: '0.00' },
    { total: '0.01' },
    { estado: 'CONFIRMADO' },
    { items: [{ idProducto: 4, cantidad: 1, precio: '0.01' }] },
  ])(
    'rechaza formato o campos ajenos antes de iniciar la transacción: %j',
    async (invalid) => {
      await expect(
        service.createAndConfirm(1, { ...input, ...invalid }),
      ).rejects.toThrow(errors.InvalidOrderInputException);
      expect(run).not.toHaveBeenCalled();
      expectNoWrites();
    },
  );

  it.each([null, [], { items: [[]] }, { items: [null] }, { items: [42] }])(
    'rechaza estructuras inválidas en ejecución: %j',
    async (invalid) => {
      const candidate =
        invalid === null || Array.isArray(invalid)
          ? invalid
          : { ...input, ...invalid };
      await expect(
        service.createAndConfirm(1, candidate as unknown as CreateOrderDto),
      ).rejects.toThrow(errors.InvalidOrderInputException);
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('rechaza productos repetidos sin sumar cantidades', async () => {
    input.items.push({ idProducto: 4, cantidad: 1 });
    await expect(service.createAndConfirm(1, input)).rejects.toThrow(
      errors.DuplicateOrderProductException,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('rechaza identificador de comprador inválido', async () => {
    await expect(service.createAndConfirm(0, input)).rejects.toThrow(
      errors.InvalidOrderInputException,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'comprador inexistente',
      setup: () => {
        repositories.users.findById.mockResolvedValue(null);
      },
      error: errors.BuyerUnavailableException,
    },
    {
      name: 'comprador inactivo',
      setup: () => {
        buyer.estado = 'INACTIVO';
      },
      error: errors.BuyerUnavailableException,
    },
    {
      name: 'barrio inexistente',
      setup: () => {
        repositories.neighborhoods.findById.mockResolvedValue(null);
      },
      error: errors.OrderNeighborhoodUnavailableException,
    },
    {
      name: 'barrio inactivo',
      setup: () => {
        neighborhood.estado = 'INACTIVO';
      },
      error: errors.OrderNeighborhoodUnavailableException,
    },
    {
      name: 'producto inexistente',
      setup: () => {
        products.pop();
      },
      error: errors.OrderProductNotFoundException,
    },
    {
      name: 'producto inactivo',
      setup: () => {
        products[0].estado = 'INACTIVO';
      },
      error: errors.OrderProductInactiveException,
    },
    {
      name: 'inventario insuficiente',
      setup: () => {
        products[0].cantidadDisponible = 2;
      },
      error: errors.InsufficientOrderStockException,
    },
    {
      name: 'tiendas diferentes',
      setup: () => {
        products[1].idTienda = 9;
      },
      error: errors.MixedOrderStoresException,
    },
    {
      name: 'tienda inexistente',
      setup: () => {
        repositories.stores.findById.mockResolvedValue(null);
      },
      error: errors.OrderStoreUnavailableException,
    },
    {
      name: 'tienda inactiva',
      setup: () => {
        store.estado = 'INACTIVA';
      },
      error: errors.OrderStoreUnavailableException,
    },
    {
      name: 'precio cero',
      setup: () => {
        products[0].precio = '0.00';
      },
      error: errors.InvalidOrderAmountException,
    },
    {
      name: 'tarifa inválida',
      setup: () => {
        neighborhood.tarifaEnvio = '-1.00';
      },
      error: errors.InvalidOrderAmountException,
    },
    {
      name: 'total fuera de numeric(10,2)',
      setup: () => {
        neighborhood.tarifaEnvio = '99999999.99';
      },
      error: errors.InvalidOrderAmountException,
    },
  ])('rechaza $name sin escrituras', async ({ setup, error }) => {
    setup();
    await expect(service.createAndConfirm(1, input)).rejects.toThrow(error);
    expectNoWrites();
  });

  it('propaga el fallo de persistencia a la frontera transaccional', async () => {
    const failure = new Error('fallo al guardar detalle');
    repositories.details.save.mockRejectedValue(failure);
    await expect(service.createAndConfirm(1, input)).rejects.toBe(failure);
    expect(repositories.products.save).not.toHaveBeenCalled();
    expect(repositories.orders.save).toHaveBeenCalledTimes(1);
  });
});
