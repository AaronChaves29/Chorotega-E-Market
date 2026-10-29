import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { startHttpServer } from './common/http/start-http-server';
import { JsonLogger } from './common/observability/json-logger';
import { reportStartupFailure } from './deployment/startup-diagnostics';

async function bootstrap() {
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, {
    logger,
    abortOnError: false,
  });
  await startHttpServer(app);
  logger.operational('backend_started');
}

void bootstrap().catch((error: unknown) => {
  reportStartupFailure('arranque_nestjs', error);
  process.exitCode = 1;
});
