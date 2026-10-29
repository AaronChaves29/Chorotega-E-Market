import { validateEnvironment } from '../config/environment';
import { migrate } from './migrate';
import { reportStartupFailure, type StartupStage } from './startup-diagnostics';
import { JsonLogger } from '../common/observability/json-logger';

async function startNest(): Promise<void> {
  // AppModule se evalúa después de validar configuración y completar migraciones.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { startHttpServer } =
    await import('../common/http/start-http-server.js');
  // Durante el arranque, Nest/TypeORM pueden registrar el error y su stack antes
  // de relanzarlo. El diagnóstico seguro lo emite startRender al capturarlo.
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });
  await startHttpServer(app);
  const logger = new JsonLogger();
  app.useLogger(logger);
  logger.operational('backend_started');
}

export async function startRender(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies = { migrate, start: startNest },
): Promise<void> {
  let stage: StartupStage = 'validacion_variables';
  try {
    validateEnvironment(environment, 'production');
    stage = 'migraciones_postgresql';
    await dependencies.migrate();
    stage = 'arranque_nestjs';
    await dependencies.start();
  } catch (error) {
    reportStartupFailure(stage, error);
    throw error;
  }
}

if (require.main === module) {
  void startRender().catch(() => {
    new JsonLogger().operational('startup_aborted', 'error');
    process.exitCode = 1;
  });
}
