import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/api-client";
import type {
  LoginCredentials,
  LoginResponse,
} from "../../../../types/auth";

export async function POST(request: NextRequest) {
  let credentials: LoginCredentials;

  try {
    credentials = (await request.json()) as LoginCredentials;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  if (
    typeof credentials?.correo !== "string" ||
    typeof credentials?.clave !== "string" ||
    !credentials.correo.trim() ||
    !credentials.clave
  ) {
    return NextResponse.json(
      { message: "Ingresá tu correo y contraseña." },
      { status: 400 },
    );
  }

  try {
    const { response, data: loginData } =
      await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        authenticated: false,
        body: {
          correo: credentials.correo,
          clave: credentials.clave,
        },
      });

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            response.status === 401
              ? "Correo o contraseña incorrectos."
              : "No se pudo iniciar sesión.",
        },
        { status: response.status },
      );
    }

    const data = loginData;

    if (
      !data ||
      typeof data.token !== "string" || !data.token ||
      data.tipo !== "Bearer" ||
      !Number.isInteger(data.expiraEnSegundos) ||
      data.expiraEnSegundos <= 0
    ) {
      return NextResponse.json(
        { message: "Respuesta de autenticación inválida." },
        { status: 502 },
      );
    }

    const result = NextResponse.json({
      message: "Inicio de sesión correcto.",
    });

    result.cookies.set("chorotega_session", data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: data.expiraEnSegundos,
    });

    return result;
  } catch {
    return NextResponse.json(
      { message: "No se pudo conectar con el servidor." },
      { status: 502 },
    );
  }
}