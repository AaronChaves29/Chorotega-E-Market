import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CourierResponseDto } from '../dtos/courier-response.dto';
import { CouriersService } from '../services/couriers.service';

@Controller('couriers')
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  @Get()
  findAll(): Promise<CourierResponseDto[]> {
    return this.couriersService.findAll();
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) idRepartidor: number,
  ): Promise<CourierResponseDto> {
    return this.couriersService.findById(idRepartidor);
  }
}
