import { OutboxStore } from './outbox/outbox-store';
import { OrderAuditPublisher } from './outbox/order-audit-publisher';
import { Module } from '@nestjs/common';
import { MongoDatabaseModule } from '../../database/mongodb/mongodb-database.module';
import { OrderAuditsRepository } from './repositories/order-audits.repository';

@Module({
  imports: [MongoDatabaseModule],
  providers: [OrderAuditsRepository, OutboxStore, OrderAuditPublisher],
  exports: [OrderAuditsRepository, OutboxStore],
})
export class OrderAuditsModule {}
