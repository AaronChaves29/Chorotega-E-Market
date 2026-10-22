import { Injectable, NotFoundException } from '@nestjs/common';
import { NeighborhoodResponseDto } from '../dtos/neighborhood-response.dto';
import { NeighborhoodMapper } from '../mappers/neighborhood.mapper';
import { NeighborhoodsRepository } from '../repositories/neighborhoods.repository';

@Injectable()
export class NeighborhoodsService {
  constructor(
    private readonly neighborhoodsRepository: NeighborhoodsRepository,
  ) {}

  async findAll(): Promise<NeighborhoodResponseDto[]> {
    const neighborhoods = await this.neighborhoodsRepository.findAll();

    return neighborhoods.map((neighborhood) =>
      NeighborhoodMapper.toResponseDto(neighborhood),
    );
  }

  async findById(idBarrio: number): Promise<NeighborhoodResponseDto> {
    const neighborhood = await this.neighborhoodsRepository.findById(idBarrio);

    if (!neighborhood) {
      throw new NotFoundException(`Barrio ${idBarrio} no encontrado`);
    }

    return NeighborhoodMapper.toResponseDto(neighborhood);
  }
}
