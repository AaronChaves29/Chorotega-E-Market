import {
  createProductionMigrationDataSource,
  runProductionMigrations,
} from '../database/production-migrations';
import { reportStartupFailure } from './startup-diagnostics';

export async function migrate(): Promise<number> {
  const applied = await runProductionMigrations(
    createProductionMigrationDataSource(),
  );
  console.log(`Migraciones completadas: ${applied} pendientes aplicadas.`);
  return applied;
}

if (require.main === module) {
  void migrate().catch((error: unknown) => {
    reportStartupFailure('migraciones_postgresql', error);
    console.error(
      'Migraciones no completadas. Verifique configuración, historial y que no exista otro ejecutor activo.',
    );
    process.exitCode = 1;
  });
}
