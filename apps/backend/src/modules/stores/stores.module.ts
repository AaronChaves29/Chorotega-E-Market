import { AuthModule } from '../../auth/auth.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { StoresRepository } from './repositories/stores.repository';

import { UsersModule } from '../users/users.module';
import { StoresService } from './services/stores.service';
import { StoresController } from './controllers/stores.controller';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Store]), UsersModule],
  controllers: [StoresController],
  providers: [StoresRepository, StoresService],
  exports: [StoresRepository],
})
export class StoresModule {}
