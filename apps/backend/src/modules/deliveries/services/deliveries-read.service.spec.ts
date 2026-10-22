import type { DataSource } from 'typeorm';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesRepository } from '../repositories/deliveries.repository';
import { OrdersRepository } from '../../orders/repositories/orders.repository';
import { CouriersRepository } from '../../couriers/repositories/couriers.repository';
import { Delivery } from '../entities/delivery.entity';
import { DeliveryNotFoundException } from '../exceptions/delivery-not-found.exception';
import { DeliveryAccessDeniedException } from '../exceptions/delivery-access-denied.exception';

describe('DeliveriesService: lecturas autorizadas', () => {
  const repository = {
    searchVisible: jest.fn(),
    findVisibleById: jest.fn(),
    search: jest.fn(),
    findById: jest.fn(),
  };
  const service = new DeliveriesService(
    repository as unknown as DeliveriesRepository,
    {} as OrdersRepository,
    {} as CouriersRepository,
    {} as DataSource,
  );
  const filters = {
    page: 0,
    size: 20,
    sortBy: 'idEntrega' as const,
    sortDirection: 'ASC' as const,
  };
  const delivery = Object.assign(new Delivery(), {
    idEntrega: 1,
    idPedido: 2,
    idRepartidor: 3,
    estado: 'ASIGNADA',
    fechaAsignacion: new Date(),
    fechaEntrega: null,
    repartidor: { claveHash: 'privado' },
  });
  const publicKeys = [
    'idEntrega',
    'idPedido',
    'idRepartidor',
    'estado',
    'fechaAsignacion',
    'fechaEntrega',
  ].sort();
  beforeEach(() => jest.resetAllMocks());

  it.each(['ADMIN', 'REPARTIDOR'])(
    'aplica el alcance %s y devuelve solo DTOs',
    async (rol) => {
      const user = { sub: 'test', idUsuario: 42, rol };
      const scope = rol === 'ADMIN' ? { rol } : { rol, idUsuario: 42 };
      repository.searchVisible.mockResolvedValue({
        content: [delivery],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      });
      repository.findVisibleById.mockResolvedValue(delivery);
      const page = await service.searchVisible(filters, user);
      const detail = await service.findVisibleById(1, user);
      expect(repository.searchVisible).toHaveBeenCalledWith(filters, scope);
      expect(repository.findVisibleById).toHaveBeenCalledWith(1, scope);
      expect(Object.keys(page.content[0]).sort()).toEqual(publicKeys);
      expect(Object.keys(detail).sort()).toEqual(publicKeys);
      expect(repository.search).not.toHaveBeenCalled();
      expect(repository.findById).not.toHaveBeenCalled();
    },
  );

  it('conserva la excepción de dominio cuando no hay entrega visible', async () => {
    repository.findVisibleById.mockResolvedValue(null);
    await expect(
      service.findVisibleById(1, {
        sub: 'test',
        idUsuario: 42,
        rol: 'REPARTIDOR',
      }),
    ).rejects.toBeInstanceOf(DeliveryNotFoundException);
  });

  it.each(['CLIENTE', 'EMPRENDEDOR', 'DESCONOCIDO'])(
    'rechaza %s incluso si se invoca sin controlador',
    async (rol) => {
      const user = { sub: 'test', idUsuario: 42, rol };
      await expect(service.searchVisible(filters, user)).rejects.toBeInstanceOf(
        DeliveryAccessDeniedException,
      );
      await expect(service.findVisibleById(1, user)).rejects.toBeInstanceOf(
        DeliveryAccessDeniedException,
      );
      expect(repository.searchVisible).not.toHaveBeenCalled();
      expect(repository.findVisibleById).not.toHaveBeenCalled();
    },
  );
});
