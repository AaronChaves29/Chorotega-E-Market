import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delivery } from './entities/delivery.entity';
import { DeliveriesRepository } from './repositories/deliveries.repository';
import { DeliveriesService } from './services/deliveries.service';
import { OrdersModule } from '../orders/orders.module';
import { CouriersModule } from '../couriers/couriers.module';
import { NeighborhoodsModule } from '../neighborhoods/neighborhoods.module';
import { DeliveriesController } from './controllers/deliveries.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery]),
    OrdersModule,
    CouriersModule,
    NeighborhoodsModule,
    AuthModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesRepository, DeliveriesService],
  exports: [DeliveriesRepository, DeliveriesService],
})
export class DeliveriesModule {}
