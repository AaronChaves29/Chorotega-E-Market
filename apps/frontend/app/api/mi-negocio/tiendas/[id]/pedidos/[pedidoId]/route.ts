import type { NextRequest } from "next/server";
import { managementFailure } from "@/lib/managed-stores-api";
import { positiveId } from "@/lib/store-detail";
import {
  orderStoreContext,
  orderResponse,
  scopedOrder,
} from "@/lib/managed-orders-api";
type Context = { params: Promise<{ id: string; pedidoId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const params = await context.params,
      own = await orderStoreContext(params.id);
    if (!own.ok) return orderResponse(own.status);
    const id = positiveId(params.pedidoId);
    if (id === null || request.nextUrl.searchParams.size)
      return orderResponse(400);
    const result = await scopedOrder(id, own.store.idTienda);
    return result.ok
      ? orderResponse(200, { store: own.store, order: result.order })
      : orderResponse(result.status);
  } catch (error) {
    return managementFailure(error);
  }
}
