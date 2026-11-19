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
  // The counter is the final lock: wait for normal contention rather than reject
  // an otherwise valid operation. Bound waits without raising a stricter timeout.
  await manager.query(`SELECT set_config('lock_timeout',
    (CASE WHEN setting::bigint = 0 THEN 5000
      ELSE LEAST(setting::bigint, 5000) END)::text || 'ms', true)
    FROM pg_settings WHERE name = 'lock_timeout'`);
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
