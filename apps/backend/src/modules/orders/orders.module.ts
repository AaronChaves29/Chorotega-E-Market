import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrdersRepository } from './repositories/orders.repository';
import { OrdersService } from './services/orders.service';
import { OrderTransaction } from './transactions/order-transaction';
import { OrderPreparationService } from './services/order-preparation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  providers: [
    OrdersRepository,
    OrderTransaction,
    OrdersService,
    OrderPreparationService,
  ],
  exports: [OrdersRepository, OrdersService, OrderPreparationService],
})
export class OrdersModule {}
