import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export function createDatabaseOptions(
  databaseUrl: string | undefined,
  databaseSsl: string = 'true',
): DataSourceOptions {
  if (!databaseUrl) {
    throw new Error('La variable de entorno DATABASE_URL no está configurada.');
  }

  if (databaseSsl !== 'true' && databaseSsl !== 'false') {
    throw new Error('DATABASE_SSL debe ser "true" o "false".');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    ssl: databaseSsl === 'true' ? { rejectUnauthorized: false } : false,
    synchronize: false,
    migrationsRun: false,
    entities: [join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
  };
}
