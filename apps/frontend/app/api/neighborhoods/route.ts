import { NextResponse } from "next/server";
import { getApiUrl } from "@/lib/server-api";
import type { Neighborhood } from "@/types/catalog";

export async function GET() {
  try {
    const response = await fetch(`${getApiUrl()}/neighborhoods`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { message: "No fue posible consultar los barrios." },
        { status: response.status },
      );
    }

    const neighborhoods = (await response.json()) as Neighborhood[];

    const activeNeighborhoods = neighborhoods.filter(
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