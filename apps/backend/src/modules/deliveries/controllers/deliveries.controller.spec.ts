import { Test, TestingModule } from '@nestjs/testing';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { DeliveriesController } from './deliveries.controller';
import { DeliveryResponseDto } from '../dtos/delivery-response.dto';
import { DeliveriesService } from '../services/deliveries.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';

describe('DeliveriesController', () => {
  let controller: DeliveriesController;

  const deliveriesService = {
    assignDelivery: jest.fn(),
    startDelivery: jest.fn(),
    completeDelivery: jest.fn(),
    cancelDelivery: jest.fn(),
    searchVisible: jest.fn(),
    findVisibleById: jest.fn(),
  };

  const jwtAuthGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  const rolesGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  const authenticatedRequest = {
    user: {
      sub: 'repartidor@chorotega.test',
      idUsuario: 10,
      rol: 'REPARTIDOR',
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveriesController],
      providers: [
        {
          provide: DeliveriesService,
          useValue: deliveriesService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(rolesGuard)
      .compile();

    controller = module.get<DeliveriesController>(DeliveriesController);
  });

  it('delega la asignación y establece la ubicación del recurso creado', async () => {
    const input = {
      idPedido: 10,
      idRepartidor: 5,
    };

    const delivery = {
      idEntrega: 1,
      idPedido: 10,
      idRepartidor: 5,
      estado: 'ASIGNADA',
      fechaAsignacion: new Date(),
      fechaEntrega: null,
    } as DeliveryResponseDto;

    const httpResponse = {
      location: jest.fn(),
    };

    deliveriesService.assignDelivery.mockResolvedValue(delivery);

    await expect(
      controller.assignDelivery(input, httpResponse as never),
    ).resolves.toBe(delivery);

    expect(deliveriesService.assignDelivery).toHaveBeenCalledTimes(1);
    expect(deliveriesService.assignDelivery).toHaveBeenCalledWith(input);

    expect(httpResponse.location).toHaveBeenCalledTimes(1);
    expect(httpResponse.location).toHaveBeenCalledWith('/api/v1/deliveries/1');
  });

  it('delega el inicio de una entrega con el usuario autenticado', async () => {
    const response = {
      idEntrega: 1,
      idPedido: 10,
      idRepartidor: 5,
      estado: 'EN_CAMINO',
      fechaAsignacion: new Date(),
      fechaEntrega: null,
    } as DeliveryResponseDto;

    deliveriesService.startDelivery.mockResolvedValue(response);

    await expect(
      controller.startDelivery(1, authenticatedRequest as never),
    ).resolves.toBe(response);

    expect(deliveriesService.startDelivery).toHaveBeenCalledTimes(1);
    expect(deliveriesService.startDelivery).toHaveBeenCalledWith(1, 10);
  });

  it('delega la finalización de una entrega con el usuario autenticado', async () => {
    const response = {
      idEntrega: 1,
      idPedido: 10,
      idRepartidor: 5,
      estado: 'ENTREGADA',
      fechaAsignacion: new Date(),
      fechaEntrega: new Date(),
    } as DeliveryResponseDto;

    deliveriesService.completeDelivery.mockResolvedValue(response);

    await expect(
      controller.completeDelivery(1, authenticatedRequest as never),
    ).resolves.toBe(response);

    expect(deliveriesService.completeDelivery).toHaveBeenCalledTimes(1);
    expect(deliveriesService.completeDelivery).toHaveBeenCalledWith(1, 10);
  });

  it('delega la cancelación de una entrega al servicio', async () => {
    const response = {
      idEntrega: 1,
      idPedido: 10,
      idRepartidor: 5,
      estado: 'CANCELADA',
      fechaAsignacion: new Date(),
      fechaEntrega: null,
    } as DeliveryResponseDto;

    deliveriesService.cancelDelivery.mockResolvedValue(response);

    await expect(controller.cancelDelivery(1)).resolves.toBe(response);

    expect(deliveriesService.cancelDelivery).toHaveBeenCalledTimes(1);
    expect(deliveriesService.cancelDelivery).toHaveBeenCalledWith(1);
  });

  it('delega la búsqueda paginada de entregas al servicio', async () => {
    const query = {
      page: 0,
      size: 10,
      sortBy: 'fechaAsignacion' as const,
      sortDirection: 'DESC' as const,
    };

    const response = {
      content: [],
      page: 0,
      size: 10,
      totalElements: 0,
      totalPages: 0,
    };

    deliveriesService.searchVisible.mockResolvedValue(response);

    await expect(
      controller.findAll(query, authenticatedRequest as never),
    ).resolves.toBe(response);

    expect(deliveriesService.searchVisible).toHaveBeenCalledTimes(1);
    expect(deliveriesService.searchVisible).toHaveBeenCalledWith(
      query,
      authenticatedRequest.user,
    );
  });

  it('delega la consulta de una entrega por id al servicio', async () => {
    const delivery = {
      idEntrega: 1,
      idPedido: 10,
      idRepartidor: 5,
      estado: 'ASIGNADA',
      fechaAsignacion: new Date(),
      fechaEntrega: null,
    } as DeliveryResponseDto;

    deliveriesService.findVisibleById.mockResolvedValue(delivery);

    await expect(
      controller.findById(1, authenticatedRequest as never),
    ).resolves.toBe(delivery);

    expect(deliveriesService.findVisibleById).toHaveBeenCalledTimes(1);
    expect(deliveriesService.findVisibleById).toHaveBeenCalledWith(
      1,
      authenticatedRequest.user,
    );
  });
});
