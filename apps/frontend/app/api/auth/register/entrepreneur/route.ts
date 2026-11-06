import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/api-client";
import {
  validateEntrepreneurRegistration,
  type EntrepreneurRegistrationInput,
} from "@/lib/entrepreneur-registration";

export async function POST(request: NextRequest) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { message: "La solicitud no tiene un formato válido." },
      { status: 400 },
    );
  }
  const errors = validateEntrepreneurRegistration(input);
  if (errors.length)
    return NextResponse.json(
      { message: "Revisá los datos ingresados.", errors },
      { status: 400 },
    );
  const body = input as EntrepreneurRegistrationInput;
  try {
    const { response, data } = await apiRequest<{ errors?: unknown }>(
      "/auth/register/entrepreneur",
      { method: "POST", authenticated: false, body },
    );
    if (!response.ok) {
      const message =
        response.status === 409
          ? "Ya existe una cuenta con ese correo electrónico."
          : response.status === 429
            ? "Se alcanzó el límite de registros. Esperá e intentá nuevamente."
            : response.status === 400
              ? "El servidor rechazó los datos del registro. Revisá los campos."
              : "No se pudo confirmar el registro. Intentá iniciar sesión antes de volver a enviarlo.";
      const errors =
        response.status === 400 && Array.isArray(data?.errors)
          ? data.errors.filter(
              (error): error is string =>
                typeof error === "string" && !error.includes(body.clave),
            )
          : undefined;
      return NextResponse.json(
        { message, ...(errors ? { errors } : {}) },
        { status: response.status },
      );
    }
    // Public acknowledgement only; no JWT, cookies, hashes or database objects.
    return NextResponse.json(
      { message: "Tu cuenta y tu negocio se registraron correctamente." },
      { status: 201 },
    );
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
