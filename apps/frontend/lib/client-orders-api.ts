import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { apiRequest, SESSION_COOKIE } from "@/lib/api-client";
import { positiveId } from "@/lib/store-detail";
import { projectManagedOrder } from "@/lib/managed-orders";

export function clientOrderResponse(status: number, data?: unknown) {
  const response = NextResponse.json(
    data ?? {
      message:
        status === 409
          ? "El pedido cambió o ya no permite cancelación. Consultá su estado."
          : status === 404
            ? "Pedido no encontrado."
            : status === 401
              ? "Tu sesión venció."
              : "No se pudo confirmar la operación. Consultá el estado antes de intentar nuevamente.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
  if (status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}
export async function clientOrderContext(raw: string) {
  const identity = await getCurrentUser();
  if (identity.status !== "authenticated")
    return {
      ok: false,
      status: identity.status === "unauthenticated" ? 401 : 502,
    } as const;
  if (identity.user.rol !== "CLIENTE")
    return { ok: false, status: 403 } as const;
  const id = positiveId(raw);
  if (id === null) return { ok: false, status: 400 } as const;
  return { ok: true, id, user: identity.user } as const;
}
export async function readClientOrder(id: number, userId: number) {
  const { response, data, sessionExpired } = await apiRequest<unknown>(
    `/orders/${id}`,
  );
  if (sessionExpired) return { ok: false, status: 401 } as const;
  if (!response.ok)
    return {
      ok: false,
      status: [400, 403, 404].includes(response.status) ? response.status : 502,
    } as const;
  const projected = projectManagedOrder(data);
  // Verify the raw ownership too; never return another account's order.
  if (
    !data ||
    typeof data !== "object" ||
    !("idCliente" in data) ||
    data.idCliente !== userId
  )
    return { ok: false, status: 404 } as const;
  if (response.status !== 200 || !projected || projected.idPedido !== id)
    return { ok: false, status: 502 } as const;
  return { ok: true, order: projected } as const;
}
