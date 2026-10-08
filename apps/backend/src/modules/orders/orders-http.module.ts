import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { OrdersModule } from './orders.module';
import { OrdersController } from './controllers/orders.controller';
import { OrdersReadService } from './services/orders-read.service';

@Module({
  imports: [OrdersModule, AuthModule],
  controllers: [OrdersController],
  providers: [OrdersReadService],
})
export class OrdersHttpModule {}
