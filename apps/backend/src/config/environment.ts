import type { ConfigModuleOptions } from '@nestjs/config';
import { createDatabaseOptions } from '../database/database.options';

export type NodeEnvironment = 'development' | 'test' | 'production';

export function readNodeEnvironment(
  value: unknown = process.env.NODE_ENV,
): NodeEnvironment {
  if (value === undefined) return 'development';
  if (value === 'development' || value === 'test' || value === 'production')
    return value;
  throw new Error('NODE_ENV debe seleccionar development, test o production.');
}

export function readPort(value: unknown, environment: NodeEnvironment): number {
  const port =
    value === undefined
      ? 3000
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : value;
  if (
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port < (environment === 'test' ? 0 : 1) ||
    port > 65535
  ) {
    throw new Error(
      'PORT debe ser un puerto entero válido; cero solo se admite en test.',
    );
  }
  return port;
}

export function readCorsOrigins(
  value: unknown,
  environment: NodeEnvironment,
): string[] {
  if (value === undefined || value === '') {
    if (environment === 'production')
      throw new Error('CORS_ORIGIN es obligatorio en producción.');
    return [];
  }
  if (typeof value !== 'string')
    throw new Error(
      'CORS_ORIGIN debe contener orígenes explícitos separados por comas.',
    );
  const origins = value.split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== origin ||
        origin.includes('*') ||
        parsed.username ||
        parsed.password ||
        (environment === 'production' && parsed.protocol !== 'https:')
      )
        throw new Error();
    } catch {
      throw new Error(
        'CORS_ORIGIN requiere orígenes exactos, sin rutas, credenciales ni comodines; HTTPS es obligatorio en producción.',
      );
    }
  }
  return [...new Set(origins)];
}

function required(config: Record<string, unknown>, name: string): string {
  const value = config[name];
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`La variable ${name} es obligatoria.`);
  return value;
}

export function validateEnvironment(
  config: Record<string, unknown>,
  selectedEnvironment?: NodeEnvironment,
): Record<string, unknown> {
  const environment = readNodeEnvironment(config.NODE_ENV);
  if (
    selectedEnvironment !== undefined &&
    environment !== selectedEnvironment
  ) {
    throw new Error(
      'NODE_ENV debe seleccionarse en el entorno del proceso antes de cargar archivos locales.',
    );
  }
  const port = readPort(config.PORT, environment);
  const databaseUrl = required(config, 'DATABASE_URL');
  const databaseSsl = config.DATABASE_SSL ?? 'true';
  if (typeof databaseSsl !== 'string')
    throw new Error('DATABASE_SSL debe ser true o false.');
  const ca = config.DATABASE_CA_CERT;
  if (ca !== undefined && typeof ca !== 'string')
    throw new Error('DATABASE_CA_CERT debe ser un certificado PEM.');
  createDatabaseOptions(databaseUrl, databaseSsl, {
    production: environment === 'production',
    ca,
  });
  const mongoUri = required(config, 'MONGODB_URI');
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/.test(mongoUri))
    throw new Error('MONGODB_URI debe ser una URI de MongoDB.');
  if (environment === 'production') {
    const parameters = [
      ...new URLSearchParams(mongoUri.split('?')[1]).entries(),
    ].map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]);
    const disablesTls = parameters.some(
      ([key, value]) => ['tls', 'ssl'].includes(key) && value !== 'true',
    );
    const disablesVerification = parameters.some(
      ([key, value]) =>
        [
          'tlsinsecure',
          'tlsallowinvalidcertificates',
          'tlsallowinvalidhostnames',
        ].includes(key) && value !== 'false',
    );
    const enablesTls =
      mongoUri.startsWith('mongodb+srv://') ||
      parameters.some(
        ([key, value]) => ['tls', 'ssl'].includes(key) && value === 'true',
      );
    if (!enablesTls || disablesTls || disablesVerification)
      throw new Error(
        'MONGODB_URI requiere TLS con validación de certificados en producción.',
      );
  }
  required(config, 'MONGODB_DATABASE');
  const jwtSecret = required(config, 'JWT_SECRET');
  if (environment === 'production' && jwtSecret.trim().length < 32) {
    throw new Error(
      'JWT_SECRET requiere al menos 32 caracteres en producción.',
    );
  }
  const origins = readCorsOrigins(config.CORS_ORIGIN, environment);
  return {
    ...config,
    NODE_ENV: environment,
    PORT: port,
    DATABASE_SSL: databaseSsl,
    CORS_ORIGIN: origins.join(','),
  };
}

export function createEnvironmentOptions(
  environment: NodeEnvironment = readNodeEnvironment(),
): ConfigModuleOptions {
  return {
    isGlobal: true,
    ignoreEnvFile: environment !== 'development',
    envFilePath: ['.env.development', '.env'],
    validate: (config: Record<string, unknown>) =>
      validateEnvironment(
        { ...config, NODE_ENV: config.NODE_ENV ?? environment },
        environment,
      ),
  };
}
