import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrdersRepository } from './repositories/orders.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  providers: [OrdersRepository],
  exports: [OrdersRepository],
})
export class OrdersModule {}
