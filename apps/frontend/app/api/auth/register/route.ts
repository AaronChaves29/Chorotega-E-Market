import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/api-client";

type RegisterRequest = {
  nombre?: unknown;
  apellido?: unknown;
  correo?: unknown;
  telefono?: unknown;
  clave?: unknown;
};

type RegistrationProblem = {
  detail?: unknown;
  errors?: unknown;
};

function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100 &&
    /\S/.test(value)
  );
}

export async function POST(request: NextRequest) {
  let input: RegisterRequest;

  try {
    input = (await request.json()) as RegisterRequest;
  } catch {
    return NextResponse.json(
      { message: "La solicitud no tiene un formato válido." },
      { status: 400 },
    );
  }

  const correo =
    typeof input?.correo === "string" ? input.correo.trim() : "";
  const telefono = input?.telefono;
  const clave = input?.clave;

  if (
    !validName(input?.nombre) ||
    !validName(input?.apellido) ||
    !correo ||
    correo.length > 150 ||
    (telefono !== undefined &&
      telefono !== null &&
      (typeof telefono !== "string" || telefono.length > 20)) ||
    typeof clave !== "string" ||
    clave.length < 8 ||
    new TextEncoder().encode(clave).length > 72
  ) {
    return NextResponse.json(
      { message: "Revisá los datos ingresados e intentá de nuevo." },
      { status: 400 },
    );
  }

  const body = {
    nombre: input.nombre,
    apellido: input.apellido,
    correo,
    ...(typeof telefono === "string" && telefono.trim()
      ? { telefono: telefono.trim() }
      : {}),
    clave,
  };

  try {
    const { response, data } = await apiRequest<RegistrationProblem>(
      "/auth/register",
      {
        method: "POST",
        authenticated: false,
        body,
      },
    );

    if (!response.ok) {
      const detail =
        typeof data?.detail === "string" &&
        !data.detail.includes(clave) &&
        data.detail !== "Bad Request" &&
        response.status < 500
          ? data.detail
          : response.status === 409
            ? "Ya existe una cuenta con ese correo electrónico."
            : "No se pudo crear la cuenta. Revisá los datos e intentá de nuevo.";
      const errors =
        Array.isArray(data?.errors) &&
        data.errors.every((error) => typeof error === "string")
          ? data.errors.filter((error) => !error.includes(clave))
          : undefined;

      return NextResponse.json(
        { message: detail, ...(errors ? { errors } : {}) },
        { status: response.status },
      );
    }

    return NextResponse.json(
      { message: "La cuenta de cliente se creó correctamente." },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "No se pudo conectar con el servidor. Intentá de nuevo." },
      { status: 502 },
    );
  }
}
