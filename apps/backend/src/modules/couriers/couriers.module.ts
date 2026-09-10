import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Courier } from './entities/courier.entity';
import { CouriersRepository } from './repositories/couriers.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Courier])],
  providers: [CouriersRepository],
  exports: [CouriersRepository],
})
export class CouriersModule {}
