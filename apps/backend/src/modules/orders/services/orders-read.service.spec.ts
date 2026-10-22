import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrdersReadService } from './orders-read.service';
import { OrdersRepository } from '../repositories/orders.repository';
import { Order } from '../entities/order.entity';
import { OrderSearchQueryDto } from '../dtos/order-search-query.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

describe('Lecturas autorizadas de pedidos', () => {
  const repository = {
    searchVisible: jest.fn(),
    findVisibleWithDetails: jest.fn(),
  };
  const service = new OrdersReadService(
    repository as unknown as OrdersRepository,
  );
  const user = { idUsuario: 4, sub: 'cliente@example.test', rol: 'CLIENTE' };
  const detail = {
    idDetalle: 7,
    idPedido: 1,
    idProducto: 2,
    cantidad: 3,
    precioUnitario: '0.10',
    subtotal: '0.30',
    producto: { interno: 'privado' },
  };
  const order = Object.assign(new Order(), {
    idPedido: 1,
    idCliente: 4,
    idTienda: 3,
    idBarrio: 2,
    estado: 'CONFIRMADO',
    fechaCreacion: new Date(),
    direccionEntrega: 'Nicoya',
    subtotal: '0.30',
    tarifaEnvio: '1.25',
    total: '1.55',
    detalles: [detail],
    cliente: { claveHash: 'privado' },
    tienda: {},
    barrio: {},
    entregas: [],
  });
  beforeEach(() => {
    jest.resetAllMocks();
    repository.findVisibleWithDetails.mockResolvedValue(order);
  });
  it.each(['ADMIN', 'CLIENTE', 'EMPRENDEDOR'])(
    'delega el alcance SQL de %s sin exponer relaciones',
    async (rol) => {
      const result = await service.findById({ ...user, rol }, 1);
      expect(repository.findVisibleWithDetails).toHaveBeenCalledWith(
        1,
        rol === 'ADMIN' ? { rol } : { rol, idUsuario: 4 },
      );
      expect(Object.keys(result).sort()).toEqual(
        [
          'idPedido',
          'idCliente',
          'idTienda',
          'idBarrio',
          'estado',
          'fechaCreacion',
          'direccionEntrega',
          'subtotal',
          'tarifaEnvio',
          'total',
          'items',
        ].sort(),
      );
      expect(result.items).toEqual([
        {
          idDetalle: 7,
          idProducto: 2,
          cantidad: 3,
          precioUnitario: '0.10',
          subtotal: '0.30',
        },
      ]);
      expect(result).not.toBeInstanceOf(Order);
    },
  );
  it('combina filtros con contexto separado y conserva metadatos de página', async () => {
    const query = Object.assign(new OrderSearchQueryDto(), { idCliente: 99 });
    repository.searchVisible.mockResolvedValue({
      content: [order],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    const result = await service.search(user, query);
    expect(repository.searchVisible).toHaveBeenCalledWith(query, {
      rol: 'CLIENTE',
      idUsuario: 4,
    });
    expect(result.content[0].items).toHaveLength(1);
    expect(result).toMatchObject({ totalElements: 1, totalPages: 1 });
  });
  it('ordena detalles por ID y reutiliza el DTO existente', async () => {
    repository.findVisibleWithDetails.mockResolvedValue({
      ...order,
      detalles: [detail, { ...detail, idDetalle: 2 }],
    });
    expect(
      (await service.findDetails(user, 1)).map((d) => d.idDetalle),
    ).toEqual([2, 7]);
  });
  it('consulta detalle con pedido, detalle y alcance juntos', async () => {
    expect((await service.findDetail(user, 1, 7)).idDetalle).toBe(7);
    expect(repository.findVisibleWithDetails).toHaveBeenCalledWith(
      1,
      { rol: 'CLIENTE', idUsuario: 4 },
      7,
    );
  });
  it('devuelve 404 idéntico para pedido ausente o no visible', async () => {
    repository.findVisibleWithDetails.mockResolvedValue(null);
    await expect(service.findById(user, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findDetails(user, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findDetail(user, 1, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('no devuelve un detalle vacío', async () => {
    repository.findVisibleWithDetails.mockResolvedValue({
      ...order,
      detalles: [],
    });
    await expect(service.findDetail(user, 1, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it.each([0, -1, 1.5, 2147483648])(
    'rechaza ID fuera de dominio %s',
    async (id) => {
      await expect(service.findById(user, id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.findDetail(user, 1, id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.findVisibleWithDetails).not.toHaveBeenCalled();
    },
  );
  it('rechaza fechas no representables antes de consultar', async () => {
    await expect(
      service.search(
        user,
        Object.assign(new OrderSearchQueryDto(), { fechaDesde: '20260101' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.searchVisible).not.toHaveBeenCalled();
  });
  it('rechaza un rango de fechas invertido antes de consultar', async () => {
    await expect(
      service.search(
        user,
        Object.assign(new OrderSearchQueryDto(), {
          fechaDesde: '2026-02-02',
          fechaHasta: '2026-02-01',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.searchVisible).not.toHaveBeenCalled();
  });
  it('rechaza rol no autorizado e identidad inválida también fuera de HTTP', async () => {
    await expect(
      service.findById({ ...user, rol: 'REPARTIDOR' }, 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findById({ ...user, idUsuario: 0 }, 1),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('propaga estado persistido inesperado como fallo interno', async () => {
    repository.findVisibleWithDetails.mockResolvedValue({
      ...order,
      estado: 'DESCONOCIDO',
    });
    await expect(service.findById(user, 1)).rejects.toThrow(
      'Estado de pedido persistido no válido.',
    );
  });
  it('transforma IDs y paginación HTTP, conservando fechas y validando el contrato', () => {
    const query = plainToInstance(OrderSearchQueryDto, {
      idCliente: '4',
      idTienda: '3',
      idBarrio: '2',
      page: '1',
      size: '5',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-02',
    });
    expect(
      validateSync(query, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(query).toMatchObject({
      idCliente: 4,
      idTienda: 3,
      idBarrio: 2,
      page: 1,
      size: 5,
    });
  });
});
