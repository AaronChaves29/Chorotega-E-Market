import { NextResponse } from "next/server";
import { apiRequest, SESSION_COOKIE } from "@/lib/api-client";
import type { Neighborhood } from "@/types/catalog";

export async function GET() {
  try {
    const { response, data, sessionExpired } = await apiRequest<Neighborhood[]>(
      "/neighborhoods",
    );

    if (sessionExpired) {
      const result = NextResponse.json(
        { message: "Tu sesión venció o no es válida. Iniciá sesión nuevamente." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
      result.cookies.delete(SESSION_COOKIE);
      return result;
    }

    if (!response.ok) {
      return NextResponse.json(
        { message: "No fue posible consultar los barrios." },
        { status: response.status },
      );
    }

    if (!Array.isArray(data)) {
      return NextResponse.json(
        { message: "La respuesta de barrios no es válida." },
        { status: 502 },
      );
    }

    const activeNeighborhoods = data.filter(
      (neighborhood) => neighborhood.estado === "ACTIVO",
    );

    return NextResponse.json(activeNeighborhoods, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "No fue posible conectar con el servidor." },
      { status: 502 },
    );
  }
}