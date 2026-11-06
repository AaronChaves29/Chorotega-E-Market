import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { InvalidOrderTransitionException } from '../exceptions/order.exceptions';
import { OrderPreparationService } from './order-preparation.service';

describe('OrderPreparationService', () => {
  const actor = { idUsuario: 8, sub: 'owner@example.test', rol: 'EMPRENDEDOR' };
  let order: Order;
  const query = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(),
  };
  const orders = {
    createQueryBuilder: jest.fn(() => query),
    update: jest.fn(),
  };
  const details = { find: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Order ? orders : details,
    ),
  };
  const transaction = jest.fn((work: (manager: EntityManager) => unknown) =>
    work(manager as unknown as EntityManager),
  );
  const service = new OrderPreparationService({
    transaction,
  } as unknown as DataSource);
  beforeEach(() => {
    jest.clearAllMocks();
    for (const method of [
      query.innerJoin,
      query.where,
      query.andWhere,
      query.setLock,
    ])
      method.mockReturnValue(query);
    order = Object.assign(new Order(), {
      idPedido: 4,
      idTienda: 2,
      estado: 'CONFIRMADO',
      subtotal: '10.00',
      tarifaEnvio: '1.25',
      total: '11.25',
      fechaCreacion: new Date(),
    });
    query.getOne.mockResolvedValue(order);
    orders.update.mockResolvedValue({ affected: 1 });
    details.find.mockResolvedValue([]);
  });
  it('locks the owned order and updates only state, returning the existing DTO', async () => {
    const result = await service.prepare(actor, 4);
    expect(result).toMatchObject({
      idPedido: 4,
      estado: 'PREPARANDO',
      subtotal: '10.00',
      tarifaEnvio: '1.25',
      total: '11.25',
      items: [],
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      'tienda.idEmprendedor = :idEmprendedor',
      { idEmprendedor: 8 },
    );
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write', undefined, [
      'pedido',
    ]);
    expect(orders.update).toHaveBeenCalledWith(
      { idPedido: 4 },
      { estado: 'PREPARANDO' },
    );
    expect(manager.getRepository.mock.calls.map(([entity]) => entity)).toEqual([
      Order,
      OrderDetail,
    ]);
  });
  it.each(['PENDIENTE', 'PREPARANDO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'])(
    'rejects %s without writing',
    async (state) => {
      order.estado = state;
      await expect(service.prepare(actor, 4)).rejects.toBeInstanceOf(
        InvalidOrderTransitionException,
      );
      expect(orders.update).not.toHaveBeenCalled();
    },
  );
  it('does not distinguish a missing order from an unauthorized one', async () => {
    query.getOne.mockResolvedValue(null);
    await expect(service.prepare(actor, 4)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(orders.update).not.toHaveBeenCalled();
  });
  it.each(['CLIENTE', 'REPARTIDOR', 'ADMIN'])(
    'rejects role %s without a transaction',
    async (rol) => {
      await expect(
        service.prepare({ ...actor, rol }, 4),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid identity without a transaction', async () => {
    await expect(
      service.prepare({ ...actor, idUsuario: 0 }, 4),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, 0.5, 2147483648])(
    'rejects invalid id %s without a transaction',
    async (id) => {
      await expect(service.prepare(actor, id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
