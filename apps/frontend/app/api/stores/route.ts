import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/api-client";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const pageParam = request.nextUrl.searchParams.get("page") ?? "0";
  const page = Number(pageParam);

  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !/^\d+$/.test(pageParam)
  ) {
    return NextResponse.json(
      { message: "El número de página no es válido." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    page: String(page),
    size: String(PAGE_SIZE),
    estado: "ACTIVA",
    sortBy: "nombre",
    sortDirection: "ASC",
  });

  try {
    const { response, data } = await apiRequest<unknown>(
      `/stores?${params.toString()}`,
      { authenticated: false },
    );

    if (!response.ok) {
      return NextResponse.json(
        { message: "No fue posible consultar las tiendas." },
        { status: response.status },
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
      { status: 502 },
    );
  }
}