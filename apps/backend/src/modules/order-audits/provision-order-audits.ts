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
const state = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['anterior', 'nuevo'],
  properties: {
    anterior: { bsonType: ['string', 'null'] },
    nuevo: { bsonType: 'string' },
  },
};
const current = {
  bsonType: 'object',
  additionalProperties: false,
  required: [
    'eventoId',
    'schemaVersion',
    'pedidoId',
    'secuencia',
    'tipo',
    'fecha',
    'actor',
  ],
  properties: {
    eventoId: { bsonType: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    schemaVersion: { enum: [1] },
    pedidoId: integer,
    secuencia: integer,
    tipo: { enum: Object.keys(auditTransitions) },
    fecha: { bsonType: 'date' },
    actor: {
      bsonType: 'object',
      additionalProperties: false,
      required: ['idUsuario', 'rol'],
      properties: {
        idUsuario: integer,
        rol: { enum: ['CLIENTE', 'EMPRENDEDOR', 'ADMIN', 'REPARTIDOR'] },
      },
    },
    entregaId: integer,
    repartidorId: integer,
    pedido: state,
    entrega: state,
  },
};
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
          items: { oneOf: [legacy, current] },
        },
      },
    },
  };
  if (
    !(await database.listCollections({ name }, { nameOnly: true }).hasNext())
  ) {
    await database.createCollection(name); // no data is inserted
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
