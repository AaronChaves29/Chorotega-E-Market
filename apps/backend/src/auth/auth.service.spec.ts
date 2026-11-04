import { UnauthorizedException } from '@nestjs/common';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../modules/users/entities/user.entity';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let findByEmailMock: jest.Mock;
  let saveMock: jest.Mock<Promise<User>, [User]>;
  let signAsyncMock: jest.Mock;
  let compareMock: jest.Mock;
  let hashMock: jest.Mock;

  const user = {
    idUsuario: 1,
    correo: 'repartidor@chorotega.test',
    claveHash: 'hash-de-prueba',
    rol: 'REPARTIDOR',
    estado: 'ACTIVO',
  };

  beforeEach(() => {
    findByEmailMock = jest.fn();
    saveMock = jest.fn<Promise<User>, [User]>();
    signAsyncMock = jest.fn();

    const usersRepository = {
      findByEmail: findByEmailMock,
      save: saveMock,
    } as unknown as UsersRepository;

    const jwtService = {
      signAsync: signAsyncMock,
    };

    compareMock = bcrypt.compare as jest.Mock;
    hashMock = bcrypt.hash as jest.Mock;

    service = new AuthService(usersRepository, jwtService as never);

    jest.clearAllMocks();
  });

  it('registra un cliente con correo normalizado, UUID y contraseña hasheada', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    findByEmailMock.mockResolvedValue(null);
    hashMock.mockResolvedValue('bcrypt-hash');
    saveMock.mockImplementation((savedUser) =>
      Promise.resolve(
        Object.assign(savedUser, {
          idUsuario: 4,
          estado: 'ACTIVO',
          fechaCreacion: createdAt,
        }),
      ),
    );

    const result = await service.register({
      nombre: 'Ana María',
      apellido: 'De la Cruz',
      correo: '  ANA@Example.Test ',
      clave: 'clave-segura',
    });

    expect(findByEmailMock).toHaveBeenCalledWith('ana@example.test');
    expect(hashMock).toHaveBeenCalledWith('clave-segura', 10);
    const savedUser = saveMock.mock.calls[0][0];
    expect(savedUser).toMatchObject({
      nombre: 'Ana María',
      apellido: 'De la Cruz',
      correo: 'ana@example.test',
      claveHash: 'bcrypt-hash',
      telefono: null,
      rol: 'CLIENTE',
    });
    expect(savedUser.authId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result).toEqual({
      idUsuario: 4,
      nombre: 'Ana María',
      apellido: 'De la Cruz',
      correo: 'ana@example.test',
      telefono: null,
      rol: 'CLIENTE',
      estado: 'ACTIVO',
      fechaCreacion: createdAt,
    });
    expect(result).not.toHaveProperty('clave');
    expect(result).not.toHaveProperty('claveHash');
    expect(result).not.toHaveProperty('authId');
  });

  it('devuelve 409 si ya existe el correo normalizado', async () => {
    findByEmailMock.mockResolvedValue(user);

    await expect(
      service.register({
        nombre: 'Ana',
        apellido: 'Prueba',
        correo: ' ANA@CHOROTEGA.TEST ',
        clave: 'clave-segura',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(findByEmailMock).toHaveBeenCalledWith('ana@chorotega.test');
    expect(hashMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('convierte la colisión de unicidad de correo de PostgreSQL en 409', async () => {
    const duplicateEmail = new QueryFailedError(
      'INSERT INTO usuario ...',
      [],
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'usuario_correo_key',
      }),
    );
    findByEmailMock.mockResolvedValue(null);
    hashMock.mockResolvedValue('bcrypt-hash');
    saveMock.mockRejectedValue(duplicateEmail);

    await expect(
      service.register({
        nombre: 'Ana',
        apellido: 'Prueba',
        correo: 'ana@example.test',
        clave: 'clave-segura',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('debe retornar un JWT cuando las credenciales son correctas', async () => {
    findByEmailMock.mockResolvedValue(user);
    compareMock.mockResolvedValue(true);
    signAsyncMock.mockResolvedValue('jwt-de-prueba');

    const result = await service.login({
      correo: 'repartidor@chorotega.test',
      clave: 'clave-correcta',
    });

    expect(findByEmailMock).toHaveBeenCalledWith('repartidor@chorotega.test');

    expect(compareMock).toHaveBeenCalledWith(
      'clave-correcta',
      'hash-de-prueba',
    );

    expect(signAsyncMock).toHaveBeenCalledWith({
      sub: 'repartidor@chorotega.test',
      idUsuario: 1,
      rol: 'REPARTIDOR',
    });

    expect(result).toEqual({
      token: 'jwt-de-prueba',
      tipo: 'Bearer',
      expiraEnSegundos: 3600,
    });
  });

  it('debe retornar 401 cuando el usuario no existe', async () => {
    findByEmailMock.mockResolvedValue(null);

    await expect(
      service.login({
        correo: 'noexiste@chorotega.test',
        clave: 'cualquier-clave',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(compareMock).not.toHaveBeenCalled();
    expect(signAsyncMock).not.toHaveBeenCalled();
  });

  it('debe retornar 401 cuando el usuario no tiene una clave configurada', async () => {
    findByEmailMock.mockResolvedValue({
      ...user,
      claveHash: null,
    });

    await expect(
      service.login({
        correo: 'repartidor@chorotega.test',
        clave: 'cualquier-clave',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(compareMock).not.toHaveBeenCalled();
    expect(signAsyncMock).not.toHaveBeenCalled();
  });

  it('debe retornar 401 cuando la clave es incorrecta', async () => {
    findByEmailMock.mockResolvedValue(user);
    compareMock.mockResolvedValue(false);

    await expect(
      service.login({
        correo: 'repartidor@chorotega.test',
        clave: 'clave-incorrecta',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(signAsyncMock).not.toHaveBeenCalled();
  });

  it('no emite JWT para una cuenta inactiva con contraseña correcta', async () => {
    findByEmailMock.mockResolvedValue({ ...user, estado: 'INACTIVO' });
    compareMock.mockResolvedValue(true);
    await expect(
      service.login({ correo: user.correo, clave: 'correcta' }),
    ).rejects.toThrow('Credenciales inválidas.');
    expect(signAsyncMock).not.toHaveBeenCalled();
  });

  it.each(['CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'el acceso MVC rechaza %s sin emitir credenciales',
    async (rol) => {
      findByEmailMock.mockResolvedValue({ ...user, rol });
      compareMock.mockResolvedValue(true);
      await expect(
        service.loginAdmin({ correo: user.correo, clave: 'correcta' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(findByEmailMock).toHaveBeenCalledTimes(1);
      expect(signAsyncMock).not.toHaveBeenCalled();
    },
  );

  it('el acceso MVC de ADMIN activo consulta credenciales una sola vez', async () => {
    findByEmailMock.mockResolvedValue({ ...user, rol: 'ADMIN' });
    compareMock.mockResolvedValue(true);
    signAsyncMock.mockResolvedValue('jwt-de-prueba');
    await expect(
      service.loginAdmin({ correo: user.correo, clave: 'correcta' }),
    ).resolves.toMatchObject({
      token: 'jwt-de-prueba',
      tipo: 'Bearer',
      expiraEnSegundos: 3600,
    });
    expect(findByEmailMock).toHaveBeenCalledTimes(1);
    expect(signAsyncMock).toHaveBeenCalledTimes(1);
  });
});
