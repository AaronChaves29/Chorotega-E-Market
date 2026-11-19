import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import {
  clientOrderContext,
  clientOrderResponse,
  readClientOrder,
} from "@/lib/client-orders-api";
import { emptyPrepareBody, projectManagedOrder } from "@/lib/managed-orders";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const own = await clientOrderContext((await context.params).id);
    if (!own.ok) return clientOrderResponse(own.status);
    if (
      request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return clientOrderResponse(403);
    if (request.nextUrl.searchParams.size) return clientOrderResponse(400);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return clientOrderResponse(400);
    }
    if (!emptyPrepareBody(body)) return clientOrderResponse(400);
    const current = await readClientOrder(own.id, own.user.idUsuario);
    if (!current.ok) return clientOrderResponse(current.status);
    // Eligibility is decided under the PostgreSQL lock, never by this GET.
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/orders/${own.id}/cancel`,
      { method: "PATCH", body: {} },
    );
    if (sessionExpired) return clientOrderResponse(401);
    if (!response.ok)
      return clientOrderResponse(
        [400, 403, 404, 409].includes(response.status) ? response.status : 502,
      );
    const order = projectManagedOrder(data);
    if (
      response.status !== 200 ||
      !order ||
      order.idPedido !== own.id ||
      order.estado !== "CANCELADO" ||
      !data ||
      typeof data !== "object" ||
      !("idCliente" in data) ||
      data.idCliente !== own.user.idUsuario
    )
      return clientOrderResponse(502);
    return clientOrderResponse(200, { order });
  } catch {
    return clientOrderResponse(502);
  }
}
