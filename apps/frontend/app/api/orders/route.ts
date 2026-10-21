
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiUrl } from "@/lib/server-api";
import type { PaginatedOrders } from "@/types/orders";
import { CreateOrderRequest } from "@/types/catalog";

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

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("chorotega_session")?.value;

  if (!token) {
    return NextResponse.json(
      { message: "Debés iniciar sesión para crear un pedido." },
      { status: 401 },
    );
  }

  let body: CreateOrderRequest;

  try {
    body = (await request.json()) as CreateOrderRequest;
  } catch {
    return NextResponse.json(
      { message: "Los datos enviados no tienen un formato válido." },
      { status: 400 },
    );
  }

  if (
    !body ||
    !Number.isInteger(body.idBarrio) ||
    body.idBarrio < 1 ||
    body.idBarrio > 2147483647 ||
    typeof body.direccionEntrega !== "string" ||
    !body.direccionEntrega.trim() ||
    body.direccionEntrega.length > 255 ||
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    !body.items.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        Number.isInteger(item.idProducto) &&
        item.idProducto >= 1 &&
        item.idProducto <= 2147483647 &&
        Number.isInteger(item.cantidad) &&
        item.cantidad >= 1 &&
        item.cantidad <= 2147483647,
    )
  ) {
    return NextResponse.json(
      { message: "Revisá el barrio, la dirección y los productos seleccionados." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${getApiUrl()}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        data ?? { message: "No fue posible crear el pedido." },
        { status: response.status },
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        message:
          "No se pudo confirmar el resultado de la solicitud. Revisá tus pedidos antes de intentarlo nuevamente.",
      },
      { status: 502 },
    );
  }
}