import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { managementFailure } from "@/lib/managed-stores-api";
import { positiveId } from "@/lib/store-detail";
import { emptyPrepareBody, projectManagedOrder } from "@/lib/managed-orders";
import {
  orderStoreContext,
  orderResponse,
  orderStatus,
  scopedOrder,
} from "@/lib/managed-orders-api";
type Context = { params: Promise<{ id: string; pedidoId: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const params = await context.params,
      own = await orderStoreContext(params.id);
    if (!own.ok) return orderResponse(own.status);
    if (
      request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return orderResponse(403);
    const id = positiveId(params.pedidoId);
    if (id === null || request.nextUrl.searchParams.size)
      return orderResponse(400);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return orderResponse(400);
    }
    if (!emptyPrepareBody(body)) return orderResponse(400);
    const current = await scopedOrder(id, own.store.idTienda);
    if (!current.ok) return orderResponse(current.status);
    // Do not decide transitions here: NestJS locks and validates the current state.
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/orders/${id}/prepare`,
      { method: "PATCH", body: {} },
    );
    if (sessionExpired) return orderResponse(401);
    if (!response.ok) return orderResponse(orderStatus(response.status));
    const order = projectManagedOrder(data);
    if (
      response.status !== 200 ||
      !order ||
      order.idPedido !== id ||
      order.idTienda !== own.store.idTienda ||
      order.estado !== "PREPARANDO"
    )
      return orderResponse(502);
    return orderResponse(200, { store: own.store, order });
  } catch (error) {
    return managementFailure(error);
  }
}
