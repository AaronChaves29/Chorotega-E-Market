import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../common/http/openapi-contract';
import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CourierResponseDto } from '../dtos/courier-response.dto';
import { CouriersService } from '../services/couriers.service';

@ApiTags('couriers')
@Controller('couriers')
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  @ApiOperation({
    summary: 'Listar repartidores',
    description: 'Acceso público.',
  })
  @ApiResponse({
    status: 200,
    type: CourierResponseDto,
    isArray: true,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([500])
  @Get()
  findAll(): Promise<CourierResponseDto[]> {
    return this.couriersService.findAll();
  }

  @ApiOperation({
    summary: 'Consultar repartidores por ID',
    description: 'Acceso público.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: CourierResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 404, 500])
  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) idRepartidor: number,
  ): Promise<CourierResponseDto> {
    return this.couriersService.findById(idRepartidor);
  }
}
