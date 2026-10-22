import {
  Module,
  type INestApplication,
  type ModuleMetadata,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { App } from 'supertest/types';
import { configureHttp } from '../../src/common/http/configure-http';
import { startPostgresTestDatabase } from './postgres-test-database';

@Module({})
class HttpTestDatabaseModule {}

export async function createHttpTestApp(
  imports: NonNullable<ModuleMetadata['imports']>,
  setup?: (app: INestApplication<App>) => void,
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
    module = await Test.createTestingModule({
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
    }).compile();
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
