import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrdersRepository } from './repositories/orders.repository';
import { OrdersService } from './services/orders.service';
import { OrderTransaction } from './transactions/order-transaction';
import { OrderCancellationService } from './services/order-cancellation.service';
import { OrderPreparationService } from './services/order-preparation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  providers: [
    OrdersRepository,
    OrderTransaction,
    OrdersService,
    OrderPreparationService,
    OrderCancellationService,
  ],
  exports: [
    OrdersRepository,
    OrdersService,
    OrderPreparationService,
    OrderCancellationService,
  ],
})
export class OrdersModule {}
