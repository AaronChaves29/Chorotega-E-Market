import type { AuthRateLimitOptions } from '../../src/auth/rate-limit/auth-rate-limit.config';

// Las suites de regresión generan cientos de logins como fixtures, no como tráfico real.
// No se desactiva el guard. Las pruebas del límite usan presupuestos pequeños propios.
export function regressionAuthRateLimits(): AuthRateLimitOptions {
  return {
    windowMs: 60_000,
    limits: { login: 10_000, adminLogin: 10_000, register: 10_000 },
  };
}
