import type { ObjectId } from 'mongodb';

export const auditTransitions = {
  PEDIDO_CONFIRMADO: { rol: 'CLIENTE', pedido: ['PENDIENTE', 'CONFIRMADO'] },
  PEDIDO_CANCELADO: { rol: 'CLIENTE', pedido: ['CONFIRMADO', 'CANCELADO'] },
  PEDIDO_PREPARANDO: {
    rol: 'EMPRENDEDOR',
    pedido: ['CONFIRMADO', 'PREPARANDO'],
  },
  ENTREGA_ASIGNADA: { rol: 'ADMIN', entrega: [null, 'ASIGNADA'] },
  ENTREGA_CANCELADA: { rol: 'ADMIN', entrega: ['ASIGNADA', 'CANCELADA'] },
  ENTREGA_EN_CAMINO: {
    rol: 'REPARTIDOR',
    pedido: ['PREPARANDO', 'EN_CAMINO'],
    entrega: ['ASIGNADA', 'EN_CAMINO'],
  },
  PEDIDO_ENTREGADO: {
    rol: 'REPARTIDOR',
    pedido: ['EN_CAMINO', 'ENTREGADO'],
    entrega: ['EN_CAMINO', 'ENTREGADA'],
  },
} as const;
export type AuditEventType = keyof typeof auditTransitions;
export interface AuditInput {
  pedidoId: number;
  tipo: AuditEventType;
  actor: { idUsuario: number; rol: string };
  entregaId?: number;
  repartidorId?: number;
  pedidoAnterior?: string;
}
export interface OrderAuditEvent {
  eventoId: string;
  schemaVersion: 1;
  pedidoId: number;
  secuencia: number;
  tipo: AuditEventType;
  fecha: Date;
  actor: { idUsuario: number; rol: string };
  entregaId?: number;
  repartidorId?: number;
  pedido?: { anterior: string; nuevo: string };
  entrega?: { anterior: string | null; nuevo: string };
}
export interface LegacyOrderAuditEvent {
  tipo: string;
  fecha: Date;
  detalle: string;
}
export interface OrderAudit {
  _id?: ObjectId;
  pedidoId: number;
  ultimaSecuencia?: number;
  eventos: (OrderAuditEvent | LegacyOrderAuditEvent)[];
}
const positive = (value: number) =>
  Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
export function auditPayload(
  input: AuditInput,
): Omit<OrderAuditEvent, 'eventoId' | 'secuencia' | 'fecha' | 'schemaVersion'> {
  const transition = auditTransitions[input.tipo];
  if (
    !Object.hasOwn(auditTransitions, input.tipo) ||
    !transition ||
    !positive(input.pedidoId) ||
    !positive(input.actor?.idUsuario) ||
    input.actor.rol !== transition.rol
  )
    throw new Error('Evento de bitácora no válido.');
  const payload: ReturnType<typeof auditPayload> = {
    pedidoId: input.pedidoId,
    tipo: input.tipo,
    actor: { idUsuario: input.actor.idUsuario, rol: transition.rol },
  };
  if ('pedido' in transition) {
    const previous =
      input.tipo === 'PEDIDO_CANCELADO' && input.pedidoAnterior === 'PENDIENTE'
        ? 'PENDIENTE'
        : transition.pedido[0];
    if (input.pedidoAnterior !== undefined && input.pedidoAnterior !== previous)
      throw new Error('Estado de bitácora no válido.');
    payload.pedido = { anterior: previous, nuevo: transition.pedido[1] };
  }
  if ('entrega' in transition) {
    if (!positive(input.entregaId!) || !positive(input.repartidorId!))
      throw new Error('Entrega de bitácora no válida.');
    payload.entregaId = input.entregaId;
    payload.repartidorId = input.repartidorId;
    payload.entrega = {
      anterior: transition.entrega[0],
      nuevo: transition.entrega[1],
    };
  }
  return payload;
}
