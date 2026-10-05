import {
  type INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ProblemDetailsFilter } from '../filters/problem-details.filter';

export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'api/database/health', method: RequestMethod.GET }],
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
