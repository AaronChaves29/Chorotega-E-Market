import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, type Db } from 'mongodb';

@Injectable()
export class MongoDatabaseService implements OnModuleInit, OnModuleDestroy {
  private client: MongoClient | null = null;
  private database: Db | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.configService.get<string>('MONGODB_URI');
    const databaseName = this.configService.get<string>('MONGODB_DATABASE');

    if (!uri) {
      throw new Error(
        'La variable de entorno MONGODB_URI no está configurada.',
      );
    }

    if (!databaseName) {
      throw new Error(
        'La variable de entorno MONGODB_DATABASE no está configurada.',
      );
    }

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.database = this.client.db(databaseName);
  }

  getDatabase(): Db {
    if (!this.database) {
      throw new Error('La conexión con MongoDB no está inicializada.');
    }

    return this.database;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }
}
