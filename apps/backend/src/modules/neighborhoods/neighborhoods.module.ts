import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Neighborhood } from './entities/neighborhood.entity';
import { NeighborhoodsRepository } from './repositories/neighborhoods.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Neighborhood])],
  providers: [NeighborhoodsRepository],
  exports: [NeighborhoodsRepository],
})
export class NeighborhoodsModule {}
