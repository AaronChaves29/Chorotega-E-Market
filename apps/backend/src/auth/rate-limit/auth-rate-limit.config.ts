export const AUTH_RATE_LIMIT_OPTIONS = Symbol('AUTH_RATE_LIMIT_OPTIONS');
export const AUTH_RATE_LIMIT_CLOCK = Symbol('AUTH_RATE_LIMIT_CLOCK');
export type AuthOperation = 'login' | 'adminLogin' | 'register';
export interface AuthRateLimitOptions {
  readonly windowMs: number;
  readonly limits: Readonly<Record<AuthOperation, number>>;
}

export function readAuthRateLimitOptions(
  config: Record<string, unknown>,
): AuthRateLimitOptions {
  function positiveInteger(
    name: string,
    fallback: number,
    max: number,
  ): number {
    const input = config[name];
    const value =
      input === undefined
        ? fallback
        : typeof input === 'string' && /^\d+$/.test(input)
          ? Number(input)
          : input;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > max
    )
      throw new Error(`${name} debe ser un entero entre 1 y ${max}.`);
    return value;
  }
  return {
    windowMs: positiveInteger('AUTH_RATE_LIMIT_WINDOW_MS', 60_000, 86_400_000),
    limits: {
      login: positiveInteger('AUTH_LOGIN_MAX_REQUESTS', 60, 1_000_000),
      adminLogin: positiveInteger('ADMIN_LOGIN_MAX_REQUESTS', 20, 1_000_000),
      register: positiveInteger('AUTH_REGISTER_MAX_REQUESTS', 10, 1_000_000),
    },
  };
}
