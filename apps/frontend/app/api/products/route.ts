import { NextRequest, NextResponse } from "next/server";
import { getApiUrl } from "@/lib/server-api";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const storeParam = request.nextUrl.searchParams.get("idTienda");
  const pageParam = request.nextUrl.searchParams.get("page") ?? "0";

  const storeId = Number(storeParam);
  const page = Number(pageParam);

  if (
    !storeParam ||
    !/^\d+$/.test(storeParam) ||
    !Number.isSafeInteger(storeId) ||
    storeId < 1 ||
    storeId > 2147483647
  ) {
    return NextResponse.json(
      { message: "El identificador de la tienda no es válido." },
      { status: 400 },
    );
  }

  if (
    !/^\d+$/.test(pageParam) ||
    !Number.isSafeInteger(page) ||
    page < 0
  ) {
    return NextResponse.json(
      { message: "El número de página no es válido." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    idTienda: String(storeId),
    page: String(page),
    size: String(PAGE_SIZE),
    estado: "ACTIVO",
    disponible: "true",
    sortBy: "nombre",
    sortDirection: "ASC",
  });

  try {
    const response = await fetch(`${getApiUrl()}/products?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { message: "No fue posible consultar los productos." },
        { status: response.status },
      );
    }

    const data: unknown = await response.json();

    return NextResponse.json(data, {
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