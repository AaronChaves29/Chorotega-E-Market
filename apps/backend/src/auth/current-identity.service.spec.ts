import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import {
  UsersRepository,
  type UserAuthenticationData,
} from '../modules/users/repositories/users.repository';
import { CurrentIdentityService } from './current-identity.service';

describe('Identidad vigente compartida por REST y MVC', () => {
  const jwt = new JwtService({
    secret: randomBytes(32).toString('hex'),
    signOptions: { expiresIn: 3600 },
  });
  const findAuthenticationById = jest.fn<
    Promise<UserAuthenticationData | null>,
    [number]
  >();
  const service = new CurrentIdentityService(jwt, {
    findAuthenticationById,
  } as unknown as UsersRepository);
  const claims = { idUsuario: 7, sub: 'admin@example.test', rol: 'ADMIN' };
  const user = {
    idUsuario: 7,
    correo: 'admin@example.test',
    rol: 'ADMIN',
    estado: 'ACTIVO',
  };

  beforeEach(() => {
    findAuthenticationById.mockReset().mockResolvedValue(user);
  });

  it.each(['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])(
    'usa el rol persistido %s en lugar del rol ADMIN del JWT',
    async (rol) => {
      findAuthenticationById.mockResolvedValue({ ...user, rol });
      const result = await service.authenticate(await jwt.signAsync(claims));
      expect(result).toEqual({ idUsuario: 7, sub: user.correo, rol });
      expect(findAuthenticationById).toHaveBeenCalledTimes(1);
      expect(findAuthenticationById).toHaveBeenCalledWith(7);
    },
  );

  it.each([null, { ...user, estado: 'INACTIVO' }])(
    'rechaza una cuenta eliminada o inactiva',
    async (account) => {
      findAuthenticationById.mockResolvedValue(account);
      await expect(
        service.authenticate(await jwt.signAsync(claims)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it.each([
    {},
    { ...claims, idUsuario: '7' },
    { ...claims, idUsuario: 0 },
    { ...claims, idUsuario: -1 },
    { ...claims, idUsuario: 1.5 },
    { ...claims, idUsuario: 2_147_483_648 },
    { ...claims, idUsuario: '00000000-0000-4000-8000-000000000007' },
    { ...claims, sub: 7 },
    { ...claims, sub: '' },
  ])(
    'rechaza identidad mal formada antes de consultar usuarios: %j',
    async (payload) => {
      await expect(
        service.authenticate(await jwt.signAsync(payload)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(findAuthenticationById).not.toHaveBeenCalled();
    },
  );

  it('rechaza firma inválida y expiración antes de consultar la cuenta', async () => {
    const other = new JwtService({ secret: randomBytes(32).toString('hex') });
    for (const token of [
      'invalid',
      await other.signAsync(claims),
      await jwt.signAsync(claims, { expiresIn: -1 }),
    ])
      await expect(service.authenticate(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    expect(findAuthenticationById).not.toHaveBeenCalled();
  });

  it('no conserva permisos en caché entre solicitudes con el mismo token', async () => {
    const token = await jwt.signAsync(claims);
    expect((await service.authenticate(token)).rol).toBe('ADMIN');
    findAuthenticationById.mockResolvedValue({ ...user, rol: 'CLIENTE' });
    expect((await service.authenticate(token)).rol).toBe('CLIENTE');
    expect(findAuthenticationById).toHaveBeenCalledTimes(2);
  });

  it('no disfraza errores de persistencia como credenciales inválidas', async () => {
    const failure = new Error('Persistencia no disponible');
    findAuthenticationById.mockRejectedValue(failure);
    await expect(
      service.authenticate(await jwt.signAsync(claims)),
    ).rejects.toBe(failure);
  });
});
