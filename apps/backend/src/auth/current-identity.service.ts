import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Injectable()
export class CurrentIdentityService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersRepository,
  ) {}

  async authenticate(token: string): Promise<AuthenticatedUser> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('idUsuario' in payload) ||
      typeof payload.idUsuario !== 'number' ||
      !Number.isInteger(payload.idUsuario) ||
      payload.idUsuario < 1 ||
      payload.idUsuario > 2_147_483_647 ||
      !('sub' in payload) ||
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0
    )
      throw new UnauthorizedException('Token inválido o expirado.');

    // idUsuario es la PK persistente; authId es otro UUID y sub es el correo.
    // El rol del token no autoriza: se usa la cuenta vigente en cada solicitud.
    const user = await this.users.findAuthenticationById(payload.idUsuario);
    if (
      !user ||
      user.estado !== 'ACTIVO' ||
      !['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'].includes(user.rol)
    )
      throw new UnauthorizedException('Token inválido o expirado.');

    return { sub: user.correo, idUsuario: user.idUsuario, rol: user.rol };
  }
}
