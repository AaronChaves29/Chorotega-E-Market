import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { auditPayload, type OrderAuditEvent } from './models/order-audit.model';
import { parseAuditEvent } from './repositories/order-audits.repository';
import { writeOrderAudit } from './outbox/order-audit-writer';
import { OrderAuditPublisher } from './outbox/order-audit-publisher';
import type { OutboxStore } from './outbox/outbox-store';
import type { OrderAuditsRepository } from './repositories/order-audits.repository';

const input = {
  pedidoId: 1,
  tipo: 'PEDIDO_CONFIRMADO' as const,
  actor: { idUsuario: 2, rol: 'CLIENTE' },
};
const event = (): OrderAuditEvent => ({
  ...auditPayload(input),
  eventoId: randomUUID(),
  schemaVersion: 1,
  secuencia: 1,
  fecha: new Date('2026-11-19T00:00:00Z'),
});
describe('Bitácora: contratos, privacidad y transacción', () => {
  it('proyecta únicamente campos permitidos sin copiar datos del llamador', () => {
    const value = auditPayload({
      ...input,
      actor: { ...input.actor, correo: 'private' } as typeof input.actor,
      direccion: 'private',
      password: 'private',
    } as typeof input);
    expect(value).toEqual({
      pedidoId: 1,
      tipo: 'PEDIDO_CONFIRMADO',
      actor: { idUsuario: 2, rol: 'CLIENTE' },
      pedido: { anterior: 'PENDIENTE', nuevo: 'CONFIRMADO' },
    });
  });
  it.each(['ADMIN', 'EMPRENDEDOR', 'REPARTIDOR', ''])(
    'rechaza actor %s para confirmación',
    (rol) => {
      expect(() =>
        auditPayload({ ...input, actor: { idUsuario: 2, rol } }),
      ).toThrow();
    },
  );
  it.each([0, -1, 1.1, 2147483648, NaN])(
    'rechaza identificador inválido %s',
    (pedidoId) => {
      expect(() => auditPayload({ ...input, pedidoId })).toThrow();
    },
  );
  it('reconstruye Date de JSON sin reinterpretar la zona', () => {
    const value = event();
    expect(
      parseAuditEvent(JSON.parse(JSON.stringify(value)) as OrderAuditEvent),
    ).toEqual(value);
  });
  it.each(['correo', 'direccion', 'JWT', 'cookie', 'password'])(
    'rechaza campo sensible %s en payload persistido',
    (key) => {
      expect(() => parseAuditEvent({ ...event(), [key]: 'private' })).toThrow();
    },
  );
  it('rechaza versión, estado, fecha y UUID contradictorios', () => {
    for (const patch of [
      { schemaVersion: 2 },
      { pedido: { anterior: 'EN_CAMINO', nuevo: 'CONFIRMADO' } },
      { fecha: 'invalid' },
      { eventoId: 'invalid' },
    ])
      expect(() =>
        parseAuditEvent({ ...event(), ...patch } as OrderAuditEvent),
      ).toThrow();
  });
  it('rechaza escribir fuera de una transacción', async () => {
    const manager = {
      query: jest.fn(),
      queryRunner: { isTransactionActive: false },
    };
    await expect(
      writeOrderAudit(manager as unknown as EntityManager, input),
    ).rejects.toThrow();
    expect(manager.query).not.toHaveBeenCalled();
  });
  it('usa el mismo manager y no continúa si no obtiene el bloqueo final', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ acquired: false }]),
      queryRunner: { isTransactionActive: true },
    };
    await expect(
      writeOrderAudit(manager as unknown as EntityManager, input),
    ).rejects.toThrow();
    expect(manager.query).toHaveBeenCalledTimes(1);
  });
});
describe('Publicador: ejecución y cierre', () => {
  const row = {
    evento_id: randomUUID(),
    concesion_id: randomUUID(),
    intentos: 1,
    payload: event(),
  };
  let store: { claim: jest.Mock; published: jest.Mock; failed: jest.Mock };
  let repository: { appendEvent: jest.Mock };
  let publisher: OrderAuditPublisher;
  beforeEach(() => {
    store = {
      claim: jest.fn().mockResolvedValue([row]),
      published: jest.fn().mockResolvedValue(undefined),
      failed: jest.fn().mockResolvedValue(undefined),
    };
    repository = { appendEvent: jest.fn().mockResolvedValue(undefined) };
    publisher = new OrderAuditPublisher(
      store as unknown as OutboxStore,
      repository as unknown as OrderAuditsRepository,
    );
  });
  it('marca publicado únicamente después del ACK MongoDB', async () => {
    await publisher.runOnce();
    expect(repository.appendEvent.mock.invocationCallOrder[0]).toBeLessThan(
      store.published.mock.invocationCallOrder[0],
    );
    expect(store.failed).not.toHaveBeenCalled();
  });
  it('logs fijos sin secretos ni errores originales; no confirma en fallo', async () => {
    const output = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    repository.appendEvent.mockRejectedValue(
      new Error('mongodb://private:password@host cookie JWT'),
    );
    try {
      await publisher.runOnce();
      expect(store.published).not.toHaveBeenCalled();
      expect(store.failed).toHaveBeenCalledWith(row);
      expect(output).toHaveBeenCalledWith(
        '{"event":"outbox_publish_failed","level":"warn","context":"OrderAuditPublisher"}\n',
      );
    } finally {
      output.mockRestore();
    }
  });
  it('no solapa ticks y cierre espera operaciones activas', async () => {
    let release!: () => void;
    repository.appendEvent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = publisher.runOnce();
    const second = publisher.runOnce();
    expect(first).toBe(second);
    await Promise.resolve();
    const closing = publisher.onModuleDestroy();
    release();
    await closing;
    await publisher.runOnce();
    expect(store.claim).toHaveBeenCalledTimes(1);
  });
});
