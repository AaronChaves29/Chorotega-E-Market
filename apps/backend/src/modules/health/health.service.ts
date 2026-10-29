import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async checkConnection() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'connected' as const };
    } catch {
      throw new ServiceUnavailableException({
        status: 'disconnected',
        message: 'No fue posible conectarse con la base de datos.',
      });
    }
  }
}
