import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { positiveId } from "@/lib/store-detail";
import {
  courierActor,
  deliveryResponse,
  deliveryStatus,
  deliveryFailure,
  type DeliveryContext,
} from "@/lib/courier-deliveries-api";
import { projectCourierDeliveryDestination } from "@/lib/courier-deliveries";

export async function GET(request: NextRequest, context: DeliveryContext) {
  try {
    const actor = await courierActor();
    if (actor !== 200) return deliveryResponse(actor);
    const id = positiveId((await context.params).id);
    if (id === null || request.nextUrl.searchParams.size)
      return deliveryResponse(400);
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/deliveries/${id}/destination`,
    );
    if (sessionExpired) return deliveryResponse(401);
    if (!response.ok) return deliveryResponse(deliveryStatus(response.status));
    const destination = projectCourierDeliveryDestination(data);
    if (response.status !== 200 || !destination || destination.idEntrega !== id)
      return deliveryResponse(502);
    return deliveryResponse(200, destination);
  } catch (error) {
    return deliveryFailure(error);
  }
}
