import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

export function rethrowRegistrationError(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const driver: unknown = error.driverError;
    if (
      typeof driver === 'object' &&
      driver !== null &&
      'code' in driver &&
      'constraint' in driver &&
      driver.code === '23505' &&
      driver.constraint === 'usuario_correo_key'
    ) {
      throw new ConflictException(
        'Ya existe una cuenta con ese correo electrónico.',
      );
    }
  }
  throw error;
}
