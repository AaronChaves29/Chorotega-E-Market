import { CourierResponseDto } from '../dtos/courier-response.dto';
import { CouriersService } from '../services/couriers.service';
import { CouriersController } from './couriers.controller';

describe('CouriersController', () => {
  let controller: CouriersController;

  const couriersService = {
    findAll: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<CouriersService>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new CouriersController(couriersService);
  });

  it('delega la consulta de todos los repartidores al servicio', async () => {
    const response: CourierResponseDto[] = [
      {
        idRepartidor: 1,
        idUsuario: 10,
        medioTransporte: 'MOTO',
        disponibilidad: 'DISPONIBLE',
      },
    ];

    couriersService.findAll.mockResolvedValue(response);

    await expect(controller.findAll()).resolves.toBe(response);

    expect(couriersService.findAll.mock.calls).toHaveLength(1);
  });

  it('delega la consulta de un repartidor por id al servicio', async () => {
    const response: CourierResponseDto = {
      idRepartidor: 1,
      idUsuario: 10,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    };

    couriersService.findById.mockResolvedValue(response);

    await expect(controller.findById(1)).resolves.toBe(response);

    expect(couriersService.findById.mock.calls).toEqual([[1]]);
  });
});
