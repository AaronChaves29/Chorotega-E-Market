
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiUrl } from "@/lib/server-api";
import type { PaginatedOrders } from "@/types/orders";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("chorotega_session")?.value;

  if (!token) {
    return NextResponse.json(
      { message: "Debes iniciar sesión." },
      { status: 401 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const rawPage = searchParams.get("page") ?? "0";

  if (!/^\d+$/.test(rawPage)) {
    return NextResponse.json(
      { message: "Número de página inválido." },
      { status: 400 },
    );
  }

  const page = Number(rawPage);

  if (!Number.isSafeInteger(page)) {
    return NextResponse.json(
      { message: "Número de página inválido." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    page: String(page),
    size: "10",
    sortBy: "fechaCreacion",
    sortDirection: "DESC",
  });

  try {
    const response = await fetch(
      `${getApiUrl()}/orders?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (response.status === 401) {
      const result = NextResponse.json(
        { message: "Tu sesión ha vencido. Iniciá sesión nuevamente." },
        { status: 401 },
      );

      result.cookies.delete("chorotega_session");
      return result;
    }

    if (!response.ok) {
      return NextResponse.json(
        { message: "No fue posible consultar los pedidos." },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }

    const data = (await response.json()) as PaginatedOrders;

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "No se pudo establecer conexión con el servidor." },
      { status: 502 },
    );
  }
}
