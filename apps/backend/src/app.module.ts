import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from './modules/products/products.module';
import { HealthModule } from './modules/health/health.module';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { createDatabaseOptions } from './database/database.options';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createDatabaseOptions(
          configService.get<string>('DATABASE_URL'),
          configService.get<string>('DATABASE_SSL'),
        ),
    }),

    HealthModule,
    ProductsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
