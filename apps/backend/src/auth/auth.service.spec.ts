import { UnauthorizedException } from '@nestjs/common';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let findByEmailMock: jest.Mock;
  let signAsyncMock: jest.Mock;
  let compareMock: jest.Mock;

  const user = {
    idUsuario: 1,
    correo: 'repartidor@chorotega.test',
    claveHash: 'hash-de-prueba',
    rol: 'REPARTIDOR',
  };

  beforeEach(() => {
    findByEmailMock = jest.fn();
    signAsyncMock = jest.fn();

    const usersRepository = {
      findByEmail: findByEmailMock,
    } as unknown as UsersRepository;

    const jwtService = {
      signAsync: signAsyncMock,
    };

    compareMock = bcrypt.compare as jest.Mock;

    service = new AuthService(usersRepository, jwtService as never);

    jest.clearAllMocks();
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
});
