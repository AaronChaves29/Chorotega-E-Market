import { Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { Collection } from 'mongodb';
import {
  auditPayload,
  type OrderAudit,
  type OrderAuditEvent,
} from '../models/order-audit.model';
import { MongoDatabaseService } from '../../../database/mongodb/mongodb-database.service';

export function parseAuditEvent(raw: OrderAuditEvent): OrderAuditEvent {
  if (!(raw.fecha instanceof Date) && typeof raw.fecha !== 'string')
    throw new Error('Fecha de bitácora no válida.');
  const date = new Date(raw.fecha);
  const body = auditPayload({
    pedidoId: raw.pedidoId,
    tipo: raw.tipo,
    actor: raw.actor,
    entregaId: raw.entregaId,
    repartidorId: raw.repartidorId,
    pedidoAnterior: raw.pedido?.anterior,
  });
  const expected: OrderAuditEvent = {
    ...body,
    eventoId: raw.eventoId,
    schemaVersion: 1,
    secuencia: raw.secuencia,
    fecha: date,
  };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw.eventoId,
    ) ||
    !Number.isSafeInteger(raw.secuencia) ||
    raw.secuencia < 1 ||
    !Number.isFinite(date.getTime()) ||
    (typeof raw.fecha === 'string' && raw.fecha !== date.toISOString()) ||
    !isDeepStrictEqual({ ...raw, fecha: date }, expected)
  )
    throw new Error('Evento de bitácora no válido.');
  return expected;
}
@Injectable()
export class OrderAuditsRepository {
  constructor(private readonly mongoDatabaseService: MongoDatabaseService) {}
  private get collection(): Collection<OrderAudit> {
    return this.mongoDatabaseService
      .getDatabase()
      .collection<OrderAudit>('bitacora_pedidos');
  }
  async findByPedidoId(pedidoId: number): Promise<OrderAudit | null> {
    const document = await this.collection.findOne(
      { pedidoId },
      { timeoutMS: 5000 },
    );
    if (document) {
      const legacy = document.eventos.filter((event) => !('eventoId' in event));
      const current = document.eventos
        .filter((event): event is OrderAuditEvent => 'eventoId' in event)
        .sort((a, b) => a.secuencia - b.secuencia);
      document.eventos = [...legacy, ...current];
    }
    return document;
  }
  async appendEvent(pedidoId: number, raw: OrderAuditEvent): Promise<void> {
    const indexes = (await this.collection
      .listIndexes({ timeoutMS: 5000 })
      .toArray()) as unknown as {
      unique?: boolean;
      partialFilterExpression?: unknown;
      sparse?: boolean;
      key: Record<string, number>;
    }[];
    if (
      !indexes.some(
        (index) =>
          index.unique === true &&
          index.partialFilterExpression === undefined &&
          index.sparse !== true &&
          Object.keys(index.key).length === 1 &&
          index.key.pedidoId === 1,
      )
    )
      throw new Error('La bitácora requiere el índice único aprovisionado.');
    const event = parseAuditEvent(raw);
    if (pedidoId !== event.pedidoId)
      throw new Error('Pedido de bitácora no válido.');
    const options = {
      timeoutMS: 5000,
      writeConcern: { w: 'majority' as const },
    };
    if (event.secuencia === 1) {
      try {
        await this.collection.updateOne(
          { pedidoId },
          {
            $setOnInsert: {
              pedidoId,
              eventos: [event],
              ultimaSecuencia: 1,
            },
          },
          { ...options, upsert: true },
        );
      } catch (error: unknown) {
        // Only a real duplicate-index race is reconciled; other errors propagate.
        if (!(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 11000
        ))
          throw error;
      }
    }
    // Upgrade metadata only on legacy histories. No invented historical events.
    await this.collection.updateOne(
      {
        pedidoId,
        ultimaSecuencia: { $exists: false },
        'eventos.eventoId': { $exists: false },
      },
      { $set: { ultimaSecuencia: 0 } },
      options,
    );
    await this.collection.updateOne(
      {
        pedidoId,
        ultimaSecuencia: event.secuencia - 1,
        'eventos.eventoId': { $ne: event.eventoId },
      },
      {
        $push: { eventos: event },
        $set: { ultimaSecuencia: event.secuencia },
      },
      options,
    );
    const result = await this.collection.findOne(
      { pedidoId },
      { timeoutMS: 5000, readConcern: { level: 'majority' } },
    );
    const matching = result?.eventos.filter(
      (item) => 'eventoId' in item && item.eventoId === event.eventoId,
    );
    if (matching?.length !== 1 || !isDeepStrictEqual(matching[0], event))
      throw new Error('No se pudo confirmar la secuencia de bitácora.');
  }
}
