import type { CreateOrderRequest } from "@/types/catalog";
import type { Order } from "@/types/orders";
import { cents, validId } from "@/lib/cart";

export type Submission =
  | { status: "created"; order: Order }
  | { status: "rejected"; code: number; message: string }
  | { status: "uncertain"; message: string };
const uncertain = (): Submission => ({
  status: "uncertain",
  message:
    "No pudimos confirmar el resultado. No reenviés la compra; revisá Mis pedidos antes de continuar.",
});

// Both manual creation and cart checkout use the same non-retrying request.
export async function submitOrder(
  body: CreateOrderRequest,
  options: { scope?: string; storeId?: number } = {},
): Promise<Submission> {
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.scope ? { "X-Cart-Scope": options.scope } : {}),
      },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status >= 500 || [408, 429].includes(response.status))
        return uncertain();
      return {
        status: "rejected",
        code: response.status,
        message:
          response.status === 401
            ? "Tu sesión venció."
            : "No se pudo crear el pedido. Revisá la disponibilidad y los datos de entrega.",
      };
    }
    const order = data as Order | null;
    if (
      response.status !== 201 ||
      !order ||
      !validId(order.idPedido) ||
      !validId(order.idTienda) ||
      !validId(order.idCliente) ||
      (options.storeId !== undefined && order.idTienda !== options.storeId) ||
      order.estado !== "CONFIRMADO" ||
      order.idBarrio !== body.idBarrio ||
      order.direccionEntrega !== body.direccionEntrega ||
      !Array.isArray(order.items) ||
      order.items.length !== body.items.length ||
      !order.items.every(
        (i) =>
          validId(i.idProducto) &&
          validId(i.cantidad) &&
          cents(i.subtotal) === cents(i.precioUnitario) * BigInt(i.cantidad) &&
          body.items.some(
            (b) => b.idProducto === i.idProducto && b.cantidad === i.cantidad,
          ),
      ) ||
      new Set(order.items.map((i) => i.idProducto)).size !==
        body.items.length ||
      order.items.reduce((sum, i) => sum + cents(i.subtotal), BigInt(0)) !==
        cents(order.subtotal) ||
      cents(order.total) !== cents(order.subtotal) + cents(order.tarifaEnvio)
    )
      return uncertain();
    return { status: "created", order };
  } catch {
    return uncertain();
  }
}
