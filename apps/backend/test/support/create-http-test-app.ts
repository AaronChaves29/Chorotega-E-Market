import {
  Module,
  type INestApplication,
  type ModuleMetadata,
} from '@nestjs/common';
import {
  Test,
  type TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { App } from 'supertest/types';
import { configureHttp } from '../../src/common/http/configure-http';
import { startPostgresTestDatabase } from './postgres-test-database';
import { AUTH_RATE_LIMIT_OPTIONS } from '../../src/auth/rate-limit/auth-rate-limit.config';
import { regressionAuthRateLimits } from './auth-rate-limit-test-options';

@Module({})
class HttpTestDatabaseModule {}

export async function createHttpTestApp(
  imports: NonNullable<ModuleMetadata['imports']>,
  setup?: (app: INestApplication<App>) => void,
  configureModule?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
) {
  const database = await startPostgresTestDatabase();
  let module: TestingModule | undefined;
  let app: INestApplication<App> | undefined;

  async function close(): Promise<void> {
    const errors: unknown[] = [];
    try {
      if (app) await app.close();
      else await module?.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      await database.stop();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(errors, 'Falló la limpieza HTTP.');
  }

  try {
    // Importar módulos funcionales, nunca AppModule ni ConfigModule.forRoot().
    let builder = Test.createTestingModule({
      imports: [
        {
          module: HttpTestDatabaseModule,
          global: true,
          providers: [
            { provide: getDataSourceToken(), useValue: database.dataSource },
          ],
          exports: [getDataSourceToken()],
        },
        ...imports,
      ],
    })
      .overrideProvider(AUTH_RATE_LIMIT_OPTIONS)
      .useValue(regressionAuthRateLimits());
    if (configureModule) builder = configureModule(builder);
    module = await builder.compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureHttp(app);
    setup?.(app);
    await app.init();
    return { app, database, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Fallaron la inicialización y la limpieza HTTP.',
      );
    }
    throw error;
  }
}
