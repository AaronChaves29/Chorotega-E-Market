import { NotFoundException } from '@nestjs/common';
import { Neighborhood } from '../entities/neighborhood.entity';
import { NeighborhoodsRepository } from '../repositories/neighborhoods.repository';
import { NeighborhoodsService } from './neighborhoods.service';

describe('NeighborhoodsService', () => {
  let service: NeighborhoodsService;

  const neighborhoodsRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<NeighborhoodsRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new NeighborhoodsService(neighborhoodsRepository);
  });

  it('devuelve todos los barrios como DTOs', async () => {
    const neighborhoods = [
      Object.assign(new Neighborhood(), {
        idBarrio: 1,
        nombre: 'Nicoya centro',
        tarifaEnvio: '1500.00',
        estado: 'ACTIVO',
      }),
      Object.assign(new Neighborhood(), {
        idBarrio: 2,
        nombre: 'Santa Cruz centro',
        tarifaEnvio: '2000.00',
        estado: 'ACTIVO',
      }),
    ];

    neighborhoodsRepository.findAll.mockResolvedValue(neighborhoods);

    const result = await service.findAll();

    expect(result).toEqual([
      {
        idBarrio: 1,
        nombre: 'Nicoya centro',
        tarifaEnvio: '1500.00',
        estado: 'ACTIVO',
      },
      {
        idBarrio: 2,
        nombre: 'Santa Cruz centro',
        tarifaEnvio: '2000.00',
        estado: 'ACTIVO',
      },
    ]);
  });

  it('devuelve un barrio existente por id', async () => {
    const neighborhood = Object.assign(new Neighborhood(), {
      idBarrio: 1,
      nombre: 'Nicoya centro',
      tarifaEnvio: '1500.00',
      estado: 'ACTIVO',
    });

    neighborhoodsRepository.findById.mockResolvedValue(neighborhood);

    const result = await service.findById(1);

    expect(result).toEqual({
      idBarrio: 1,
      nombre: 'Nicoya centro',
      tarifaEnvio: '1500.00',
      estado: 'ACTIVO',
    });
  });

  it('rechaza un barrio inexistente', async () => {
    neighborhoodsRepository.findById.mockResolvedValue(null);

    await expect(service.findById(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
