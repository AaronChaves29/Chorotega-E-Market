import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('api/database')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  checkConnection() {
    return this.healthService.checkConnection();
  }
}
