import { NextRequest, NextResponse } from "next/server";
import { apiRequest, SESSION_COOKIE } from "@/lib/api-client";
import { storeSearchParams } from "@/lib/store-search";

export async function GET(request: NextRequest) {
  const params = storeSearchParams(request.nextUrl.searchParams);
  if (!params) {
    return NextResponse.json(
      { message: "Los parámetros de búsqueda no son válidos." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/stores?${params.toString()}`,
    );

    if (sessionExpired) {
      const result = NextResponse.json(
        {
          message: "Tu sesión venció o no es válida. Iniciá sesión nuevamente.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
      result.cookies.delete(SESSION_COOKIE);
      return result;
    }

    if (!response.ok) {
      return NextResponse.json(
        { message: "No fue posible consultar las tiendas." },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "No fue posible conectar con el servidor." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
