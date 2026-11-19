export function validateRegistrationContact(
  input: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
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
  return errors;
}
