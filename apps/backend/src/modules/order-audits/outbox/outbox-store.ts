import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Injectable } from '@nestjs/common';
import type { OrderAuditEvent } from '../models/order-audit.model';

export interface ClaimedAudit {
  evento_id: string;
  payload: OrderAuditEvent;
  concesion_id: string;
  intentos: number;
}
@Injectable()
export class OutboxStore {
  constructor(private readonly source: DataSource) {}
  async claim(): Promise<ClaimedAudit[]> {
    return this.source.transaction(async (manager) => {
      // The predecessor predicate includes leased, delayed AND failed events.
      // Hence SKIP LOCKED cannot cause N+1 to overtake an uncertain N.
      return manager.query<ClaimedAudit[]>(
        `WITH candidates AS (
        SELECT o.evento_id FROM pedido_audit_outbox o
        WHERE ((o.estado = 'PENDIENTE' AND o.proxima_ejecucion <= clock_timestamp())
          OR (o.estado = 'PUBLICANDO' AND o.concesion_hasta <= clock_timestamp()))
        AND NOT EXISTS (SELECT 1 FROM pedido_audit_outbox previous
          WHERE previous.pedido_id = o.pedido_id AND previous.secuencia < o.secuencia
          AND previous.estado <> 'PUBLICADO')
        ORDER BY o.fecha, o.evento_id LIMIT 5 FOR UPDATE OF o SKIP LOCKED
      ), claimed AS (UPDATE pedido_audit_outbox o SET estado = 'PUBLICANDO',
        concesion_id = $1, concesion_hasta = clock_timestamp() + interval '30 seconds',
        intentos = intentos + 1
      FROM candidates c WHERE o.evento_id = c.evento_id
      RETURNING o.evento_id, o.payload, o.concesion_id, o.intentos)
      SELECT * FROM claimed`,
        [randomUUID()],
      );
    });
  }
  async published(row: ClaimedAudit): Promise<void> {
    await this.source.query(
      `UPDATE pedido_audit_outbox SET estado = 'PUBLICADO',
      publicado_en = clock_timestamp(), concesion_id = NULL, concesion_hasta = NULL
      WHERE evento_id = $1 AND concesion_id = $2 AND estado = 'PUBLICANDO'
      AND concesion_hasta > clock_timestamp()`,
      [row.evento_id, row.concesion_id],
    );
  }
  async failed(row: ClaimedAudit): Promise<void> {
    const seconds = Math.min(60, 2 ** Math.min(row.intentos, 6));
    await this.source.query(
      `UPDATE pedido_audit_outbox SET
      estado = CASE WHEN intentos >= 10 THEN 'FALLIDO' ELSE 'PENDIENTE' END,
      proxima_ejecucion = clock_timestamp() + $3::integer * interval '1 second',
      concesion_id = NULL, concesion_hasta = NULL
      WHERE evento_id = $1 AND concesion_id = $2 AND estado = 'PUBLICANDO'
      AND concesion_hasta > clock_timestamp()`,
      [row.evento_id, row.concesion_id, seconds],
    );
  }
  /** Internal diagnostics only: no HTTP endpoint and no payload/PII returned. */
  async status(): Promise<
    { estado: string; cantidad: string; mas_antiguo: Date | null }[]
  > {
    return this.source.query(`SELECT estado, count(*)::text AS cantidad,
      min(fecha) AS mas_antiguo FROM pedido_audit_outbox GROUP BY estado`);
  }
  /** Human-controlled repair after correcting the cause; never replays business actions. */
  async retryFailed(eventoId: string): Promise<void> {
    await this.source.query(
      `UPDATE pedido_audit_outbox SET estado = 'PENDIENTE',
      intentos = 0, proxima_ejecucion = clock_timestamp()
      WHERE evento_id = $1::uuid AND estado = 'FALLIDO'`,
      [eventoId],
    );
  }
}
