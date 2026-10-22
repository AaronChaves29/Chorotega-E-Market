import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderDetail } from './entities/order-detail.entity';
import { OrderDetailsRepository } from './repositories/order-details.repository';

@Module({
  imports: [TypeOrmModule.forFeature([OrderDetail])],
  providers: [OrderDetailsRepository],
  exports: [OrderDetailsRepository],
})
export class OrderDetailsModule {}
