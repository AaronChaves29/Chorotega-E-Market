import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('api/database')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('health')
  checkConnection() {
    return this.databaseService.checkConnection();
  }
}