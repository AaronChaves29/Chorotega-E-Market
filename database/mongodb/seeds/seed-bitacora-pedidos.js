db = db.getSiblingDB("chorotega_emarket");

db.bitacora_pedidos.insertMany([
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
      }
    ]
  }
]);