import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { NeighborhoodResponseDto } from '../dtos/neighborhood-response.dto';
import { NeighborhoodsService } from '../services/neighborhoods.service';

@Controller('neighborhoods')
export class NeighborhoodsController {
  constructor(private readonly neighborhoodsService: NeighborhoodsService) {}

  @Get()
  findAll(): Promise<NeighborhoodResponseDto[]> {
    return this.neighborhoodsService.findAll();
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) idBarrio: number,
  ): Promise<NeighborhoodResponseDto> {
    return this.neighborhoodsService.findById(idBarrio);
  }
}
