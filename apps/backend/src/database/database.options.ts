import { X509Certificate } from 'node:crypto';
import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export interface DatabaseSecurityOptions {
  production?: boolean;
  ca?: string;
}

export function createDatabaseOptions(
  databaseUrl: string | undefined,
  databaseSsl: string = 'true',
  security: DatabaseSecurityOptions = {},
): DataSourceOptions {
  if (!databaseUrl)
    throw new Error('La variable de entorno DATABASE_URL no está configurada.');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !parsed.hostname
    )
      throw new Error();
  } catch {
    throw new Error('DATABASE_URL debe ser una URL válida de PostgreSQL.');
  }
  if (databaseSsl !== 'true' && databaseSsl !== 'false')
    throw new Error('DATABASE_SSL debe ser "true" o "false".');
  const production =
    security.production ?? process.env.NODE_ENV === 'production';
  if (production && databaseSsl !== 'true')
    throw new Error('DATABASE_SSL debe habilitar TLS en producción.');
  // pg puede reemplazar las opciones TLS con parámetros de la URL.
  if (
    production &&
    [...parsed.searchParams.keys()].some(
      (key) =>
        key.toLowerCase().startsWith('ssl') ||
        key.toLowerCase() === 'uselibpqcompat',
    )
  ) {
    throw new Error(
      'DATABASE_URL no debe contener parámetros TLS en producción; use DATABASE_SSL y DATABASE_CA_CERT.',
    );
  }
  let ca: string | undefined;
  if (security.ca !== undefined && security.ca !== '') {
    if (databaseSsl !== 'true')
      throw new Error('DATABASE_CA_CERT requiere DATABASE_SSL habilitado.');
    ca = security.ca.replace(/\\n/g, '\n');
    try {
      new X509Certificate(ca);
    } catch {
      throw new Error('DATABASE_CA_CERT debe ser un certificado PEM válido.');
    }
  }
  return {
    type: 'postgres',
    url: databaseUrl,
    ssl:
      databaseSsl === 'true'
        ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
        : false,
    synchronize: false,
    migrationsRun: false,
    entities: [join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
  };
}
