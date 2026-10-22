import type { ObjectId } from 'mongodb';

export interface OrderAuditEvent {
  tipo: string;
  fecha: Date;
  detalle: string;
}

export interface OrderAudit {
  _id?: ObjectId;
  pedidoId: number;
  eventos: OrderAuditEvent[];
}
