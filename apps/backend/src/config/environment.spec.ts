import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  createEnvironmentOptions,
  readCorsOrigins,
  readNodeEnvironment,
  readPort,
  validateEnvironment,
} from './environment';

function production() {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost/config_test',
    DATABASE_SSL: 'true',
    MONGODB_URI: 'mongodb+srv://cluster.example.test/config_test',
    MONGODB_DATABASE: 'config_test',
    JWT_SECRET: randomBytes(32).toString('hex'),
    CORS_ORIGIN: 'https://frontend.example.test',
  };
}

describe('Configuración de ambientes', () => {
  it('valida producción y aplica defaults seguros sin conectar servicios', () => {
    const input = production();
    expect(validateEnvironment(input)).toMatchObject({
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_SSL: 'true',
      CORS_ORIGIN: input.CORS_ORIGIN,
    });
    expect(input).not.toHaveProperty('PORT');
  });
  it.each([
    'DATABASE_URL',
    'MONGODB_URI',
    'MONGODB_DATABASE',
    'JWT_SECRET',
    'CORS_ORIGIN',
  ])('rechaza producción sin %s', (name) => {
    const config: Record<string, unknown> = production();
    delete config[name];
    expect(() => validateEnvironment(config)).toThrow(name);
  });
  it.each(['', ' ', 'change_me'])(
    'rechaza secreto JWT de producción vacío o débil',
    (secret) => {
      expect(() =>
        validateEnvironment({ ...production(), JWT_SECRET: secret }),
      ).toThrow('JWT_SECRET');
    },
  );
  it('conserva desarrollo local sin TLS y permite secreto de prueba', () => {
    expect(
      validateEnvironment({
        ...production(),
        NODE_ENV: 'development',
        DATABASE_SSL: 'false',
        JWT_SECRET: 'solo-desarrollo',
        CORS_ORIGIN: undefined,
      }),
    ).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_SSL: 'false',
      CORS_ORIGIN: '',
    });
  });
  it.each(['DATABASE_SSL', 'PORT', 'MONGODB_URI'])(
    'rechaza formato incorrecto de %s sin imprimirlo',
    (name) => {
      const marker = 'private-marker-invalid';
      try {
        validateEnvironment({ ...production(), [name]: marker });
        throw new Error('No rechazó configuración');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(name);
        expect((error as Error).message).not.toContain(marker);
      }
    },
  );
  it('impide activar producción desde un archivo cargado como desarrollo', () =>
    expect(() => validateEnvironment(production(), 'development')).toThrow(
      'NODE_ENV',
    ));
  it.each(['development', 'test', 'production'] as const)(
    'selecciona política de archivos para %s',
    (mode) => {
      const options = createEnvironmentOptions(mode);
      expect(options.ignoreEnvFile).toBe(mode !== 'development');
      expect(options.envFilePath).toEqual(['.env.development', '.env']);
    },
  );
  it.each(['prod', '', 'staging'])('rechaza ambiente no soportado', (mode) =>
    expect(() => readNodeEnvironment(mode)).toThrow('NODE_ENV'),
  );
  it.each(['abc', '-1', '1.5', '65536', '', '0', 65536, null])(
    'rechaza PORT inválido en producción: %s',
    (value) => expect(() => readPort(value, 'production')).toThrow('PORT'),
  );
  it('acepta puerto PaaS y puerto efímero solo en test', () => {
    expect(readPort('10000', 'production')).toBe(10000);
    expect(readPort(0, 'test')).toBe(0);
    expect(() => readPort(0, 'development')).toThrow('PORT');
  });
  it('acepta orígenes exactos y elimina duplicados', () => {
    expect(
      readCorsOrigins(
        'https://a.example.test, https://b.example.test,https://a.example.test',
        'production',
      ),
    ).toEqual(['https://a.example.test', 'https://b.example.test']);
    expect(readCorsOrigins('http://localhost:3001', 'development')).toEqual([
      'http://localhost:3001',
    ]);
  });
  it.each([
    '*',
    'https://*.example.test',
    'null',
    'http://frontend.example.test',
    'https://frontend.example.test/',
    'https://frontend.example.test/path',
    'https://frontend.example.test?x=1',
    'https://user:private@example.test',
    'https://frontend.example.test,',
  ])('rechaza origen de producción inseguro o no exacto', (origin) =>
    expect(() => readCorsOrigins(origin, 'production')).toThrow('CORS_ORIGIN'),
  );
  it.each([
    'mongodb://localhost/config_test',
    'mongodb+srv://cluster.example.test/db?tls=false',
    'mongodb+srv://cluster.example.test/db?tls=false&tls=true',
    'mongodb+srv://cluster.example.test/db?tlsInsecure=true&tlsInsecure=false',
    'mongodb+srv://cluster.example.test/db?tlsInsecure=true',
    'mongodb+srv://cluster.example.test/db?tlsAllowInvalidCertificates=true',
    'mongodb+srv://cluster.example.test/db?tlsAllowInvalidHostnames=true',
  ])('rechaza MongoDB sin TLS validado en producción', (uri) =>
    expect(() =>
      validateEnvironment({ ...production(), MONGODB_URI: uri }),
    ).toThrow('MONGODB_URI'),
  );
  it('admite MongoDB estándar con TLS explícito en producción', () =>
    expect(
      validateEnvironment({
        ...production(),
        MONGODB_URI: 'mongodb://cluster.example.test/db?tls=true',
      }),
    ).toHaveProperty('MONGODB_URI'));
});

describe('Carga real de archivos con ConfigModule', () => {
  let directory: string;
  let previousEnvironment: NodeJS.ProcessEnv;
  beforeEach(() => {
    previousEnvironment = { ...process.env };
    directory = mkdtempSync(join(tmpdir(), 'chorotega-config-'));
    const base = {
      ...production(),
      NODE_ENV: 'development',
      DATABASE_SSL: 'false',
      PORT: 3201,
    };
    writeFileSync(
      join(directory, '.env'),
      Object.entries(base)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    );
    writeFileSync(join(directory, '.env.development'), 'PORT=3101\n');
  });
  afterEach(() => {
    process.env = previousEnvironment;
    rmSync(directory, { recursive: true, force: true });
  });
  function options(mode: 'development' | 'production') {
    return {
      ...createEnvironmentOptions(mode),
      envFilePath: [
        join(directory, '.env.development'),
        join(directory, '.env'),
      ],
      ignoreEnvVars: true,
      skipProcessEnv: true,
    };
  }
  it('desarrollo prioriza archivo específico sobre el genérico', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(options('development'))],
    }).compile();
    try {
      expect(module.get(ConfigService).get<number>('PORT')).toBe(3101);
    } finally {
      await module.close();
    }
  });
  it('las variables del proceso ganan sobre ambos archivos locales', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PORT = '3301';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ...options('development'),
          ignoreEnvVars: false,
        }),
      ],
    }).compile();
    try {
      expect(module.get(ConfigService).get<number>('PORT')).toBe(3301);
    } finally {
      await module.close();
    }
  });
  it('producción ignora archivos incluso si contienen la configuración requerida', async () => {
    await expect(ConfigModule.forRoot(options('production'))).rejects.toThrow(
      'DATABASE_URL',
    );
  });
});
