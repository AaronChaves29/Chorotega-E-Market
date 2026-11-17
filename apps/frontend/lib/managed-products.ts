import type { Product, PaginatedResponse } from "@/types/catalog";
import { cents, validId } from "./cart";

export type ManagedProduct = Product & { version: number };
export type ManagedCategory = {
  idCategoria: number;
  nombre: string;
  descripcion: string | null;
  estado: "ACTIVA" | "INACTIVA";
};
export const productStates = ["ACTIVO", "INACTIVO", "AGOTADO"] as const;
export type ProductValues = {
  nombre: string;
  descripcion: string;
  idCategoria: string;
  precio: string;
  cantidadDisponible: string;
  estado: string;
};
export type ProductBody = {
  nombre?: string;
  descripcion?: string | null;
  idCategoria?: number;
  precio?: number;
  cantidadDisponible?: number;
  estado?: string;
  version?: number;
};
export type ProductErrors = Partial<
  Record<keyof ProductValues | "version" | "form", string>
>;

// Parse decimal text into integer cents before making the numeric DTO value.
export function priceInput(
  value: string,
): { canonical: string; cents: bigint; number: number } | null {
  const text = value.trim();
  if (!/^(?:0|[1-9][0-9]{0,7})(?:[.,][0-9]{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  const canonical = `${whole}.${fraction.padEnd(2, "0")}`;
  const amount = cents(canonical);
  if (amount < BigInt(1) || amount > BigInt(9999999999)) return null;
  const number = Number(canonical);
  if (!Number.isFinite(number) || cents(number.toFixed(2)) !== amount)
    return null;
  return { canonical, cents: amount, number };
}
export function projectManagedProduct(value: unknown): ManagedProduct | null {
  if (!value || typeof value !== "object") return null;
  const p = value as ManagedProduct;
  if (
    !validId(p.idProducto) ||
    !validId(p.version) ||
    !validId(p.idTienda) ||
    !validId(p.idCategoria) ||
    typeof p.nombre !== "string" ||
    !p.nombre ||
    p.nombre.length > 150 ||
    !(p.descripcion === null || typeof p.descripcion === "string") ||
    typeof p.precio !== "string" ||
    !/^\d{1,8}\.\d{2}$/.test(p.precio) ||
    !priceInput(p.precio) ||
    !Number.isInteger(p.cantidadDisponible) ||
    p.cantidadDisponible < 0 ||
    p.cantidadDisponible > 2147483647 ||
    !productStates.includes(p.estado) ||
    typeof p.fechaPublicacion !== "string"
  )
    return null;
  return {
    idProducto: p.idProducto,
    version: p.version,
    idTienda: p.idTienda,
    idCategoria: p.idCategoria,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    cantidadDisponible: p.cantidadDisponible,
    estado: p.estado,
    fechaPublicacion: p.fechaPublicacion,
  };
}
export function projectManagedCategory(value: unknown): ManagedCategory | null {
  if (!value || typeof value !== "object") return null;
  const c = value as ManagedCategory;
  if (
    !validId(c.idCategoria) ||
    typeof c.nombre !== "string" ||
    !(c.descripcion === null || typeof c.descripcion === "string") ||
    !["ACTIVA", "INACTIVA"].includes(c.estado)
  )
    return null;
  return {
    idCategoria: c.idCategoria,
    nombre: c.nombre,
    descripcion: c.descripcion,
    estado: c.estado,
  };
}
export function managedProductParams(
  input: URLSearchParams,
): URLSearchParams | null {
  if (
    [...input.keys()].some(
      (k) =>
        !["page", "size", "nombre"].includes(k) || input.getAll(k).length !== 1,
    )
  )
    return null;
  const p = input.get("page") ?? "0",
    s = input.get("size") ?? "6",
    name = input.get("nombre") ?? "";
  const page = Number(p),
    size = Number(s);
  if (
    !/^\d+$/.test(p) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !/^\d+$/.test(s) ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100 ||
    !Number.isSafeInteger(page * size) ||
    name.length > 150
  )
    return null;
  const result = new URLSearchParams({
    page: String(page),
    size: String(size),
    sortBy: "idProducto",
    sortDirection: "ASC",
  });
  if (name.trim()) result.set("nombre", name.trim());
  return result;
}
export function validPage(
  value: unknown,
  page: number,
  size: number,
): value is PaginatedResponse<unknown> {
  if (!value || typeof value !== "object") return false;
  const p = value as PaginatedResponse<unknown>;
  return (
    p.page === page &&
    p.size === size &&
    Number.isSafeInteger(p.totalElements) &&
    p.totalElements >= 0 &&
    p.totalPages === Math.ceil(p.totalElements / size) &&
    Array.isArray(p.content) &&
    p.content.length <= Math.min(size, p.totalElements)
  );
}
export function validateProductBody(
  value: unknown,
  edit: boolean,
): ProductErrors {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { form: "La solicitud debe ser un objeto." };
  const body = value as Record<string, unknown>;
  const allowed = [
    "nombre",
    "descripcion",
    "idCategoria",
    "precio",
    "cantidadDisponible",
    "estado",
    ...(edit ? ["version"] : []),
  ];
  if (Object.keys(body).some((k) => !allowed.includes(k)))
    return { form: "La solicitud contiene campos no editables." };
  const errors: ProductErrors = {};
  if (edit && !validId(body.version))
    errors.version = "La versión original es obligatoria.";
  if (edit && Object.keys(body).every((k) => k === "version"))
    errors.form = "No hay cambios para guardar.";
  if (
    (!edit || "nombre" in body) &&
    (typeof body.nombre !== "string" ||
      !body.nombre.trim() ||
      body.nombre.length > 150)
  )
    errors.nombre = "Ingresá un nombre de hasta 150 caracteres.";
  if (
    "descripcion" in body &&
    body.descripcion !== null &&
    (typeof body.descripcion !== "string" || body.descripcion.length > 500)
  )
    errors.descripcion = "La descripción admite hasta 500 caracteres.";
  if ((!edit || "idCategoria" in body) && !validId(body.idCategoria))
    errors.idCategoria = "Seleccioná una categoría activa.";
  if (
    (!edit || "precio" in body) &&
    (typeof body.precio !== "number" ||
      !Number.isFinite(body.precio) ||
      !priceInput(String(body.precio)))
  )
    errors.precio =
      "Ingresá un precio entre 0,01 y 99.999.999,99 con hasta dos decimales.";
  if (
    (!edit || "cantidadDisponible" in body) &&
    (!Number.isInteger(body.cantidadDisponible) ||
      Number(body.cantidadDisponible) < 0 ||
      Number(body.cantidadDisponible) > 2147483647)
  )
    errors.cantidadDisponible =
      "Ingresá existencias enteras entre 0 y 2147483647.";
  if (
    ("estado" in body || !edit) &&
    !productStates.includes(body.estado as ManagedProduct["estado"])
  )
    errors.estado = "Seleccioná ACTIVO, INACTIVO o AGOTADO.";
  return errors;
}
export function productFormValues(product?: ManagedProduct): ProductValues {
  return product
    ? {
        nombre: product.nombre,
        descripcion: product.descripcion ?? "",
        idCategoria: String(product.idCategoria),
        precio: product.precio,
        cantidadDisponible: String(product.cantidadDisponible),
        estado: product.estado,
      }
    : {
        nombre: "",
        descripcion: "",
        idCategoria: "",
        precio: "",
        cantidadDisponible: "0",
        estado: "ACTIVO",
      };
}
export function productFormBody(
  values: ProductValues,
  original?: ManagedProduct,
): { body: ProductBody; errors: ProductErrors; changed: boolean } {
  const body: ProductBody = {};
  const errors: ProductErrors = {};
  if (!original || values.nombre !== original.nombre)
    body.nombre = values.nombre.trim();
  if (!original || values.descripcion !== (original.descripcion ?? ""))
    body.descripcion = values.descripcion.trim() || null;
  if (!original || values.idCategoria !== String(original.idCategoria))
    body.idCategoria = /^[0-9]+$/.test(values.idCategoria)
      ? Number(values.idCategoria)
      : NaN;
  const money = priceInput(values.precio);
  if (!money)
    errors.precio =
      "Ingresá un precio válido con hasta dos decimales, sin separadores de miles.";
  else if (!original || money.cents !== cents(original.precio))
    body.precio = money.number;
  if (
    !original ||
    values.cantidadDisponible !== String(original.cantidadDisponible)
  )
    body.cantidadDisponible = /^[0-9]{1,10}$/.test(values.cantidadDisponible)
      ? Number(values.cantidadDisponible)
      : NaN;
  if (!original || values.estado !== original.estado)
    body.estado = values.estado;
  const changed = Object.keys(body).length > 0;
  if (original) body.version = original.version;
  const validation =
    changed || !original ? validateProductBody(body, !!original) : {};
  return { body, errors: { ...validation, ...errors }, changed };
}
