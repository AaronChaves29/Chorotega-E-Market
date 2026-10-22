import {
  type INestApplication,
  ForbiddenException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ProblemDetailsFilter } from '../filters/problem-details.filter';

export function configureHttp(
  app: INestApplication,
  corsOrigins: readonly string[] = [],
): void {
  if (corsOrigins.length > 0) {
    const allowedOrigins = new Set(corsOrigins);
    app.enableCors({
      origin: (
        origin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void,
      ) => {
        if (origin === undefined || allowedOrigins.has(origin))
          callback(null, true);
        else callback(new ForbiddenException('Origen no autorizado.'));
      },
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: ['Location'],
      credentials: false,
    });
  }
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'api/database/health', method: RequestMethod.GET },
      { path: 'admin', method: RequestMethod.ALL },
      { path: 'admin/{*path}', method: RequestMethod.ALL },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
}
