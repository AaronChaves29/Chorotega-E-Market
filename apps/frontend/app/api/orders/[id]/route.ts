import type { NextRequest } from "next/server";
import {
  clientOrderContext,
  clientOrderResponse,
  readClientOrder,
} from "@/lib/client-orders-api";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const own = await clientOrderContext((await context.params).id);
    if (!own.ok) return clientOrderResponse(own.status);
    if (request.nextUrl.searchParams.size) return clientOrderResponse(400);
    const result = await readClientOrder(own.id, own.user.idUsuario);
    return result.ok
      ? clientOrderResponse(200, { order: result.order })
      : clientOrderResponse(result.status);
  } catch {
    return clientOrderResponse(502);
  }
}
