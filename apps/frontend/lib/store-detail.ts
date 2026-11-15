import type { PaginatedResponse, Product, Store } from "@/types/catalog";

export type StoreDetail = Pick<
  Store,
  | "idTienda"
  | "nombre"
  | "descripcion"
  | "direccion"
  | "telefono"
  | "horario"
  | "estado"
>;
export type StoreProduct = Pick<
  Product,
  | "idProducto"
  | "idTienda"
  | "nombre"
  | "descripcion"
  | "precio"
  | "cantidadDisponible"
  | "estado"
>;

export function positiveId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) &&
    Number.isInteger(id) &&
    id > 0 &&
    id <= 2147483647
    ? id
    : null;
}

export function isStoreDetail(value: unknown): value is StoreDetail {
  if (!value || typeof value !== "object") return false;
  const store = value as Partial<StoreDetail>;
  return (
    Number.isInteger(store.idTienda) &&
    Number(store.idTienda) > 0 &&
    typeof store.nombre === "string" &&
    typeof store.direccion === "string" &&
    (store.descripcion === null || typeof store.descripcion === "string") &&
    (store.telefono === null || typeof store.telefono === "string") &&
    (store.horario === null || typeof store.horario === "string") &&
    ["ACTIVA", "INACTIVA"].includes(String(store.estado))
  );
}

// Separate from /api/products: its existing defaults remain unchanged for orders.
export function storeProductParams(
  input: URLSearchParams,
  id: number,
): URLSearchParams | null {
  const allowed = [
    "page",
    "size",
    "sortBy",
    "sortDirection",
    "soloDisponibles",
    "nombre",
  ];
  if (
    [...input.keys()].some((key) => !allowed.includes(key)) ||
    allowed.some((key) => input.getAll(key).length > 1)
  )
    return null;
  const pageText = input.get("page") ?? "0";
  const sizeText = input.get("size") ?? "6";
  const page = Number(pageText),
    size = Number(sizeText);
  const nombre = input.get("nombre") ?? "";
  const sortBy = input.get("sortBy") ?? "nombre";
  const sortDirection = input.get("sortDirection") ?? "ASC";
  const available = input.get("soloDisponibles") ?? "false";
  if (
    positiveId(String(id)) === null ||
    !/^\d+$/.test(pageText) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !/^\d+$/.test(sizeText) ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100 ||
    !Number.isSafeInteger(page * size) ||
    nombre.length > 150 ||
    !["nombre", "precio", "idProducto", "fechaPublicacion"].includes(sortBy) ||
    !["ASC", "DESC"].includes(sortDirection) ||
    !["true", "false"].includes(available)
  )
    return null;
  const params = new URLSearchParams({
    idTienda: String(id),
    page: String(page),
    size: String(size),
    estado: "ACTIVO",
    sortBy,
    sortDirection,
  });
  if (available === "true") params.set("disponible", "true");
  if (nombre.trim()) params.set("nombre", nombre.trim());
  return params;
}

export function isStoreProductPage(
  value: unknown,
  storeId: number,
): value is PaginatedResponse<StoreProduct> {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<PaginatedResponse<StoreProduct>>;
  return (
    Number.isSafeInteger(data.page) &&
    Number(data.page) >= 0 &&
    Number.isInteger(data.size) &&
    Number(data.size) >= 1 &&
    Number(data.size) <= 100 &&
    Number.isSafeInteger(data.totalElements) &&
    Number(data.totalElements) >= 0 &&
    data.totalPages ===
      Math.ceil(Number(data.totalElements) / Number(data.size)) &&
    Array.isArray(data.content) &&
    data.content.length <=
      Math.min(Number(data.size), Number(data.totalElements)) &&
    data.content.every((product: unknown) => {
      if (!product || typeof product !== "object") return false;
      const item = product as Partial<StoreProduct>;
      return (
        Number.isInteger(item.idProducto) &&
        Number(item.idProducto) > 0 &&
        item.idTienda === storeId &&
        typeof item.nombre === "string" &&
        (item.descripcion === null || typeof item.descripcion === "string") &&
        typeof item.precio === "string" &&
        /^\d{1,8}\.\d{2}$/.test(item.precio) &&
        /[1-9]/.test(item.precio) &&
        Number.isInteger(item.cantidadDisponible) &&
        Number(item.cantidadDisponible) >= 0 &&
        item.estado === "ACTIVO"
      );
    })
  );
}

const priceFormatter = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function productPrice(value: string): string {
  const [whole, fraction] = value.split(".");
  // Replace only the decimal part; no binary floating-point conversion of money.
  return priceFormatter
    .formatToParts(BigInt(whole))
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
