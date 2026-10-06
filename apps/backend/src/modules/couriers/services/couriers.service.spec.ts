import { NotFoundException } from '@nestjs/common';
import { Courier } from '../entities/courier.entity';
import { CouriersRepository } from '../repositories/couriers.repository';
import { CouriersService } from './couriers.service';

describe('CouriersService', () => {
  let service: CouriersService;

  const couriersRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<CouriersRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new CouriersService(couriersRepository);
  });

  it('devuelve todos los repartidores como DTOs', async () => {
    const couriers = [
      Object.assign(new Courier(), {
        idRepartidor: 1,
        idUsuario: 10,
        medioTransporte: 'MOTO',
        disponibilidad: 'DISPONIBLE',
      }),
      Object.assign(new Courier(), {
        idRepartidor: 2,
        idUsuario: 20,
        medioTransporte: 'BICICLETA',
        disponibilidad: 'OCUPADO',
      }),
    ];

    couriersRepository.findAll.mockResolvedValue(couriers);

    const result = await service.findAll();

    expect(result).toEqual([
      {
        idRepartidor: 1,
        idUsuario: 10,
        medioTransporte: 'MOTO',
        disponibilidad: 'DISPONIBLE',
      },
      {
        idRepartidor: 2,
        idUsuario: 20,
        medioTransporte: 'BICICLETA',
        disponibilidad: 'OCUPADO',
      },
    ]);
  });

  it('devuelve un repartidor existente por id', async () => {
    const courier = Object.assign(new Courier(), {
      idRepartidor: 1,
      idUsuario: 10,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    });

    couriersRepository.findById.mockResolvedValue(courier);

    const result = await service.findById(1);

    expect(result).toEqual({
      idRepartidor: 1,
      idUsuario: 10,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    });
  });

  it('rechaza un repartidor inexistente', async () => {
    couriersRepository.findById.mockResolvedValue(null);

    await expect(service.findById(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
