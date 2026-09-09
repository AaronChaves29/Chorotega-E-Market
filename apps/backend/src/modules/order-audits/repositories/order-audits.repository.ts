import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import type { OrderAudit, OrderAuditEvent } from '../models/order-audit.model';
import { MongoDatabaseService } from '../../../database/mongodb/mongodb-database.service';

@Injectable()
export class OrderAuditsRepository {
  constructor(private readonly mongoDatabaseService: MongoDatabaseService) {}

  private get collection(): Collection<OrderAudit> {
    return this.mongoDatabaseService
      .getDatabase()
      .collection<OrderAudit>('bitacora_pedidos');
  }

  async findByPedidoId(pedidoId: number): Promise<OrderAudit | null> {
    return this.collection.findOne({ pedidoId });
  }

  async save(bitacora: OrderAudit): Promise<void> {
    const document: Omit<OrderAudit, '_id'> = {
      pedidoId: bitacora.pedidoId,
      eventos: bitacora.eventos,
    };

    await this.collection.replaceOne(
      { pedidoId: bitacora.pedidoId },
      document,
      { upsert: true },
    );
  }

  async appendEvent(pedidoId: number, evento: OrderAuditEvent): Promise<void> {
    await this.collection.updateOne(
      { pedidoId },
      {
        $push: {
          eventos: evento,
        },
      },
      { upsert: true },
    );
  }
}
