import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  readCorsOrigins,
  readNodeEnvironment,
  readPort,
} from '../../config/environment';
import { configureHttp } from './configure-http';
import { configureOpenApi } from './configure-openapi';
import { configureAdminViews } from '../../admin/admin-views';

export async function startHttpServer(app: INestApplication): Promise<void> {
  try {
    const config = app.get(ConfigService);
    const environment = readNodeEnvironment(config.get<string>('NODE_ENV'));
    configureAdminViews(app);
    configureHttp(
      app,
      readCorsOrigins(config.get<string>('CORS_ORIGIN'), environment),
    );
    configureOpenApi(app);
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    await app.listen(
      readPort(config.get<unknown>('PORT'), environment),
      '0.0.0.0',
    );
  } catch (error) {
    await app.close();
    throw error;
  }
}
