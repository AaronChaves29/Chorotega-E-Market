import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../modules/products/products.module';
import { StoresModule } from '../modules/stores/stores.module';
import { AdminSessionService } from './admin-session.service';
import { AdminCsrfGuard, AdminSessionGuard } from './admin.guards';
import { AdminAuthController } from './admin-auth.controller';
import { DeliveriesModule } from '../modules/deliveries/deliveries.module';
import { CouriersModule } from '../modules/couriers/couriers.module';
import { AdminDeliveriesController } from './admin-deliveries.controller';
import { AdminCatalogController } from './admin-catalog.controller';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    ProductsModule,
    StoresModule,
    DeliveriesModule,
    CouriersModule,
  ],
  controllers: [
    AdminAuthController,
    AdminCatalogController,
    AdminDeliveriesController,
  ],
  providers: [AdminSessionService, AdminSessionGuard, AdminCsrfGuard],
})
export class AdminModule {}
