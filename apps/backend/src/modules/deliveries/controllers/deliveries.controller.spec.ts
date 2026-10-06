import { Test, TestingModule } from '@nestjs/testing';
import { DeliveriesController } from './deliveries.controller';
import { DeliveryResponseDto } from '../dtos/delivery-response.dto';
import { DeliveriesService } from '../services/deliveries.service';

describe('DeliveriesController', () => {
  let controller: DeliveriesController;

  const deliveriesService = {
    assignDelivery: jest.fn(),
    startDelivery: jest.fn(),
    completeDelivery: jest.fn(),
    cancelDelivery: jest.fn(),
    search: jest.fn(),
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
    }).compile();

    controller = module.get<DeliveriesController>(DeliveriesController);
  });

  it('delega la asignación de una entrega al servicio', async () => {
    const input = {
      idPedido: 10,
      idRepartidor: 5,
    };

    const response = {
      idEntrega: 1,
      idPedido: 10,
      idRepartidor: 5,
      estado: 'ASIGNADA',
      fechaAsignacion: new Date(),
      fechaEntrega: null,
    } as DeliveryResponseDto;

    deliveriesService.assignDelivery.mockResolvedValue(response);

    await expect(controller.assignDelivery(input)).resolves.toBe(response);

    expect(deliveriesService.assignDelivery).toHaveBeenCalledTimes(1);
    expect(deliveriesService.assignDelivery).toHaveBeenCalledWith(input);
  });

  it('delega el inicio de una entrega al servicio', async () => {
    const response = {
      idEntrega: 1,
      idPedido: 10,
      idRepartidor: 5,
      estado: 'EN_CAMINO',
      fechaAsignacion: new Date(),
      fechaEntrega: null,
    } as DeliveryResponseDto;

    deliveriesService.startDelivery.mockResolvedValue(response);

    await expect(controller.startDelivery(1)).resolves.toBe(response);

    expect(deliveriesService.startDelivery).toHaveBeenCalledTimes(1);
    expect(deliveriesService.startDelivery).toHaveBeenCalledWith(1);
  });

  it('delega la finalización de una entrega al servicio', async () => {
    const response = {
      idEntrega: 1,
      idPedido: 10,
      idRepartidor: 5,
      estado: 'ENTREGADA',
      fechaAsignacion: new Date(),
      fechaEntrega: new Date(),
    } as DeliveryResponseDto;

    deliveriesService.completeDelivery.mockResolvedValue(response);

    await expect(controller.completeDelivery(1)).resolves.toBe(response);

    expect(deliveriesService.completeDelivery).toHaveBeenCalledTimes(1);
    expect(deliveriesService.completeDelivery).toHaveBeenCalledWith(1);
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

    deliveriesService.search.mockResolvedValue(response);

    await expect(controller.findAll(query)).resolves.toBe(response);

    expect(deliveriesService.search).toHaveBeenCalledTimes(1);
    expect(deliveriesService.search).toHaveBeenCalledWith(query);
  });
});
