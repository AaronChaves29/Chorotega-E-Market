import { validateEnvironment } from '../config/environment';
import { migrate } from './migrate';

async function startNest(): Promise<void> {
  // AppModule se evalúa después de validar configuración y completar migraciones.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { startHttpServer } =
    await import('../common/http/start-http-server.js');
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  await startHttpServer(app);
}

export async function startRender(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies = { migrate, start: startNest },
): Promise<void> {
  validateEnvironment(environment, 'production');
  await dependencies.migrate();
  await dependencies.start();
}

if (require.main === module) {
  void startRender().catch(() => {
    console.error(
      'No se inició el backend. Revise la configuración y el resultado de las migraciones.',
    );
    process.exitCode = 1;
  });
}
