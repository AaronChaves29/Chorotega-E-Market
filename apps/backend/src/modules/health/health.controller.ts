import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../common/http/openapi-contract';
import { DatabaseHealthResponseDto } from './dtos/database-health-response.dto';
import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('api/database')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({
    summary: 'Consultar disponibilidad de PostgreSQL',
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
