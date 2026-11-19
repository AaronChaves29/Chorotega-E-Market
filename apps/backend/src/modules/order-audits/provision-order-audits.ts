import type { Db } from 'mongodb';
import { auditTransitions } from './models/order-audit.model';

const integer = { bsonType: ['int', 'long'], minimum: 1 };
const legacy = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['tipo', 'fecha', 'detalle'],
  properties: {
    tipo: { bsonType: 'string' },
    fecha: { bsonType: 'date' },
    detalle: { bsonType: 'string' },
  },
};
const orderStates = [
  'PENDIENTE',
  'CONFIRMADO',
  'PREPARANDO',
  'EN_CAMINO',
  'ENTREGADO',
  'CANCELADO',
];
const current = Object.entries(auditTransitions).map(([tipo, transition]) => {
  const properties: Record<string, unknown> = {
    eventoId: {
      bsonType: 'string',
      pattern:
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    },
    schemaVersion: { enum: [1] },
    pedidoId: integer,
    secuencia: integer,
    tipo: { enum: [tipo] },
    fecha: { bsonType: 'date' },
    actor: {
      bsonType: 'object',
      additionalProperties: false,
      required: ['idUsuario', 'rol'],
      properties: { idUsuario: integer, rol: { enum: [transition.rol] } },
    },
  };
  if ('pedido' in transition) {
    const previous =
      'entrega' in transition
        ? orderStates
        : tipo === 'PEDIDO_CANCELADO'
          ? ['PENDIENTE', 'CONFIRMADO']
          : [transition.pedido[0]];
    properties.pedido = {
      bsonType: 'object',
      additionalProperties: false,
      required: ['anterior', 'nuevo'],
      properties: {
        anterior: { enum: previous },
        nuevo: { enum: [transition.pedido[1]] },
      },
    };
  }
  if ('entrega' in transition) {
    properties.entregaId = integer;
    properties.repartidorId = integer;
    properties.entrega = {
      bsonType: 'object',
      additionalProperties: false,
      required: ['anterior', 'nuevo'],
      properties: {
        anterior: { enum: [transition.entrega[0]] },
        nuevo: { enum: [transition.entrega[1]] },
      },
    };
  }
  return {
    bsonType: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
});
/** Explicit provisioning, never fixtures or destructive history replacement. */
export async function provisionOrderAudits(database: Db): Promise<void> {
  const name = 'bitacora_pedidos';
  const validator = {
    $jsonSchema: {
      bsonType: 'object',
      additionalProperties: false,
      required: ['pedidoId', 'eventos'],
      properties: {
        _id: { bsonType: 'objectId' },
        pedidoId: integer,
        ultimaSecuencia: { bsonType: ['int', 'long'], minimum: 0 },
        eventos: {
          bsonType: 'array',
          minItems: 1,
          items: { oneOf: [legacy, ...current] },
        },
      },
    },
  };
  if (
    !(await database.listCollections({ name }, { nameOnly: true }).hasNext())
  ) {
    try {
      await database.createCollection(name);
    } catch (error: unknown) {
      // no data is inserted
      // Another provisioner may have created the same empty collection.
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 48
      ))
        throw error;
    }
  }
  // Fail safely on existing duplicates. Never delete or merge documents here.
  await database
    .collection(name)
    .createIndex(
      { pedidoId: 1 },
      { unique: true, name: 'uq_bitacora_pedido_id' },
    );
  await database.command({
    collMod: name,
    validator,
    validationLevel: 'strict',
    validationAction: 'error',
  });
}
