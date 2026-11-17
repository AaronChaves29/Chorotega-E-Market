import "server-only";
import { apiRequest } from "@/lib/api-client";
import {
  managementActor,
  managementResponse,
  ownedStore,
  upstreamStatus,
} from "@/lib/managed-stores-api";
import { positiveId } from "@/lib/store-detail";
import { projectManagedOrder, type OrderStore } from "@/lib/managed-orders";
export function orderResponse(status: number, data?: unknown) {
  return managementResponse(
    status,
    data ??
      (status === 409
        ? {
            message:
              "El pedido cambió o no permite comenzar preparación. Consultá el estado vigente antes de continuar.",
          }
        : status === 404
          ? {
              message:
                "No encontramos este pedido o tienda entre tus negocios.",
            }
          : undefined),
  );
}
export function orderStatus(status: number) {
  return status === 409 ? 409 : upstreamStatus(status);
}
export async function orderStoreContext(text: string) {
  const actor = await managementActor();
  if (actor.status !== 200) return { ok: false, status: actor.status } as const;
  const id = positiveId(text);
  if (id === null) return { ok: false, status: 400 } as const;
  const own = await ownedStore(id, actor.user.idUsuario);
  if (own.status !== 200 || !own.store)
    return {
      ok: false,
      status: own.status === 200 ? 502 : own.status,
    } as const;
  const store: OrderStore = {
    idTienda: own.store.idTienda,
    nombre: own.store.nombre,
    estado: own.store.estado,
  };
  return { ok: true, status: 200, store } as const;
}
export async function scopedOrder(id: number, store: number) {
  const { response, data, sessionExpired } = await apiRequest<unknown>(
    `/orders/${id}`,
  );
  if (sessionExpired) return { ok: false, status: 401 } as const;
  if (!response.ok)
    return { ok: false, status: orderStatus(response.status) } as const;
  const order = projectManagedOrder(data);
  if (response.status !== 200 || !order || order.idPedido !== id)
    return { ok: false, status: 502 } as const;
  if (order.idTienda !== store) return { ok: false, status: 404 } as const;
  return { ok: true, status: 200, order } as const;
}
