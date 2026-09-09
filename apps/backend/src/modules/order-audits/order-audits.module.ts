import { Module } from '@nestjs/common';
import { MongoDatabaseModule } from '../../database/mongodb/mongodb-database.module';
import { OrderAuditsRepository } from './repositories/order-audits.repository';

@Module({
  imports: [MongoDatabaseModule],
  providers: [OrderAuditsRepository],
  exports: [OrderAuditsRepository],
})
export class OrderAuditsModule {}
