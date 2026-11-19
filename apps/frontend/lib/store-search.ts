import type { PaginatedResponse, Store } from "@/types/catalog";

// Defaults are also used by CreateOrderForm. Only these parameters reach NestJS.
export function storeSearchParams(
  input: URLSearchParams,
): URLSearchParams | null {
  const allowed = ["page", "size", "nombre", "sortBy", "sortDirection"];
  if (allowed.some((key) => input.getAll(key).length > 1)) return null;
  const pageText = input.get("page") ?? "0";
  const sizeText = input.get("size") ?? "20";
  const page = Number(pageText);
  const size = Number(sizeText);
  const nombre = input.get("nombre") ?? "";
  const sortBy = input.get("sortBy") ?? "nombre";
  const sortDirection = input.get("sortDirection") ?? "ASC";
  if (
    !/^\d+$/.test(pageText) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !/^\d+$/.test(sizeText) ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 100 ||
    !Number.isSafeInteger(page * size) ||
    nombre.length > 150 ||
    !["nombre", "idTienda"].includes(sortBy) ||
    !["ASC", "DESC"].includes(sortDirection)
  )
    return null;
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
    estado: "ACTIVA",
    sortBy,
    sortDirection,
  });
  if (nombre.trim()) params.set("nombre", nombre.trim());
  return params;
}

export function isStorePage(value: unknown): value is PaginatedResponse<Store> {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<PaginatedResponse<Store>>;
  return (
    Number.isSafeInteger(page.page) &&
    Number(page.page) >= 0 &&
    Number.isSafeInteger(page.size) &&
    Number(page.size) >= 1 &&
    Number(page.size) <= 100 &&
    Number.isSafeInteger(page.totalElements) &&
    Number(page.totalElements) >= 0 &&
    page.totalPages ===
      Math.ceil(Number(page.totalElements) / Number(page.size)) &&
    Array.isArray(page.content) &&
    page.content.length <= Number(page.size) &&
    page.content.every((store: unknown) => {
      if (!store || typeof store !== "object") return false;
      const item = store as Partial<Store>;
      return (
        Number.isInteger(item.idTienda) &&
        Number(item.idTienda) > 0 &&
        typeof item.nombre === "string" &&
        typeof item.direccion === "string" &&
        (item.descripcion === null || typeof item.descripcion === "string") &&
        ["instagramUrl", "facebookUrl", "whatsappComercial"].every(
          (field) =>
            item[field as keyof Store] === null ||
            typeof item[field as keyof Store] === "string",
        ) &&
        item.estado === "ACTIVA"
      );
    })
  );
}
