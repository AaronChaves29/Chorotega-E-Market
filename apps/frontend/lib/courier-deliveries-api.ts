import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { apiRequest, SESSION_COOKIE } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/current-user";
import { positiveId } from "@/lib/store-detail";
import {
  emptyDeliveryBody,
  projectCourierDelivery,
} from "@/lib/courier-deliveries";

export function deliveryResponse(status: number, data?: unknown) {
  const messages: Record<number, string> = {
    400: "Revisá los parámetros de la solicitud.",
    401: "Tu sesión venció o no es válida. Iniciá sesión nuevamente.",
    403: "No tenés autorización para realizar esta operación de reparto.",
    404: "No encontramos esa entrega entre tus entregas disponibles.",
    409: "La entrega cambió o no admite esta acción. Consultá el estado vigente antes de continuar.",
    500: "No pudimos completar la operación. Consultá el estado vigente antes de continuar.",
    502: "No pudimos confirmar el resultado con el servidor. Consultá el estado vigente; no se reenviará la solicitud.",
  };
  const result = NextResponse.json(
    data ?? { message: messages[status] ?? messages[500] },
    { status, headers: { "Cache-Control": "no-store" } },
  );
  if (status === 401) result.cookies.delete(SESSION_COOKIE);
  return result;
}
export async function courierActor() {
  const current = await getCurrentUser();
  if (current.status === "unauthenticated") return 401;
  if (current.status !== "authenticated") return 502;
  return current.user.rol === "REPARTIDOR" ? 200 : 403;
}
export function deliveryStatus(status: number) {
  return [400, 401, 403, 404, 409].includes(status)
    ? status
    : [502, 503, 504].includes(status)
      ? 502
      : 500;
}
export function deliveryFailure(error: unknown) {
  return deliveryResponse(
    error instanceof TypeError ||
      (error instanceof Error &&
        ["AbortError", "TimeoutError"].includes(error.name))
      ? 502
      : 500,
  );
}
export type DeliveryContext = { params: Promise<{ id: string }> };

export async function deliveryAction(
  request: NextRequest,
  context: DeliveryContext,
  action: "start" | "complete",
) {
  try {
    const actor = await courierActor();
    if (actor !== 200) return deliveryResponse(actor);
    if (
      request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return deliveryResponse(403);
    const id = positiveId((await context.params).id);
    if (id === null || request.nextUrl.searchParams.size)
      return deliveryResponse(400);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return deliveryResponse(400);
    }
    if (!emptyDeliveryBody(body)) return deliveryResponse(400);
    // Ownership and transitions are decided by NestJS under its transaction.
    // A preliminary scoped GET would turn the domain's foreign-write 403 into 404.
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/deliveries/${id}/${action}`,
      { method: "POST", body: {} },
    );
    if (sessionExpired) return deliveryResponse(401);
    if (!response.ok) return deliveryResponse(deliveryStatus(response.status));
    const delivery = projectCourierDelivery(data);
    if (
      response.status !== 200 ||
      !delivery ||
      delivery.idEntrega !== id ||
      delivery.estado !== (action === "start" ? "EN_CAMINO" : "ENTREGADA")
    )
      return deliveryResponse(502);
    return deliveryResponse(200, delivery);
  } catch (error) {
    return deliveryFailure(error);
  }
}
