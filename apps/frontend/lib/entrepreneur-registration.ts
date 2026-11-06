export type EntrepreneurRegistrationInput = {
  nombre: string;
  apellido: string;
  correo: string;
  clave: string;
  telefono?: string | null;
  tienda: {
    nombre: string;
    direccion: string;
    descripcion?: string | null;
    horario?: string | null;
  };
};

export function validateEntrepreneurRegistration(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return ["La solicitud no es válida."];
  const input = value as Record<string, unknown>;
  const errors: string[] = [];
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "nombre",
          "apellido",
          "correo",
          "clave",
          "telefono",
          "tienda",
        ].includes(key),
    )
  )
    errors.push("La solicitud contiene campos no permitidos.");
  const required = (value: unknown, max: number) =>
    typeof value === "string" && /\S/.test(value) && value.length <= max;
  if (!required(input.nombre, 100))
    errors.push("Ingresá tu nombre personal (máximo 100 caracteres).");
  if (!required(input.apellido, 100))
    errors.push("Ingresá tus apellidos (máximo 100 caracteres).");
  if (
    typeof input.correo !== "string" ||
    input.correo.trim().length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.correo.trim())
  )
    errors.push("Ingresá un correo electrónico válido.");
  if (
    typeof input.clave !== "string" ||
    Array.from(input.clave).length < 8 ||
    new TextEncoder().encode(input.clave).length > 72
  )
    errors.push(
      "La contraseña debe tener al menos 8 caracteres y no superar 72 bytes.",
    );
  if (input.telefono !== undefined && input.telefono !== null) {
    if (
      typeof input.telefono !== "string" ||
      input.telefono.length > 20 ||
      !/^\+?[0-9][0-9 ()-]*$/.test(input.telefono) ||
      !/^(?:\D*\d){8,15}\D*$/.test(input.telefono)
    )
      errors.push(
        "El teléfono debe contener entre 8 y 15 dígitos; puede incluir +, espacios, paréntesis y guiones.",
      );
  }
  if (
    !input.tienda ||
    typeof input.tienda !== "object" ||
    Array.isArray(input.tienda)
  )
    return [...errors, "Ingresá los datos del negocio."];
  const store = input.tienda as Record<string, unknown>;
  if (
    Object.keys(store).some(
      (key) => !["nombre", "direccion", "descripcion", "horario"].includes(key),
    )
  )
    errors.push("El negocio contiene campos no permitidos.");
  if (!required(store.nombre, 150))
    errors.push("Ingresá el nombre del negocio (máximo 150 caracteres).");
  if (!required(store.direccion, 255))
    errors.push("Ingresá la dirección del negocio (máximo 255 caracteres).");
  for (const [field, max] of [
    ["descripcion", 500],
    ["horario", 150],
  ] as const) {
    if (
      store[field] !== undefined &&
      store[field] !== null &&
      (typeof store[field] !== "string" || store[field].length > max)
    )
      errors.push(
        `${field === "descripcion" ? "La descripción" : "El horario"} no debe superar ${max} caracteres.`,
      );
  }
  return errors;
}
