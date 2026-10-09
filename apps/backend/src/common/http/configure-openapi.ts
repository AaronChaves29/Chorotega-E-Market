import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Chorotega E-Market API')
    .setDescription(
      'Contrato REST vigente. Los permisos indicados corresponden a los guards y reglas existentes.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: '/docs-json',
    raw: ['json'],
  });
  return document;
}
