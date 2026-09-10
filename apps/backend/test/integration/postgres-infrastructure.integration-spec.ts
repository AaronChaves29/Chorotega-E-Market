import { describe, expect, it } from '@jest/globals';
import {
  type PostgresTestDatabase,
  withPostgresTestDatabase,
} from '../support/postgres-test-database';

describe('Infraestructura PostgreSQL con Testcontainers', () => {
  it('inicia PostgreSQL 16, aplica la migración real y limpia los recursos', async () => {
    const database = await withPostgresTestDatabase(async (database) => {
      const { dataSource, container } = database;
      expect(dataSource.isInitialized).toBe(true);
      expect(dataSource.options.synchronize).toBe(false);
      expect(dataSource.options.migrationsRun).toBe(false);
      expect(container.getPort()).toBeGreaterThan(0);

      const [version] = await dataSource.query<{ version: string }[]>(
        "SELECT current_setting('server_version_num') AS version",
      );
      expect(Number(version.version)).toBeGreaterThanOrEqual(160000);
      expect(Number(version.version)).toBeLessThan(170000);

      const tables = await dataSource.query<{ tablename: string }[]>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      );
      expect(tables.map((table) => table.tablename)).toEqual([
        'barrio',
        'categoria',
        'detalle_pedido',
        'entrega',
        'pedido',
        'producto',
        'repartidor',
        'tienda',
        'typeorm_migrations',
        'usuario',
      ]);

      const migrations = await dataSource.query<{ name: string }[]>(
        'SELECT name FROM typeorm_migrations ORDER BY id',
      );
      expect(migrations).toEqual([
        { name: 'CreateInitialSchema1788732000000' },
      ]);
      expect(await dataSource.showMigrations()).toBe(false);
      return database;
    });

    expect(database.dataSource.isInitialized).toBe(false);
    await expect(database.container.exec(['pg_isready'])).rejects.toThrow();
    // La limpieza puede llamarse nuevamente desde afterAll sin duplicar recursos.
    await expect(database.stop()).resolves.toBeUndefined();
  });

  it('limpia la conexión y el contenedor aunque el cuerpo de la prueba falle', async () => {
    let database: PostgresTestDatabase | undefined;
    const failure = new Error('Fallo intencional para comprobar la limpieza');

    await expect(
      withPostgresTestDatabase((started) => {
        database = started;
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(database).toBeDefined();
    expect(database!.dataSource.isInitialized).toBe(false);
    await expect(database!.container.exec(['pg_isready'])).rejects.toThrow();
  });
});
