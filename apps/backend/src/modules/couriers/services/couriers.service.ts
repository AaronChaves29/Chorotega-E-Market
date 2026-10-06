import { Injectable, NotFoundException } from '@nestjs/common';
import { CourierResponseDto } from '../dtos/courier-response.dto';
import { CourierMapper } from '../mappers/courier.mapper';
import { CouriersRepository } from '../repositories/couriers.repository';

@Injectable()
export class CouriersService {
  constructor(private readonly couriersRepository: CouriersRepository) {}

  async findAll(): Promise<CourierResponseDto[]> {
    const couriers = await this.couriersRepository.findAll();

    return couriers.map((courier) => CourierMapper.toResponseDto(courier));
  }

  async findById(idRepartidor: number): Promise<CourierResponseDto> {
    const courier = await this.couriersRepository.findById(idRepartidor);

    if (!courier) {
      throw new NotFoundException(`Repartidor ${idRepartidor} no encontrado`);
    }

    return CourierMapper.toResponseDto(courier);
  }
}
