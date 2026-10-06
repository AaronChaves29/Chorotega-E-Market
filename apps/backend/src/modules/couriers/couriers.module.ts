import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Courier } from './entities/courier.entity';
import { CouriersRepository } from './repositories/couriers.repository';
import { CouriersService } from './services/couriers.service';
import { CouriersController } from './controllers/couriers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Courier])],
  controllers: [CouriersController],
  providers: [CouriersRepository, CouriersService],
  exports: [CouriersRepository, CouriersService],
})
export class CouriersModule {}
