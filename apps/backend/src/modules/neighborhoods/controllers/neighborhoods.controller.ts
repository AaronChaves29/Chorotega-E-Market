import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../common/http/openapi-contract';
import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { NeighborhoodResponseDto } from '../dtos/neighborhood-response.dto';
import { NeighborhoodsService } from '../services/neighborhoods.service';

@ApiTags('neighborhoods')
@Controller('neighborhoods')
export class NeighborhoodsController {
  constructor(private readonly neighborhoodsService: NeighborhoodsService) {}

  @ApiOperation({
    summary: 'Listar barrios',
    description: 'Acceso público.',
  })
  @ApiResponse({
    status: 200,
    type: NeighborhoodResponseDto,
    isArray: true,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([500])
  @Get()
  findAll(): Promise<NeighborhoodResponseDto[]> {
    return this.neighborhoodsService.findAll();
  }

  @ApiOperation({
    summary: 'Consultar barrios por ID',
    description: 'Acceso público.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: NeighborhoodResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 404, 500])
  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) idBarrio: number,
  ): Promise<NeighborhoodResponseDto> {
    return this.neighborhoodsService.findById(idBarrio);
  }
}
