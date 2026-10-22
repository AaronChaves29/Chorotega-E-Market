import { NeighborhoodResponseDto } from '../dtos/neighborhood-response.dto';
import { NeighborhoodsService } from '../services/neighborhoods.service';
import { NeighborhoodsController } from './neighborhoods.controller';

describe('NeighborhoodsController', () => {
  let controller: NeighborhoodsController;

  const neighborhoodsService = {
    findAll: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<NeighborhoodsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new NeighborhoodsController(neighborhoodsService);
  });

  it('delega la consulta de todos los barrios al servicio', async () => {
    const response: NeighborhoodResponseDto[] = [
      {
        idBarrio: 1,
        nombre: 'Nicoya centro',
        tarifaEnvio: '1500.00',
        estado: 'ACTIVO',
      },
    ];

    neighborhoodsService.findAll.mockResolvedValue(response);

    await expect(controller.findAll()).resolves.toBe(response);

    expect(neighborhoodsService.findAll.mock.calls).toHaveLength(1);
  });

  it('delega la consulta de un barrio por id al servicio', async () => {
    const response: NeighborhoodResponseDto = {
      idBarrio: 1,
      nombre: 'Nicoya centro',
      tarifaEnvio: '1500.00',
      estado: 'ACTIVO',
    };

    neighborhoodsService.findById.mockResolvedValue(response);

    await expect(controller.findById(1)).resolves.toBe(response);

    expect(neighborhoodsService.findById.mock.calls).toEqual([[1]]);
  });
});
