import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

export function assertCatalogWriter(
  actor: AuthenticatedUser,
  roles: readonly string[],
): void {
  if (
    !actor ||
    !Number.isInteger(actor.idUsuario) ||
    actor.idUsuario < 1 ||
    actor.idUsuario > 2_147_483_647
  ) {
    throw new UnauthorizedException('Identidad autenticada requerida.');
  }
  if (!roles.includes(actor.rol)) {
    throw new ForbiddenException(
      'Rol no autorizado para escribir el catálogo.',
    );
  }
}
