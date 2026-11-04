import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_RATE_LIMIT_CLOCK,
  AUTH_RATE_LIMIT_OPTIONS,
  type AuthOperation,
  type AuthRateLimitOptions,
} from './auth-rate-limit.config';

@Injectable()
export class AuthRateLimitService {
  private readonly windows = new Map<
    AuthOperation,
    { count: number; resetAt: number }
  >();

  constructor(
    @Inject(AUTH_RATE_LIMIT_OPTIONS)
    private readonly options: AuthRateLimitOptions,
    @Inject(AUTH_RATE_LIMIT_CLOCK) private readonly now: () => number,
  ) {}

  // Tres claves internas como máximo. No se almacenan IP, correo ni credenciales.
  // La reserva es síncrona: no hay await entre comprobar e incrementar.
  consume(
    operation: AuthOperation,
  ): { allowed: true } | { allowed: false; retryAfter: number } {
    const now = this.now();
    let window = this.windows.get(operation);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + this.options.windowMs };
      this.windows.set(operation, window);
    }
    if (window.count >= this.options.limits[operation])
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      };
    window.count++;
    return { allowed: true };
  }
}
