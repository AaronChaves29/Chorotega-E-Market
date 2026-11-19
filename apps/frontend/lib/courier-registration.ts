import { validateRegistrationContact } from "./registration-validation";
export type CourierRegistrationInput = {
  nombre: string;
  apellido: string;
  correo: string;
  clave: string;
  telefono?: string | null;
  medioTransporte: string;
};
export function validateCourierRegistration(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return ["La solicitud no es válida."];
  const input = value as Record<string, unknown>;
  const errors = validateRegistrationContact(input);
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "nombre",
          "apellido",
          "correo",
          "clave",
          "telefono",
          "medioTransporte",
        ].includes(key),
    )
  )
    errors.push("La solicitud contiene campos no permitidos.");
  if (
    typeof input.medioTransporte !== "string" ||
    !input.medioTransporte.trim() ||
    input.medioTransporte.trim().length > 50
  )
    errors.push("Ingresá el medio de transporte (máximo 50 caracteres).");
  return errors;
}
