import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { OrderCancellationService } from './order-cancellation.service';
import { Order } from '../entities/order.entity';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { Delivery } from '../../deliveries/entities/delivery.entity';
import { InvalidOrderTransitionException } from '../exceptions/order.exceptions';

describe('OrderCancellationService', () => {
  const actor = { idUsuario: 3, sub: 'local@example.test', rol: 'CLIENTE' };
  const orders = { findOne: jest.fn(), update: jest.fn() };
  const lines = { find: jest.fn() };
  const deliveries = { exists: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Order
        ? orders
        : entity === OrderDetail
          ? lines
          : entity === Delivery
            ? deliveries
            : undefined,
    ),
  };
  const transaction = jest.fn((work: (manager: EntityManager) => unknown) =>
    work(manager as unknown as EntityManager),
  );
  const service = new OrderCancellationService({
    transaction,
  } as unknown as DataSource);
  beforeEach(() => {
    jest.clearAllMocks();
    orders.findOne.mockResolvedValue({
      idPedido: 1,
      idCliente: 3,
      estado: 'PENDIENTE',
    });
    lines.find.mockResolvedValue([]);
    deliveries.exists.mockResolvedValue(false);
  });
  it('PENDIENTE sin descuento no restaura inventario; no crea un pendiente artificial', async () => {
    const result = await service.cancel(actor, 1);
    expect(result.estado).toBe('CANCELADO');
    expect(orders.findOne).toHaveBeenCalledWith({
      where: { idPedido: 1, idCliente: 3 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.getRepository.mock.calls.map(([entity]) => entity)).toEqual([
      Order,
      Delivery,
      OrderDetail,
    ]);
    expect(orders.update).toHaveBeenCalledWith(
      { idPedido: 1 },
      { estado: 'CANCELADO' },
    );
  });
  it.each(['ADMIN', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'no acepta %s aunque se invoque el servicio directamente',
    async (rol) => {
      await expect(service.cancel({ ...actor, rol }, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rechaza identidad inválida antes de abrir transacción', async () => {
    await expect(
      service.cancel({ ...actor, idUsuario: 0 }, 1),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, 0.5, 2147483648])('rechaza ID %s', async (id) => {
    await expect(service.cancel(actor, id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });
  it('ajeno e inexistente comparten 404 y no consultan detalles', async () => {
    orders.findOne.mockResolvedValue(null);
    await expect(service.cancel(actor, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(lines.find).not.toHaveBeenCalled();
  });
  it.each(['PREPARANDO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'])(
    'no cambia %s',
    async (estado) => {
      orders.findOne.mockResolvedValue({ estado });
      await expect(service.cancel(actor, 1)).rejects.toBeInstanceOf(
        InvalidOrderTransitionException,
      );
      expect(orders.update).not.toHaveBeenCalled();
    },
  );
});
