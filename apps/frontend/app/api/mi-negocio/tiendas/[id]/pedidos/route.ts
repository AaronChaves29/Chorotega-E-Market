import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { managementFailure } from "@/lib/managed-stores-api";
import { validPage } from "@/lib/managed-products";
import {
  managedOrderParams,
  projectManagedOrder,
  orderSummary,
  type ManagedOrder,
} from "@/lib/managed-orders";
import {
  orderStoreContext,
  orderResponse,
  orderStatus,
} from "@/lib/managed-orders-api";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const own = await orderStoreContext((await context.params).id);
    if (!own.ok) return orderResponse(own.status);
    const params = managedOrderParams(request.nextUrl.searchParams);
    if (!params) return orderResponse(400);
    params.set("idTienda", String(own.store.idTienda));
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/orders?${params}`,
    );
    if (sessionExpired) return orderResponse(401);
    if (!response.ok) return orderResponse(orderStatus(response.status));
    if (
      !validPage(data, Number(params.get("page")), Number(params.get("size")))
    )
      return orderResponse(502);
    const content = data.content.map(projectManagedOrder);
    if (content.some((o) => !o || o.idTienda !== own.store.idTienda))
      return orderResponse(502);
    return orderResponse(200, {
      store: own.store,
      content: (content as ManagedOrder[]).map(orderSummary),
      page: data.page,
      size: data.size,
      totalElements: data.totalElements,
      totalPages: data.totalPages,
    });
  } catch (error) {
    return managementFailure(error);
  }
}
