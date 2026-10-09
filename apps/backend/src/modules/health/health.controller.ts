import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  ApiProblemResponses,
  DatabaseHealthResponseDto,
} from '../../common/http/openapi-contract';
import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('api/database')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({
    summary: 'Consultar estado de PostgreSQL por ID',
    description: 'Acceso público.',
  })
  @ApiResponse({
    status: 200,
    type: DatabaseHealthResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([503])
  @Get('health')
  checkConnection() {
    return this.healthService.checkConnection();
  }
}
