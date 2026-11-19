import type { OrderState, OrderItem } from "@/types/orders";
import type { Store } from "@/types/catalog";
import { validId } from "@/lib/cart";
import { costaRicaDateTime } from "@/lib/date-time";

export const orderStates: readonly OrderState[] = [
  "PENDIENTE",
  "CONFIRMADO",
  "PREPARANDO",
  "EN_CAMINO",
  "ENTREGADO",
  "CANCELADO",
];
export const orderLabels: Record<OrderState, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADO: "Confirmado",
  PREPARANDO: "Preparando",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};
export type OrderStore = Pick<Store, "idTienda" | "nombre" | "estado">;
export type ManagedOrderSummary = {
  idPedido: number;
  idTienda: number;
  estado: OrderState;
  fechaCreacion: string;
  total: string;
  lineas: number;
  unidades: number;
};
export type ManagedOrder = ManagedOrderSummary & {
  direccionEntrega: string;
  subtotal: string;
  tarifaEnvio: string;
  items: OrderItem[];
};
export type OrderDetailData = { store: OrderStore; order: ManagedOrder };
export function projectManagedOrder(value: unknown): ManagedOrder | null {
  if (!value || typeof value !== "object") return null;
  const o = value as ManagedOrder;
  const money = (v: unknown): v is string =>
    typeof v === "string" && /^\d{1,8}\.\d{2}$/.test(v);
  if (
    !validId(o.idPedido) ||
    !validId(o.idTienda) ||
    !orderStates.includes(o.estado) ||
    typeof o.fechaCreacion !== "string" ||
    !Number.isFinite(Date.parse(o.fechaCreacion)) ||
    typeof o.direccionEntrega !== "string" ||
    o.direccionEntrega.length > 255 ||
    !money(o.subtotal) ||
    !money(o.tarifaEnvio) ||
    !money(o.total) ||
    !Array.isArray(o.items)
  )
    return null;
  const items: OrderItem[] = [];
  const seen = new Set<number>();
  let unidades = 0;
  for (const raw of o.items) {
    if (!raw || typeof raw !== "object") return null;
    const d = raw as OrderItem;
    if (
      !validId(d.idDetalle) ||
      seen.has(d.idDetalle) ||
      !validId(d.idProducto) ||
      !validId(d.cantidad) ||
      !money(d.precioUnitario) ||
      !/[1-9]/.test(d.precioUnitario) ||
      !money(d.subtotal)
    )
      return null;
    seen.add(d.idDetalle);
    unidades += d.cantidad;
    if (!Number.isSafeInteger(unidades)) return null;
    items.push({
      idDetalle: d.idDetalle,
      idProducto: d.idProducto,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      subtotal: d.subtotal,
    });
  }
  return {
    idPedido: o.idPedido,
    idTienda: o.idTienda,
    estado: o.estado,
    fechaCreacion: o.fechaCreacion,
    total: o.total,
    lineas: items.length,
    unidades,
    direccionEntrega: o.direccionEntrega,
    subtotal: o.subtotal,
    tarifaEnvio: o.tarifaEnvio,
    items,
  };
}
export function orderSummary(o: ManagedOrder): ManagedOrderSummary {
  return {
    idPedido: o.idPedido,
    idTienda: o.idTienda,
    estado: o.estado,
    fechaCreacion: o.fechaCreacion,
    total: o.total,
    lineas: o.lineas,
    unidades: o.unidades,
  };
}
export function managedOrderParams(
  input: URLSearchParams,
): URLSearchParams | null {
  if (
    [...input.keys()].some(
      (k) =>
        !["page", "size", "estado"].includes(k) || input.getAll(k).length !== 1,
    )
  )
    return null;
  const p = input.get("page") ?? "0",
    s = input.get("size") ?? "6",
    state = input.get("estado") ?? "";
  const page = Number(p),
    size = Number(s);
  if (
    !/^\d+$/.test(p) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 2147483647 ||
    !/^\d+$/.test(s) ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100 ||
    !Number.isSafeInteger(page * size) ||
    (state !== "" && !orderStates.includes(state as OrderState))
  )
    return null;
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
    sortBy: "fechaCreacion",
    sortDirection: "DESC",
  });
  if (state) params.set("estado", state);
  return params;
}
export function emptyPrepareBody(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}
export function orderDate(value: string) {
  return costaRicaDateTime(value);
}
