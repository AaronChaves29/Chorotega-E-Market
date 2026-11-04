import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  readAuthRateLimitOptions,
  type AuthOperation,
  type AuthRateLimitOptions,
} from './auth-rate-limit.config';
import { AuthRateLimitModule } from './auth-rate-limit.module';
import { AuthRateLimitService } from './auth-rate-limit.service';

describe('Presupuesto de autenticación por operación e instancia', () => {
  let now: number;
  let service: AuthRateLimitService;
  const options: AuthRateLimitOptions = {
    windowMs: 2500,
    limits: { login: 2, adminLogin: 2, register: 1 },
  };
  beforeEach(() => {
    now = 0;
    service = new AuthRateLimitService(options, () => now);
  });

  it.each<AuthOperation>(['login', 'adminLogin', 'register'])(
    'permite exactamente el límite de %s',
    (operation) => {
      for (let i = 0; i < options.limits[operation]; i++)
        expect(service.consume(operation)).toEqual({ allowed: true });
      expect(service.consume(operation)).toEqual({
        allowed: false,
        retryAfter: 3,
      });
    },
  );

  it('redondea Retry-After y recupera la ventana sin prolongarla por rechazos', () => {
    service.consume('login');
    service.consume('login');
    now = 2499;
    for (let i = 0; i < 20; i++)
      expect(service.consume('login')).toEqual({
        allowed: false,
        retryAfter: 1,
      });
    now = 2500;
    expect(service.consume('login')).toEqual({ allowed: true });
    expect(service.consume('login')).toEqual({ allowed: true });
    expect(service.consume('login')).toEqual({ allowed: false, retryAfter: 3 });
  });

  it('agotar una operación no consume las otras ni prolonga sus ventanas', () => {
    service.consume('login');
    service.consume('login');
    expect(service.consume('login').allowed).toBe(false);
    expect(service.consume('adminLogin').allowed).toBe(true);
    expect(service.consume('register').allowed).toBe(true);
  });

  it('cada instancia tiene su propio presupuesto; no es un almacén distribuido', () => {
    service.consume('register');
    expect(service.consume('register').allowed).toBe(false);
    const other = new AuthRateLimitService(options, () => now);
    expect(other.consume('register').allowed).toBe(true);
  });

  it('reserva síncronamente el presupuesto antes del trabajo asíncrono', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        Promise.resolve().then(() => service.consume('login')),
      ),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(2);
    expect(results.filter((result) => !result.allowed)).toHaveLength(8);
  });
});

describe('Configuración de límites sin secretos', () => {
  it('tiene límites finitos positivos sin depender de NODE_ENV', () => {
    expect(readAuthRateLimitOptions({})).toEqual({
      windowMs: 60_000,
      limits: { login: 60, adminLogin: 20, register: 10 },
    });
  });
  it('permite configurar cada operación y la ventana', () => {
    expect(
      readAuthRateLimitOptions({
        AUTH_RATE_LIMIT_WINDOW_MS: '2500',
        AUTH_LOGIN_MAX_REQUESTS: '2',
        ADMIN_LOGIN_MAX_REQUESTS: '3',
        AUTH_REGISTER_MAX_REQUESTS: '4',
      }),
    ).toEqual({
      windowMs: 2500,
      limits: { login: 2, adminLogin: 3, register: 4 },
    });
  });
  it.each([
    ['AUTH_LOGIN_MAX_REQUESTS', 0],
    ['ADMIN_LOGIN_MAX_REQUESTS', '-1'],
    ['AUTH_REGISTER_MAX_REQUESTS', '1.5'],
    ['AUTH_RATE_LIMIT_WINDOW_MS', ''],
    ['AUTH_RATE_LIMIT_WINDOW_MS', 86_400_001],
    ['AUTH_REGISTER_MAX_REQUESTS', 1_000_001],
    ['AUTH_LOGIN_MAX_REQUESTS', null],
    ['AUTH_LOGIN_MAX_REQUESTS', Infinity],
    ['AUTH_LOGIN_MAX_REQUESTS', 'private-invalid-marker'],
  ])('rechaza %s inválido sin imprimir el valor', (key, value) => {
    expect(() => readAuthRateLimitOptions({ [key]: value })).toThrow(
      String(key),
    );
    try {
      readAuthRateLimitOptions({ [key]: value });
    } catch (error) {
      expect((error as Error).message.includes('private-invalid-marker')).toBe(
        false,
      );
    }
  });

  it('Nest usa la configuración de aplicación para el presupuesto', async () => {
    const module = await Test.createTestingModule({
      imports: [AuthRateLimitModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          (({ AUTH_LOGIN_MAX_REQUESTS: '1' }) as Record<string, string>)[key],
      })
      .compile();
    try {
      const limiter = module.get(AuthRateLimitService);
      expect(limiter.consume('login').allowed).toBe(true);
      expect(limiter.consume('login').allowed).toBe(false);
    } finally {
      await module.close();
    }
  });
  it('una configuración inválida impide crear el módulo', async () => {
    await expect(
      Test.createTestingModule({ imports: [AuthRateLimitModule] })
        .overrideProvider(ConfigService)
        .useValue({
          get: (key: string) =>
            key === 'AUTH_LOGIN_MAX_REQUESTS' ? '0' : undefined,
        })
        .compile(),
    ).rejects.toThrow('AUTH_LOGIN_MAX_REQUESTS');
  });
});
