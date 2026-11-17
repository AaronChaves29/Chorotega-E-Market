import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { validPage } from "@/lib/managed-products";
import {
  courierDeliveryParams,
  projectCourierDelivery,
} from "@/lib/courier-deliveries";
import {
  courierActor,
  deliveryResponse,
  deliveryStatus,
  deliveryFailure,
} from "@/lib/courier-deliveries-api";

export async function GET(request: NextRequest) {
  try {
    const actor = await courierActor();
    if (actor !== 200) return deliveryResponse(actor);
    const params = courierDeliveryParams(request.nextUrl.searchParams);
    if (!params) return deliveryResponse(400);
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/deliveries?${params}`,
    );
    if (sessionExpired) return deliveryResponse(401);
    const page = Number(params.get("page")),
      size = Number(params.get("size"));
    if (!response.ok) return deliveryResponse(deliveryStatus(response.status));
    if (response.status !== 200 || !validPage(data, page, size))
      return deliveryResponse(502);
    const content = data.content.map(projectCourierDelivery);
    const expected = Math.min(
      size,
      Math.max(0, data.totalElements - page * size),
    );
    if (
      content.some(
        (d) =>
          !d || (params.has("estado") && d.estado !== params.get("estado")),
      ) ||
      new Set(content.map((d) => d?.idEntrega)).size !== content.length ||
      content.length !== expected
    )
      return deliveryResponse(502);
    return deliveryResponse(200, {
      content,
      page,
      size,
      totalElements: data.totalElements,
      totalPages: data.totalPages,
    });
  } catch (error) {
    return deliveryFailure(error);
  }
}
