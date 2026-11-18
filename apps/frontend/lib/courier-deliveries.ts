import { validId } from "@/lib/cart";

export const deliveryStates = [
  "ASIGNADA",
  "EN_CAMINO",
  "ENTREGADA",
  "CANCELADA",
] as const;
export type DeliveryState = (typeof deliveryStates)[number];
export const deliveryLabels: Record<DeliveryState, string> = {
  ASIGNADA: "Asignada",
  EN_CAMINO: "En camino",
  ENTREGADA: "Entregada",
  CANCELADA: "Cancelada",
};
export type CourierDelivery = {
  idEntrega: number;
  idPedido: number;
  idRepartidor: number;
  estado: DeliveryState;
  fechaAsignacion: string;
  fechaEntrega: string | null;
};
export type CourierDeliveryDestination = {
  idEntrega: number;
  idPedido: number;
  direccionEntrega: string;
  nombreBarrio: string;
};
const timestamp = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;

export function projectCourierDelivery(value: unknown): CourierDelivery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const d = value as CourierDelivery;
  if (
    !validId(d.idEntrega) ||
    !validId(d.idPedido) ||
    !validId(d.idRepartidor) ||
    !deliveryStates.includes(d.estado) ||
    !timestamp(d.fechaAsignacion) ||
    (d.estado === "ENTREGADA"
      ? !timestamp(d.fechaEntrega) || d.fechaEntrega < d.fechaAsignacion
      : d.fechaEntrega !== null)
  )
    return null;
  return {
    idEntrega: d.idEntrega,
    idPedido: d.idPedido,
    idRepartidor: d.idRepartidor,
    estado: d.estado,
    fechaAsignacion: d.fechaAsignacion,
    fechaEntrega: d.fechaEntrega,
  };
}

export function projectCourierDeliveryDestination(
  value: unknown,
): CourierDeliveryDestination | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const destination = value as Partial<CourierDeliveryDestination>;
  if (
    !validId(destination.idEntrega) ||
    !validId(destination.idPedido) ||
    typeof destination.direccionEntrega !== "string" ||
    destination.direccionEntrega.trim().length === 0 ||
    destination.direccionEntrega.length > 255 ||
    typeof destination.nombreBarrio !== "string" ||
    destination.nombreBarrio.trim().length === 0 ||
    destination.nombreBarrio.length > 100
  )
    return null;
  return {
    idEntrega: destination.idEntrega,
    idPedido: destination.idPedido,
    direccionEntrega: destination.direccionEntrega,
    nombreBarrio: destination.nombreBarrio,
  };
}

export function courierDeliveryParams(
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
    (state !== "" && !deliveryStates.includes(state as DeliveryState))
  )
    return null;
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
    sortBy: "fechaAsignacion",
    sortDirection: "DESC",
  });
  if (state) params.set("estado", state);
  return params;
}
export function deliveryDate(value: string) {
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
}

export function emptyDeliveryBody(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}
