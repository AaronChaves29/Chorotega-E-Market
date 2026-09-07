import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { StoresRepository } from './repositories/stores.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  providers: [StoresRepository],
  exports: [StoresRepository],
})
export class StoresModule {}
