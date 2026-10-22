import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { startHttpServer } from './common/http/start-http-server';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await startHttpServer(app);
  Logger.log(
    'Backend iniciado con la configuración HTTP validada.',
    'Bootstrap',
  );
}

void bootstrap();
