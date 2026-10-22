import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongoDatabaseService } from './mongodb-database.service';

@Module({
  imports: [ConfigModule],
  providers: [MongoDatabaseService],
  exports: [MongoDatabaseService],
})
export class MongoDatabaseModule {}
