import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/api-client";
export async function handleRegistration(
  request: NextRequest,
  validate: (input: unknown) => string[],
  path: string,
  success: string,
) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { message: "La solicitud no tiene un formato válido." },
      { status: 400 },
    );
  }
  const errors = validate(input);
  if (errors.length)
    return NextResponse.json(
      { message: "Revisá los datos ingresados.", errors },
      { status: 400 },
    );
  const body = input as Record<string, unknown>;
  try {
    const { response } = await apiRequest<{ errors?: unknown }>(path, {
      method: "POST",
      authenticated: false,
      body,
    });
    if (!response.ok) {
      const message =
        response.status === 409
          ? "Ya existe una cuenta con ese correo electrónico."
          : response.status === 429
            ? "Se alcanzó el límite de registros. Esperá e intentá nuevamente."
            : response.status === 400
              ? "El servidor rechazó los datos del registro. Revisá los campos."
              : "No se pudo confirmar el registro. Intentá iniciar sesión antes de volver a enviarlo.";
      return NextResponse.json({ message }, { status: response.status });
    }
    // Public acknowledgement only; no JWT, cookies, hashes or database objects.
    return NextResponse.json({ message: success }, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        message:
          "No se pudo confirmar el resultado. Intentá iniciar sesión antes de repetir el registro.",
      },
      { status: 502 },
    );
  }
}
