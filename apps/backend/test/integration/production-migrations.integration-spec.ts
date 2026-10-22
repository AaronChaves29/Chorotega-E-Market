import { DataSource, type MigrationInterface, type QueryRunner } from 'typeorm';
import {
  MIGRATION_LOCK,
  migrationLogger,
  runProductionMigrations,
} from '../../src/database/production-migrations';
import {
  startPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../support/postgres-test-database';

class FailingDeployment1890000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'CREATE TABLE deployment_rollback_probe (id integer PRIMARY KEY)',
    );
    await runner.query('INSERT INTO deployment_rollback_probe VALUES (1)');
    throw new Error('Fallo intermedio controlado');
  }
  down(): Promise<void> {
    return Promise.resolve();
  }
}

describe('Migraciones de despliegue en PostgreSQL temporal', () => {
  let database: PostgresTestDatabase;
  beforeAll(async () => {
    database = await startPostgresTestDatabase();
  });
  afterAll(async () => {
    await database?.stop();
  });
  function source(failing = false): DataSource {
    return new DataSource({
      ...database.dataSource.options,
      migrations: [
        ...database.dataSource.migrations.map(
          (migration) => migration.constructor as new () => MigrationInterface,
        ),
        ...(failing ? [FailingDeployment1890000000000] : []),
      ],
      logger: migrationLogger,
    });
  }
  it('aplica las tres migraciones reales en una base vacía y registra solo tres entradas', async () => {
    await database.dataSource.query('CREATE DATABASE deployment_fresh');
    const options = source().options;
    if (options.type !== 'postgres' || !options.url)
      throw new Error('Se requiere PostgreSQL temporal.');
    const url = new URL(options.url);
    url.pathname = '/deployment_fresh';
    await expect(
      runProductionMigrations(
        new DataSource({ ...options, url: url.toString() }),
      ),
    ).resolves.toBe(3);
    const inspector = new DataSource({ ...options, url: url.toString() });
    try {
      await inspector.initialize();
      const history: { count: string }[] = await inspector.query(
        'SELECT count(*) FROM typeorm_migrations',
      );
      expect(history[0].count).toBe('3');
      const tables: { count: string }[] = await inspector.query(
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
      );
      expect(tables[0].count).toBe('10');
    } finally {
      if (inspector.isInitialized) await inspector.destroy();
    }
  });
  it('reinicios no repiten migraciones ni cargan datos iniciales', async () => {
    await expect(runProductionMigrations(source())).resolves.toBe(0);
    await expect(runProductionMigrations(source())).resolves.toBe(0);
    const rows: { count: string }[] = await database.dataSource.query(
      'SELECT count(*) FROM typeorm_migrations',
    );
    expect(rows[0].count).toBe('3');
    const users: { count: string }[] = await database.dataSource.query(
      'SELECT count(*) FROM usuario',
    );
    expect(users[0].count).toBe('0');
  });
  it('otro ejecutor con la misma clave impide ejecutar hasta liberar la transacción', async () => {
    const holder = database.dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    try {
      await holder.query('SELECT pg_advisory_xact_lock($1, $2)', [
        ...MIGRATION_LOCK,
      ]);
      await expect(runProductionMigrations(source())).rejects.toThrow(
        'Otro proceso',
      );
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
    }
    await expect(runProductionMigrations(source())).resolves.toBe(0);
  });
  it('un fallo después de DDL y escritura revierte tabla y registro de historial', async () => {
    await expect(runProductionMigrations(source(true))).rejects.toThrow(
      'No se completaron',
    );
    const rows: { table_name: string | null }[] =
      await database.dataSource.query(
        "SELECT to_regclass('public.deployment_rollback_probe') AS table_name",
      );
    expect(rows[0].table_name).toBeNull();
    const history: { count: string }[] = await database.dataSource.query(
      'SELECT count(*) FROM typeorm_migrations',
    );
    expect(history[0].count).toBe('3');
    await expect(runProductionMigrations(source())).resolves.toBe(0);
  });
});
