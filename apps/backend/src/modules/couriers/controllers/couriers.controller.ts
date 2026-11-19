import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../common/http/openapi-contract';
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CourierResponseDto } from '../dtos/courier-response.dto';
import { CouriersService } from '../services/couriers.service';

@ApiTags('couriers')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('couriers')
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  @ApiOperation({
    summary: 'Listar repartidores',
    description: 'Roles: ADMIN.',
  })
  @ApiResponse({
    status: 200,
    type: CourierResponseDto,
    isArray: true,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([401, 403, 500])
  @Get()
  findAll(): Promise<CourierResponseDto[]> {
    return this.couriersService.findAll();
  }

  @ApiOperation({
    summary: 'Consultar repartidores por ID',
    description: 'Roles: ADMIN.',
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
  @ApiProblemResponses([400, 401, 403, 404, 500])
  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) idRepartidor: number,
  ): Promise<CourierResponseDto> {
    return this.couriersService.findById(idRepartidor);
  }
}
