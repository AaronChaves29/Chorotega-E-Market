import {
  createProductionMigrationDataSource,
  runProductionMigrations,
} from '../database/production-migrations';

export async function migrate(): Promise<number> {
  const applied = await runProductionMigrations(
    createProductionMigrationDataSource(),
  );
  console.log(`Migraciones completadas: ${applied} pendientes aplicadas.`);
  return applied;
}

if (require.main === module) {
  void migrate().catch(() => {
    console.error(
      'Migraciones no completadas. Verifique configuración, historial y que no exista otro ejecutor activo.',
    );
    process.exitCode = 1;
  });
}
