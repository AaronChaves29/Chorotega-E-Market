import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrdersRepository } from './repositories/orders.repository';
import { OrdersService } from './services/orders.service';
import { OrderTransaction } from './transactions/order-transaction';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  providers: [OrdersRepository, OrderTransaction, OrdersService],
  exports: [OrdersRepository, OrdersService],
})
export class OrdersModule {}
