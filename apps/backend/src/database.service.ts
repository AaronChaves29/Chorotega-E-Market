import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseService {
  constructor(private readonly dataSource: DataSource) {}

  async checkConnection() {
    try {
      const result: Array<{
        database_name: string;
        current_time: Date;
      }> = await this.dataSource.query(`
        SELECT
          current_database() AS database_name,
          NOW() AS current_time
      `);

      return {
        status: 'connected',
        database: result[0].database_name,
        timestamp: result[0].current_time,
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'disconnected',
        message: 'No fue posible conectarse con la base de datos.',
      });
    }
  }
}
