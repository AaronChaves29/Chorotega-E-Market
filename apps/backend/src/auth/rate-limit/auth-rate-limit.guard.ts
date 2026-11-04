import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthOperation } from './auth-rate-limit.config';
import { AuthRateLimitService } from './auth-rate-limit.service';

const OPERATION = 'auth-rate-limit-operation';
export const LimitAuthOperation = (operation: AuthOperation) =>
  SetMetadata(OPERATION, operation);

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: AuthRateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const operation = this.reflector.get<AuthOperation>(
      OPERATION,
      context.getHandler(),
    );
    if (!operation)
      throw new Error('Falta la política de límites de autenticación.');
    const result = this.limiter.consume(operation);
    if (result.allowed) return true;
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(result.retryAfter));
    throw new HttpException(
      'Demasiadas solicitudes. Inténtelo más tarde.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
