import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Neighborhood } from './entities/neighborhood.entity';
import { NeighborhoodsRepository } from './repositories/neighborhoods.repository';
import { NeighborhoodsService } from './services/neighborhoods.service';
import { NeighborhoodsController } from './controllers/neighborhoods.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Neighborhood])],
  controllers: [NeighborhoodsController],
  providers: [NeighborhoodsRepository, NeighborhoodsService],
  exports: [NeighborhoodsRepository, NeighborhoodsService],
})
export class NeighborhoodsModule {}
