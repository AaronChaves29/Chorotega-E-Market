
import { NextRequest, NextResponse } from "next/server";
import { apiRequest, SESSION_COOKIE } from "@/lib/api-client";
import type { PaginatedOrders } from "@/types/orders";
import type { CreateOrderRequest } from "@/types/catalog";

function handleExpiredSession() {
  const response = NextResponse.json(
    { message: "Tu sesión ha vencido. Iniciá sesión nuevamente." },
    { status: 401 },
  );

  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const rawPage = request.nextUrl.searchParams.get("page") ?? "0";

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
    const { response, data, sessionExpired } =
      await apiRequest<PaginatedOrders>(
        `/orders?${params.toString()}`,
      );

    if (sessionExpired) {
      return handleExpiredSession();
    }

    if (!response.ok) {
      return NextResponse.json(
        { message: "No fue posible consultar los pedidos." },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }

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
      {
        message:
          "Revisá el barrio, la dirección y los productos seleccionados.",
      },
      { status: 400 },
    );
  }

  try {
    const { response, data, sessionExpired } =
      await apiRequest<unknown>("/orders", {
        method: "POST",
        body,
      });

    if (sessionExpired) {
      return handleExpiredSession();
    }

    if (!response.ok) {
      return NextResponse.json(
        data ?? { message: "No fue posible crear el pedido." },
        { status: response.status },
      );
    }

    return NextResponse.json(data, {
      status: response.status,
    });
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
