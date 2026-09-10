import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delivery } from './entities/delivery.entity';
import { DeliveriesRepository } from './repositories/deliveries.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery])],
  providers: [DeliveriesRepository],
  exports: [DeliveriesRepository],
})
export class DeliveriesModule {}
