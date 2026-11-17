import "server-only";
import { NextResponse } from "next/server";
import { apiRequest, SESSION_COOKIE } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/current-user";
import { isStoreDetail } from "@/lib/store-detail";
import { safeStoreSocialContacts } from "@/lib/store-social-contact";
import type { Store } from "@/types/catalog";

export function managementResponse(status: number, data?: unknown) {
  const messages: Record<number, string> = {
    400: "Revisá los campos o parámetros de la solicitud.",
    401: "Tu sesión venció o no es válida. Iniciá sesión nuevamente.",
    403: "Esta gestión está disponible únicamente para emprendedores autorizados.",
    404: "No encontramos esa tienda entre tus negocios.",
    500: "No fue posible completar la operación. Intentá nuevamente.",
    502: "No pudimos confirmar la operación con el servidor. Conservá tus datos y comprobá el resultado antes de intentar nuevamente.",
  };
  const result = NextResponse.json(
    data ?? { message: messages[status] ?? messages[500] },
    { status, headers: { "Cache-Control": "no-store" } },
  );
  if (status === 401) result.cookies.delete(SESSION_COOKIE);
  return result;
}

export async function managementActor() {
  const result = await getCurrentUser();
  if (result.status === "unauthenticated") return { status: 401 } as const;
  if (result.status !== "authenticated") return { status: 502 } as const;
  if (result.user.rol !== "EMPRENDEDOR") return { status: 403 } as const;
  return { status: 200, user: result.user } as const;
}

export function projectManagedStore(value: unknown): Store | null {
  if (!isStoreDetail(value)) return null;
  const store = value as Store;
  if (
    !Number.isInteger(store.idEmprendedor) ||
    store.idEmprendedor < 1 ||
    typeof store.fechaCreacion !== "string"
  )
    return null;
  return {
    idTienda: store.idTienda,
    idEmprendedor: store.idEmprendedor,
    nombre: store.nombre,
    descripcion: store.descripcion,
    direccion: store.direccion,
    telefono: store.telefono,
    horario: store.horario,
    ...safeStoreSocialContacts(store),
    estado: store.estado,
    fechaCreacion: store.fechaCreacion,
  };
}

export async function ownedStore(id: number, owner: number) {
  const { response, data, sessionExpired } = await apiRequest<unknown>(
    `/stores/${id}`,
  );
  if (sessionExpired) return { status: 401 } as const;
  if (!response.ok) return { status: upstreamStatus(response.status) } as const;
  const store = projectManagedStore(data);
  if (!store || store.idTienda !== id) return { status: 502 } as const;
  if (store.idEmprendedor !== owner) return { status: 404 } as const;
  return { status: 200, store } as const;
}

export function upstreamStatus(status: number) {
  return [400, 401, 403, 404].includes(status) ? status : 500;
}
export function managementFailure(error: unknown) {
  return managementResponse(
    error instanceof TypeError ||
      (error instanceof Error &&
        ["AbortError", "TimeoutError"].includes(error.name))
      ? 502
      : 500,
  );
}
