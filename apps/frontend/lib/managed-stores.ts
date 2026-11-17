import type { Store } from "@/types/catalog";
import { socialContactErrors } from "./store-social-contact";

export const editableStoreFields = [
  { name: "nombre", label: "Nombre del negocio", max: 150, required: true },
  { name: "descripcion", label: "Descripción", max: 500, required: false },
  { name: "direccion", label: "Dirección", max: 255, required: true },
  { name: "telefono", label: "Teléfono comercial", max: 20, required: false },
  { name: "horario", label: "Horario", max: 150, required: false },
  { name: "instagramUrl", label: "Instagram", max: 500, required: false },
  { name: "facebookUrl", label: "Facebook", max: 500, required: false },
  {
    name: "whatsappComercial",
    label: "WhatsApp comercial",
    max: 64,
    required: false,
  },
] as const;
export type EditableStoreField = (typeof editableStoreFields)[number]["name"];
export type StoreValues = Record<EditableStoreField, string>;
export type StorePatch = Partial<Record<EditableStoreField, string | null>>;
export type StoreFieldErrors = Partial<Record<EditableStoreField, string>>;

export function validateStorePatch(
  value: unknown,
): StoreFieldErrors & { form?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { form: "La solicitud debe ser un objeto de campos editables." };
  const patch = value as Record<string, unknown>;
  if (
    Object.keys(patch).some(
      (key) => !editableStoreFields.some((f) => f.name === key),
    )
  )
    return { form: "La solicitud contiene campos no editables." };
  const errors: StoreFieldErrors = {};
  for (const field of editableStoreFields) {
    if (!(field.name in patch)) continue;
    const current = patch[field.name];
    if (current === null && !field.required) continue;
    if (
      typeof current !== "string" ||
      current.length > field.max ||
      (field.required && !/\S/.test(current))
    )
      errors[field.name] =
        `${field.label}: ${field.required ? "es obligatorio y " : ""}debe tener como máximo ${field.max} caracteres.`;
  }
  return { ...errors, ...socialContactErrors(patch) };
}

export function storeFormValues(store: Store): StoreValues {
  return Object.fromEntries(
    editableStoreFields.map((f) => [f.name, store[f.name] ?? ""]),
  ) as StoreValues;
}

export function changedStoreFields(
  store: Store,
  values: StoreValues,
): StorePatch {
  const patch: StorePatch = {};
  for (const field of editableStoreFields) {
    // An empty optional input explicitly clears a previous value; untouched
    // fields are omitted, including empty strings already stored by the API.
    if (values[field.name] === (store[field.name] ?? "")) continue;
    const text = values[field.name].trim();
    const value = !field.required && !text ? null : text;
    if (value !== store[field.name]) patch[field.name] = value;
  }
  return patch;
}

export function managementPageParams(
  input: URLSearchParams,
): URLSearchParams | null {
  if (
    [...input.keys()].some(
      (key) =>
        !["page", "size"].includes(key) || input.getAll(key).length !== 1,
    )
  )
    return null;
  const p = input.get("page") ?? "0",
    s = input.get("size") ?? "6";
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
    !Number.isSafeInteger(page * size)
  )
    return null;
  return new URLSearchParams({
    page: String(page),
    size: String(size),
    sortBy: "idTienda",
    sortDirection: "ASC",
  });
}
