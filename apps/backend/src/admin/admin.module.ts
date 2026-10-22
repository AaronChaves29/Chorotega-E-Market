import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../modules/products/products.module';
import { StoresModule } from '../modules/stores/stores.module';
import { AdminSessionService } from './admin-session.service';
import { AdminCsrfGuard, AdminSessionGuard } from './admin.guards';
import { AdminAuthController } from './admin-auth.controller';
import { AdminCatalogController } from './admin-catalog.controller';

@Module({
  imports: [ConfigModule, AuthModule, ProductsModule, StoresModule],
  controllers: [AdminAuthController, AdminCatalogController],
  providers: [AdminSessionService, AdminSessionGuard, AdminCsrfGuard],
})
export class AdminModule {}
