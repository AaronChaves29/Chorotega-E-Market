import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DatabaseController } from './database.controller';
import { DatabaseService } from './database.service';
import { DatabaseModule } from './database.module';
import { ProductsModule } from './modules/products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');

        if (!databaseUrl) {
          throw new Error(
            'La variable de entorno DATABASE_URL no está configurada.',
          );
        }

        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: false,
          ssl: {
            rejectUnauthorized: false,
          },
        };
      },
    }),
    DatabaseModule,
    ProductsModule,
  ],
  controllers: [DatabaseController],
  providers: [DatabaseService],
})
export class AppModule {}
