import 'reflect-metadata';
import {
  DataSource,
  MigrationExecutor,
  type Logger,
  type QueryRunner,
} from 'typeorm';
import { readNodeEnvironment } from '../config/environment';
import { createDatabaseOptions } from './database.options';
import { CreateInitialSchema1788732000000 } from './migrations/1788732000000-CreateInitialSchema';
import { AlignTimestampDefaults1788998400000 } from './migrations/1788998400000-AlignTimestampDefaults';
import { AddPasswordHashToUser1791352458237 } from './migrations/1791352458237-AddPasswordHashToUser';

// Compartida por todos los arranques y comandos de migración de este backend.
export const MIGRATION_LOCK = [509, 6001] as const;

// El ejecutor de TypeORM puede incluir SQL/parámetros en sus mensajes de error.
export const migrationLogger: Logger = {
  logQuery() {},
  logQueryError() {},
  logQuerySlow() {},
  logSchemaBuild() {},
  logMigration() {},
  log() {},
};

export function createProductionMigrationDataSource(
  environment: NodeJS.ProcessEnv = process.env,
): DataSource {
  if (readNodeEnvironment(environment.NODE_ENV) !== 'production')
    throw new Error('El comando compilado requiere NODE_ENV=production.');
  const options = createDatabaseOptions(
    environment.DATABASE_URL,
    environment.DATABASE_SSL,
    {
      production: true,
      ca: environment.DATABASE_CA_CERT,
    },
  );
  if (options.type !== 'postgres')
    throw new Error('Las migraciones requieren PostgreSQL.');
  return new DataSource({
    ...options,
    // Imports explícitos: el build los convierte a JS, sin ts-node ni seeds.
    migrations: [
      CreateInitialSchema1788732000000,
      AlignTimestampDefaults1788998400000,
      AddPasswordHashToUser1791352458237,
    ],
    logger: migrationLogger,
    logging: false,
    connectTimeoutMS: 10_000,
  });
}

class MigrationBusyError extends Error {
  constructor() {
    super(
      'Otro proceso está ejecutando migraciones. Reintente el despliegue al finalizar.',
    );
  }
}

export async function runProductionMigrations(
  dataSource: DataSource,
): Promise<number> {
  let runner: QueryRunner | undefined;
  let initialized = false;
  let failure: Error | undefined;
  let applied = 0;
  try {
    await dataSource.initialize();
    initialized = true;
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const [result] = (await runner.query(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS locked',
      [...MIGRATION_LOCK],
    )) as { locked: boolean }[];
    if (result?.locked !== true) throw new MigrationBusyError();
    await runner.query("SET LOCAL lock_timeout = '10s'");
    await runner.query("SET LOCAL statement_timeout = '120s'");
    // El historial, el DDL y el bloqueo usan la MISMA transacción/conexión.
    const executor = new MigrationExecutor(dataSource, runner);
    executor.transaction = 'all';
    applied = (await executor.executePendingMigrations()).length;
    await runner.commitTransaction();
  } catch (error) {
    failure =
      error instanceof MigrationBusyError
        ? error
        : new Error(
            'No se completaron las migraciones. Revise conexión, TLS, permisos e historial antes de reintentar.',
            { cause: error },
          );
  } finally {
    if (runner?.isTransactionActive) {
      try {
        await runner.rollbackTransaction();
      } catch (error) {
        failure = new Error(
          'Falló la reversión de la transacción de migraciones. No se iniciará HTTP.',
          { cause: failure ?? error },
        );
      }
    }
    try {
      await runner?.release();
    } catch (error) {
      failure = new Error('No se pudo liberar la conexión de migraciones.', {
        cause: failure ?? error,
      });
    }
    if (initialized) {
      try {
        await dataSource.destroy();
      } catch (error) {
        failure = new Error('No se pudo cerrar la conexión de migraciones.', {
          cause: failure ?? error,
        });
      }
    }
  }
  if (failure) throw failure;
  return applied;
}
