import { ConflictException } from '@nestjs/common';
import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../modules/users/entities/user.entity';
import { CourierRegistrationService } from './courier-registration.service';

jest.mock('bcrypt');

describe('CourierRegistrationService', () => {
  const getOne = jest.fn();
  const where = jest.fn(() => ({ getOne }));
  const users = {
    createQueryBuilder: jest.fn(() => ({ where })),
    save: jest.fn(),
  };
  const couriers = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === User ? users : couriers,
    ),
  };
  const transaction = jest.fn((work: (manager: EntityManager) => unknown) =>
    work(manager as unknown as EntityManager),
  );
  const service = new CourierRegistrationService({
    transaction,
  } as unknown as DataSource);
  const dto = {
    nombre: 'Ana',
    apellido: 'Personal',
    correo: '  ANA@Example.Test ',
    clave: 'private-password',
    medioTransporte: 'Bicicleta',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(bcrypt.hash).mockResolvedValue('hashed-test-marker' as never);
    getOne.mockResolvedValue(null);
    users.save.mockImplementation((user: User) =>
      Promise.resolve({ ...user, idUsuario: 7, fechaCreacion: new Date() }),
    );
    couriers.save.mockImplementation((courier: Record<string, unknown>) =>
      Promise.resolve({
        ...courier,
        idRepartidor: 9,
        fechaCreacion: new Date(),
      }),
    );
  });
  it('assigns role and ownership internally and uses existing public mappers', async () => {
    const result = await service.register(dto);
    expect(bcrypt.hash).toHaveBeenCalledWith(dto.clave, 10);
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({
        rol: 'REPARTIDOR',
        correo: 'ana@example.test',
        nombre: 'Ana',
        claveHash: 'hashed-test-marker',
      }),
    );
    expect(couriers.save).toHaveBeenCalledWith(
      expect.objectContaining({
        idUsuario: 7,
        medioTransporte: 'Bicicleta',
        disponibilidad: 'DISPONIBLE',
      }),
    );
    expect(result).toMatchObject({
      usuario: { idUsuario: 7, rol: 'REPARTIDOR' },
      repartidor: { idRepartidor: 9, idUsuario: 7 },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /hashed-test-marker|authId|private-password/,
    );
  });
  it('rejects existing email before either insert', async () => {
    getOne.mockResolvedValue({ idUsuario: 1 });
    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(users.save).not.toHaveBeenCalled();
    expect(couriers.save).not.toHaveBeenCalled();
  });
  it('translates concurrent database uniqueness failures to 409', async () => {
    users.save.mockRejectedValue(
      new QueryFailedError(
        'test insert',
        [],
        Object.assign(new Error(), {
          code: '23505',
          constraint: 'usuario_correo_key',
        }),
      ),
    );
    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(couriers.save).not.toHaveBeenCalled();
  });
  it('propagates courier failures to the transaction boundary', async () => {
    const failure = new Error('test-courier-failure');
    couriers.save.mockRejectedValue(failure);
    await expect(service.register(dto)).rejects.toBe(failure);
  });
});
