import { DataSource, MigrationExecutor } from 'typeorm';
import {
  createProductionMigrationDataSource,
  MIGRATION_LOCK,
  runProductionMigrations,
} from './production-migrations';

describe('Migraciones de producción', () => {
  function setup() {
    const source = new DataSource({ type: 'postgres' });
    const runner = source.createQueryRunner();
    const initialize = jest
      .spyOn(source, 'initialize')
      .mockResolvedValue(source);
    jest.spyOn(source, 'createQueryRunner').mockReturnValue(runner);
    const destroy = jest.spyOn(source, 'destroy').mockResolvedValue();
    jest.spyOn(runner, 'connect').mockResolvedValue(undefined);
    jest.spyOn(runner, 'startTransaction').mockImplementation(() => {
      jest.replaceProperty(runner, 'isTransactionActive', true);
      return Promise.resolve();
    });
    const query = jest
      .spyOn(runner, 'query')
      .mockResolvedValue([{ locked: true }]);
    const commitTransaction = jest
      .spyOn(runner, 'commitTransaction')
      .mockImplementation(() => {
        jest.replaceProperty(runner, 'isTransactionActive', false);
        return Promise.resolve();
      });
    const rollbackTransaction = jest
      .spyOn(runner, 'rollbackTransaction')
      .mockImplementation(() => {
        jest.replaceProperty(runner, 'isTransactionActive', false);
        return Promise.resolve();
      });
    const release = jest.spyOn(runner, 'release').mockResolvedValue();
    const execute = jest
      .spyOn(MigrationExecutor.prototype, 'executePendingMigrations')
      .mockResolvedValue([]);
    return {
      source,
      runner,
      execute,
      spies: {
        initialize,
        destroy,
        query,
        commitTransaction,
        rollbackTransaction,
        release,
      },
    };
  }
  afterEach(() => jest.restoreAllMocks());

  it('registra las tres migraciones reales, TLS validado y ningún seed', () => {
    const source = createProductionMigrationDataSource({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/deployment_test',
      DATABASE_SSL: 'true',
    });
    expect(source.isInitialized).toBe(false);
    expect(source.options).toMatchObject({
      synchronize: false,
      migrationsRun: false,
      ssl: { rejectUnauthorized: true },
      migrationsTableName: 'typeorm_migrations',
      connectTimeoutMS: 10_000,
    });
    const migrations = source.options.migrations as (new () => object)[];
    expect(migrations.map((migration) => migration.name)).toEqual([
      'CreateInitialSchema1788732000000',
      'AlignTimestampDefaults1788998400000',
      'AddPasswordHashToUser1791352458237',
    ]);
  });
  it('rechaza entorno no productivo y TLS desactivado antes de conectar', () => {
    expect(() =>
      createProductionMigrationDataSource({ NODE_ENV: 'test' }),
    ).toThrow('NODE_ENV');
    expect(() =>
      createProductionMigrationDataSource({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/test',
        DATABASE_SSL: 'false',
      }),
    ).toThrow('DATABASE_SSL');
  });
  it('adquiere bloqueo antes de leer historial y ejecuta en la misma conexión', async () => {
    const { source, runner, execute, spies } = setup();
    execute.mockImplementation(function (this: MigrationExecutor) {
      expect(this).toMatchObject({ queryRunner: runner, transaction: 'all' });
      expect(runner.isTransactionActive).toBe(true);
      return Promise.resolve([]);
    });
    await expect(runProductionMigrations(source)).resolves.toBe(0);
    expect(spies.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_try_advisory_xact_lock($1, $2) AS locked',
      [...MIGRATION_LOCK],
    );
    expect(spies.query.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[0],
    );
    expect(spies.commitTransaction).toHaveBeenCalledTimes(1);
    expect(spies.rollbackTransaction).not.toHaveBeenCalled();
    expect(spies.release).toHaveBeenCalledTimes(1);
    expect(spies.destroy).toHaveBeenCalledTimes(1);
  });
  it('rechaza un ejecutor concurrente sin ejecutar migraciones ni esperar indefinidamente', async () => {
    const { source, execute, spies } = setup();
    spies.query.mockResolvedValueOnce([{ locked: false }]);
    await expect(runProductionMigrations(source)).rejects.toThrow(
      'Otro proceso',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(spies.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(spies.destroy).toHaveBeenCalledTimes(1);
  });
  it('revierte fallo intermedio y no propaga SQL ni credenciales', async () => {
    const { source, execute, spies } = setup();
    execute.mockRejectedValue(new Error('private-sql-marker'));
    await expect(runProductionMigrations(source)).rejects.toThrow(
      /^No se completaron las migraciones\./,
    );
    expect(spies.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(spies.commitTransaction).not.toHaveBeenCalled();
    expect(spies.release).toHaveBeenCalledTimes(1);
    expect(spies.destroy).toHaveBeenCalledTimes(1);
  });
  it('un reinicio vuelve a consultar pendientes sin reutilizar estado de ejecución', async () => {
    const first = setup();
    await expect(runProductionMigrations(first.source)).resolves.toBe(0);
    jest.restoreAllMocks();
    const second = setup();
    await expect(runProductionMigrations(second.source)).resolves.toBe(0);
    expect(second.execute).toHaveBeenCalledTimes(1);
    expect(second.spies.query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS locked',
      [...MIGRATION_LOCK],
    );
  });
  it('un fallo de conexión no ejecuta migraciones', async () => {
    const { source, execute, spies } = setup();
    spies.initialize.mockRejectedValue(new Error('private-connection-marker'));
    await expect(runProductionMigrations(source)).rejects.toThrow(
      'No se completaron',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(spies.destroy).not.toHaveBeenCalled();
  });
  it.each(['rollbackTransaction', 'release'] as const)(
    'intenta cerrar DataSource aunque falle %s',
    async (method) => {
      const { source, execute, spies } = setup();
      execute.mockRejectedValue(new Error('private-marker'));
      spies[method].mockRejectedValue(new Error('private-cleanup-marker'));
      await expect(runProductionMigrations(source)).rejects.toThrow(
        /transacción|conexión/,
      );
      expect(spies.destroy).toHaveBeenCalledTimes(1);
    },
  );
});
