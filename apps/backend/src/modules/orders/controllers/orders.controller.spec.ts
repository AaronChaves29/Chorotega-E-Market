jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));

import type { Request } from 'express';
import { OrdersController } from './orders.controller';
import { OrdersService } from '../services/orders.service';
import { OrdersReadService } from '../services/orders-read.service';
import { OrderPreparationService } from '../services/order-preparation.service';
import { OrderSearchQueryDto } from '../dtos/order-search-query.dto';
import {
  InsufficientOrderStockException,
  InvalidOrderTransitionException,
} from '../exceptions/order.exceptions';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('OrdersController', () => {
  const business = { createAndConfirm: jest.fn() };
  const preparation = { prepare: jest.fn() };
  const reads = {
    search: jest.fn(),
    findById: jest.fn(),
    findDetails: jest.fn(),
    findDetail: jest.fn(),
  };
  const controller = new OrdersController(
    business as unknown as OrdersService,
    reads as unknown as OrdersReadService,
    preparation as unknown as OrderPreparationService,
  );
  const user = { idUsuario: 8, sub: 'correo@example.test', rol: 'CLIENTE' };
  const request = { user } as Request & { user: typeof user };
  const dto = {
    idBarrio: 2,
    direccionEntrega: 'Nicoya',
    items: [{ idProducto: 4, cantidad: 2 }],
  };
  beforeEach(() => jest.resetAllMocks());
  it('delegates preparation with the trusted actor and fixed action', async () => {
    const result = { idPedido: 19, estado: 'PREPARANDO' };
    preparation.prepare.mockResolvedValue(result);
    expect(await controller.prepare(request, 19, undefined)).toBe(result);
    expect(preparation.prepare).toHaveBeenCalledWith(user, 19);
  });
  it('maps incompatible preparation to HTTP 409', async () => {
    preparation.prepare.mockRejectedValue(
      new InvalidOrderTransitionException('PREPARANDO', 'PREPARANDO'),
    );
    await expect(controller.prepare(request, 19, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it.each([{ estado: 'PREPARANDO' }, null, [], 'PREPARANDO'])(
    'rejects body %j before preparing',
    async (body) => {
      await expect(
        controller.prepare(request, 19, body),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(preparation.prepare).not.toHaveBeenCalled();
    },
  );
  it('usa idUsuario del JWT y Location del resultado sin recalcular la compra', async () => {
    const result = { idPedido: 19, total: '1.20' };
    business.createAndConfirm.mockResolvedValue(result);
    const response = { location: jest.fn() };
    expect(await controller.create(request, dto, response)).toBe(result);
    expect(business.createAndConfirm).toHaveBeenCalledWith(8, dto);
    expect(response.location).toHaveBeenCalledWith('/api/v1/orders/19');
  });
  it('traduce el fallo de dominio sin establecer Location', async () => {
    business.createAndConfirm.mockRejectedValue(
      new InsufficientOrderStockException(4),
    );
    const response = { location: jest.fn() };
    await expect(
      controller.create(request, dto, response),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(response.location).not.toHaveBeenCalled();
  });
  it('conserva identidad y parámetros al delegar las cuatro lecturas', async () => {
    const query = new OrderSearchQueryDto();
    await controller.findAll(request, query);
    await controller.findById(request, 1);
    await controller.findDetails(request, 1);
    await controller.findDetail(request, 1, 3);
    expect(reads.search).toHaveBeenCalledWith(user, query);
    expect(reads.findById).toHaveBeenCalledWith(user, 1);
    expect(reads.findDetails).toHaveBeenCalledWith(user, 1);
    expect(reads.findDetail).toHaveBeenCalledWith(user, 1, 3);
  });
});
