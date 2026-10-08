jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));

import type { Request } from 'express';
import { OrdersController } from './orders.controller';
import { OrdersService } from '../services/orders.service';
import { OrdersReadService } from '../services/orders-read.service';
import { OrderSearchQueryDto } from '../dtos/order-search-query.dto';
import { InsufficientOrderStockException } from '../exceptions/order.exceptions';
import { ConflictException } from '@nestjs/common';

describe('OrdersController', () => {
  const business = { createAndConfirm: jest.fn() };
  const reads = {
    search: jest.fn(),
    findById: jest.fn(),
    findDetails: jest.fn(),
    findDetail: jest.fn(),
  };
  const controller = new OrdersController(
    business as unknown as OrdersService,
    reads as unknown as OrdersReadService,
  );
  const user = { idUsuario: 8, sub: 'correo@example.test', rol: 'CLIENTE' };
  const request = { user } as Request & { user: typeof user };
  const dto = {
    idBarrio: 2,
    direccionEntrega: 'Nicoya',
    items: [{ idProducto: 4, cantidad: 2 }],
  };
  beforeEach(() => jest.resetAllMocks());
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
