import {
  createProductionMigrationDataSource,
  runProductionMigrations,
} from '../database/production-migrations';
import { reportStartupFailure } from './startup-diagnostics';
import { JsonLogger } from '../common/observability/json-logger';

export async function migrate(): Promise<number> {
  const applied = await runProductionMigrations(
    createProductionMigrationDataSource(),
  );
  new JsonLogger().operational('migrations_completed', 'log', applied);
  return applied;
}

if (require.main === module) {
  void migrate().catch((error: unknown) => {
    reportStartupFailure('migraciones_postgresql', error);
    new JsonLogger().operational('migrations_aborted', 'error');
    process.exitCode = 1;
  });
}
