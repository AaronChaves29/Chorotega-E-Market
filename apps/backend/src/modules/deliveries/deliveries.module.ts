import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delivery } from './entities/delivery.entity';
import { DeliveriesRepository } from './repositories/deliveries.repository';
import { DeliveriesService } from './services/deliveries.service';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery])],
  providers: [DeliveriesRepository, DeliveriesService],
  exports: [DeliveriesRepository, DeliveriesService],
})
export class DeliveriesModule {}
