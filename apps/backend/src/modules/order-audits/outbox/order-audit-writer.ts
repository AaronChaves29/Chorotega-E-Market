import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import {
  auditPayload,
  type AuditInput,
  type OrderAuditEvent,
} from '../models/order-audit.model';

/** Must be the LAST database operation of a business transaction. No external IO. */
export async function writeOrderAudit(
  manager: EntityManager,
  input: AuditInput,
): Promise<void> {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('La bitácora requiere una transacción activa.');
  const payload = auditPayload(input);
  // Limit counter contention without changing the caller's transaction settings.
  // try advisory lock avoids an indefinite wait and uses a separate lock namespace.
  const [lock] = await manager.query<{ acquired: boolean }[]>(
    'SELECT pg_try_advisory_xact_lock(512, $1) AS acquired',
    [input.pedidoId],
  );
  if (!lock.acquired) throw new Error('Secuencia de bitácora ocupada.');
  const [counter] = await manager.query<{ secuencia: number }[]>(
    `INSERT INTO pedido_audit_sequence (pedido_id, secuencia)
    VALUES ($1, 1) ON CONFLICT (pedido_id) DO UPDATE
    SET secuencia = pedido_audit_sequence.secuencia + 1 RETURNING secuencia`,
    [input.pedidoId],
  );
  const event: OrderAuditEvent = {
    ...payload,
    eventoId: randomUUID(),
    schemaVersion: 1,
    secuencia: counter.secuencia,
    fecha: new Date(),
  };
  await manager.query(
    `INSERT INTO pedido_audit_outbox
    (evento_id,pedido_id,secuencia,tipo,schema_version,payload,fecha)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [
      event.eventoId,
      event.pedidoId,
      event.secuencia,
      event.tipo,
      event.schemaVersion,
      JSON.stringify(event),
      event.fecha,
    ],
  );
}
