import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderAuditOutbox1795082400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // No FK to commercial rows: the audit writer acquires its counter LAST.
    // A FK here could introduce a new order lock after delivery/courier locks.
    await runner.query(`CREATE TABLE pedido_audit_sequence (
      pedido_id integer PRIMARY KEY CHECK (pedido_id > 0),
      secuencia integer NOT NULL CHECK (secuencia > 0)
    )`);
    await runner.query(`CREATE TABLE pedido_audit_outbox (
      evento_id uuid PRIMARY KEY,
      pedido_id integer NOT NULL CHECK (pedido_id > 0),
      secuencia integer NOT NULL CHECK (secuencia > 0),
      tipo text NOT NULL CHECK (tipo IN ('PEDIDO_CONFIRMADO','PEDIDO_CANCELADO',
        'PEDIDO_PREPARANDO','ENTREGA_ASIGNADA','ENTREGA_CANCELADA',
        'ENTREGA_EN_CAMINO','PEDIDO_ENTREGADO')),
      schema_version integer NOT NULL CHECK (schema_version = 1),
      payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
      fecha timestamptz NOT NULL,
      CHECK (payload ?& ARRAY['eventoId','schemaVersion','pedidoId','secuencia','tipo','fecha','actor']),
      CHECK ((payload - ARRAY['eventoId','schemaVersion','pedidoId','secuencia','tipo','fecha','actor','pedido','entrega','entregaId','repartidorId']::text[]) = '{}'::jsonb),
      CHECK (jsonb_typeof(payload->'eventoId') = 'string'
        AND jsonb_typeof(payload->'tipo') = 'string'
        AND jsonb_typeof(payload->'fecha') = 'string'),
      CHECK (payload->>'eventoId' = evento_id::text AND payload->>'tipo' = tipo
        AND payload->'schemaVersion' = to_jsonb(schema_version)
        AND payload->'pedidoId' = to_jsonb(pedido_id)
        AND payload->'secuencia' = to_jsonb(secuencia)
        AND (payload->>'fecha')::timestamptz = fecha),
      CHECK (jsonb_typeof(payload->'actor') = 'object'
        AND (payload->'actor') ?& ARRAY['idUsuario','rol']
        AND ((payload->'actor') - ARRAY['idUsuario','rol']::text[]) = '{}'::jsonb),
      estado text NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','PUBLICANDO','PUBLICADO','FALLIDO')),
      intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
      proxima_ejecucion timestamptz NOT NULL DEFAULT clock_timestamp(),
      concesion_id uuid,
      concesion_hasta timestamptz,
      publicado_en timestamptz,
      CONSTRAINT uq_pedido_audit_sequence UNIQUE (pedido_id, secuencia),
      CHECK ((concesion_id IS NULL) = (concesion_hasta IS NULL)),
      CHECK ((estado = 'PUBLICANDO') =
        (concesion_id IS NOT NULL AND concesion_hasta IS NOT NULL)),
      CHECK ((estado = 'PUBLICADO') = (publicado_en IS NOT NULL))
    )`);
    await runner.query(`CREATE INDEX idx_pedido_audit_pending
      ON pedido_audit_outbox (proxima_ejecucion, fecha)
      WHERE estado <> 'PUBLICADO'`);
    await runner.query(`CREATE INDEX idx_pedido_audit_predecessor
      ON pedido_audit_outbox (pedido_id, secuencia) WHERE estado <> 'PUBLICADO'`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE pedido_audit_outbox');
    await runner.query('DROP TABLE pedido_audit_sequence');
  }
}
