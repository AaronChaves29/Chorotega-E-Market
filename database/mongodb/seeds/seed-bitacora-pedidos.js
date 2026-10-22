db = db.getSiblingDB("chorotega_emarket");

const collectionName = "bitacora_pedidos";

const bitacoraValidator = {
  $jsonSchema: {
    bsonType: "object",
    title: "Validación de la bitácora de pedidos",
    required: ["pedidoId", "eventos"],
    additionalProperties: false,
    properties: {
      _id: {
        bsonType: "objectId",
        description: "Identificador generado por MongoDB"
      },
      pedidoId: {
        bsonType: ["int", "long"],
        description: "Identificador del pedido existente en PostgreSQL"
      },
      eventos: {
        bsonType: "array",
        minItems: 1,
        description: "Historial de eventos asociados al pedido",
        items: {
          bsonType: "object",
          required: ["tipo", "fecha", "detalle"],
          additionalProperties: false,
          properties: {
            tipo: {
              bsonType: "string",
              minLength: 1,
              description: "Tipo de evento ocurrido"
            },
            fecha: {
              bsonType: "date",
              description: "Fecha y hora del evento"
            },
            detalle: {
              bsonType: "string",
              minLength: 1,
              description: "Descripción del evento"
            }
          }
        }
      }
    }
  }
};

const collectionExists = db.getCollectionNames().includes(collectionName);

if (!collectionExists) {
  db.createCollection(collectionName, {
    validator: bitacoraValidator,
    validationLevel: "strict",
    validationAction: "error"
  });
} else {
  db.runCommand({
    collMod: collectionName,
    validator: bitacoraValidator,
    validationLevel: "strict",
    validationAction: "error"
  });
}

db.bitacora_pedidos.createIndex(
  { pedidoId: 1 },
  {
    name: "uq_bitacora_pedido_id",
    unique: true
  }
);

const bitacorasPedidos = [
  {
    pedidoId: 1,
    eventos: [
      {
        tipo: "PEDIDO_CREADO",
        fecha: new Date("2026-08-21T14:00:00Z"),
        detalle: "El cliente creó el pedido"
      },
      {
        tipo: "PEDIDO_CONFIRMADO",
        fecha: new Date("2026-08-21T14:05:00Z"),
        detalle: "El pedido fue confirmado correctamente"
      },
      {
        tipo: "INVENTARIO_ACTUALIZADO",
        fecha: new Date("2026-08-21T14:06:00Z"),
        detalle: "Se descontaron las cantidades compradas del inventario"
      },
      {
        tipo: "PEDIDO_EN_PREPARACION",
        fecha: new Date("2026-08-21T14:20:00Z"),
        detalle: "La tienda comenzó a preparar el pedido"
      },
      {
        tipo: "REPARTIDOR_ASIGNADO",
        fecha: new Date("2026-08-21T15:00:00Z"),
        detalle: "Se asignó un repartidor al pedido"
      },
      {
        tipo: "PEDIDO_EN_CAMINO",
        fecha: new Date("2026-08-21T15:20:00Z"),
        detalle: "El repartidor inició el traslado del pedido"
      }
    ]
  },
  {
    pedidoId: 2,
    eventos: [
      {
        tipo: "PEDIDO_CREADO",
        fecha: new Date("2026-08-22T09:00:00Z"),
        detalle: "El cliente creó el pedido"
      },
      {
        tipo: "PEDIDO_CANCELADO",
        fecha: new Date("2026-08-22T09:10:00Z"),
        detalle: "El cliente canceló el pedido antes de su preparación"
      }
    ]
  },
  {
    pedidoId: 3,
    eventos: [
      {
        tipo: "PEDIDO_CREADO",
        fecha: new Date("2026-08-23T10:00:00Z"),
        detalle: "El cliente creó el pedido"
      },
      {
        tipo: "PEDIDO_CONFIRMADO",
        fecha: new Date("2026-08-23T10:05:00Z"),
        detalle: "La tienda confirmó el pedido"
      },
      {
        tipo: "INVENTARIO_ACTUALIZADO",
        fecha: new Date("2026-08-23T10:06:00Z"),
        detalle: "Se actualizó el inventario del producto solicitado"
      },
      {
        tipo: "PEDIDO_EN_PREPARACION",
        fecha: new Date("2026-08-23T10:20:00Z"),
        detalle: "La tienda comenzó a preparar el pedido"
      }
    ]
  },
  {
    pedidoId: 4,
    eventos: [
      {
        tipo: "PEDIDO_CREADO",
        fecha: new Date("2026-08-24T11:00:00Z"),
        detalle: "El cliente creó el pedido"
      },
      {
        tipo: "PEDIDO_CONFIRMADO",
        fecha: new Date("2026-08-24T11:05:00Z"),
        detalle: "La tienda confirmó el pedido"
      },
      {
        tipo: "INVENTARIO_ACTUALIZADO",
        fecha: new Date("2026-08-24T11:06:00Z"),
        detalle: "Se actualizó el inventario del producto solicitado"
      },
      {
        tipo: "PEDIDO_EN_PREPARACION",
        fecha: new Date("2026-08-24T11:20:00Z"),
        detalle: "La tienda preparó el pedido para su entrega"
      },
      {
        tipo: "REPARTIDOR_ASIGNADO",
        fecha: new Date("2026-08-24T11:30:00Z"),
        detalle: "Se asignó un repartidor al pedido"
      },
      {
        tipo: "PEDIDO_EN_CAMINO",
        fecha: new Date("2026-08-24T12:00:00Z"),
        detalle: "El repartidor inició el traslado del pedido"
      },
      {
        tipo: "PEDIDO_ENTREGADO",
        fecha: new Date("2026-08-24T13:00:00Z"),
        detalle: "El pedido fue entregado correctamente al cliente"
      }
    ]
  }
];

for (const bitacora of bitacorasPedidos) {
  db.bitacora_pedidos.replaceOne(
    { pedidoId: bitacora.pedidoId },
    bitacora,
    { upsert: true }
  );
}
