import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from './modules/products/products.module';
import { HealthModule } from './modules/health/health.module';
import { createDatabaseOptions } from './database/database.options';
import { UsersHttpModule } from './modules/users/users-http.module';
import { UsersModule } from './modules/users/users.module';
import { StoresModule } from './modules/stores/stores.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { OrderAuditsModule } from './modules/order-audits/order-audits.module';
import { CouriersModule } from './modules/couriers/couriers.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { NeighborhoodsModule } from './modules/neighborhoods/neighborhoods.module';
import { OrderDetailsModule } from './modules/order-details/order-details.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AuthModule } from './auth/auth.module';

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
    UsersModule,
    UsersHttpModule,
    StoresModule,
    CategoriesModule,
    OrderAuditsModule,
    CouriersModule,
    DeliveriesModule,
    NeighborhoodsModule,
    OrderDetailsModule,
    OrdersModule,
    AuthModule,
  ],
})
export class AppModule {}
