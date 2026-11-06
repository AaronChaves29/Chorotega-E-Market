import { ConflictException } from '@nestjs/common';
import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../modules/users/entities/user.entity';
import { EntrepreneurRegistrationService } from './entrepreneur-registration.service';

jest.mock('bcrypt');

describe('EntrepreneurRegistrationService', () => {
  const getOne = jest.fn();
  const where = jest.fn(() => ({ getOne }));
  const users = {
    createQueryBuilder: jest.fn(() => ({ where })),
    save: jest.fn(),
  };
  const stores = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === User ? users : stores,
    ),
  };
  const transaction = jest.fn((work: (manager: EntityManager) => unknown) =>
    work(manager as unknown as EntityManager),
  );
  const service = new EntrepreneurRegistrationService({
    transaction,
  } as unknown as DataSource);
  const dto = {
    nombre: 'Ana',
    apellido: 'Personal',
    correo: '  ANA@Example.Test ',
    clave: 'private-password',
    tienda: { nombre: 'Negocio distinto', direccion: 'Nicoya' },
  };
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(bcrypt.hash).mockResolvedValue('hashed-test-marker' as never);
    getOne.mockResolvedValue(null);
    users.save.mockImplementation((user: User) =>
      Promise.resolve({ ...user, idUsuario: 7, fechaCreacion: new Date() }),
    );
    stores.save.mockImplementation((store: Record<string, unknown>) =>
      Promise.resolve({ ...store, idTienda: 9, fechaCreacion: new Date() }),
    );
  });
  it('assigns role and ownership internally and uses existing public mappers', async () => {
    const result = await service.register(dto);
    expect(bcrypt.hash).toHaveBeenCalledWith(dto.clave, 10);
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({
        rol: 'EMPRENDEDOR',
        correo: 'ana@example.test',
        nombre: 'Ana',
        claveHash: 'hashed-test-marker',
      }),
    );
    expect(stores.save).toHaveBeenCalledWith(
      expect.objectContaining({
        idEmprendedor: 7,
        nombre: 'Negocio distinto',
        estado: 'ACTIVA',
      }),
    );
    expect(result).toMatchObject({
      usuario: { idUsuario: 7, rol: 'EMPRENDEDOR' },
      tienda: { idTienda: 9, idEmprendedor: 7 },
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
    expect(stores.save).not.toHaveBeenCalled();
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
    expect(stores.save).not.toHaveBeenCalled();
  });
  it('propagates store failures to the transaction boundary', async () => {
    const failure = new Error('test-store-failure');
    stores.save.mockRejectedValue(failure);
    await expect(service.register(dto)).rejects.toBe(failure);
  });
});
