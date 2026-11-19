import "server-only";
import { safeStoreSocialContacts } from "@/lib/store-social-contact";
import { NextResponse } from "next/server";
import { apiRequest, SESSION_COOKIE } from "@/lib/api-client";
import { isStoreDetail, type StoreDetail } from "@/lib/store-detail";

export function detailResponse(status: number, data?: unknown) {
  const response = NextResponse.json(
    status === 200
      ? data
      : {
          message:
            status === 401
              ? "Tu sesión venció o no es válida. Iniciá sesión nuevamente."
              : status === 400
                ? "El identificador o los parámetros no son válidos."
                : status === 404
                  ? "La tienda no está disponible."
                  : "No fue posible consultar la tienda. Intentá nuevamente.",
        },
    { status, headers: { "Cache-Control": "no-store" } },
  );
  if (status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export async function activeStore(
  id: number,
): Promise<{ status: number; store?: StoreDetail }> {
  const { response, data, sessionExpired } = await apiRequest<unknown>(
    `/stores/${id}`,
  );
  if (sessionExpired) return { status: 401 };
  if (!response.ok) return { status: response.status };
  if (!isStoreDetail(data) || data.idTienda !== id) return { status: 502 };
  if (data.estado !== "ACTIVA") return { status: 404 };
  const {
    idTienda,
    nombre,
    descripcion,
    direccion,
    telefono,
    horario,
    estado,
  } = data;
  return {
    status: 200,
    store: {
      idTienda,
      nombre,
      descripcion,
      direccion,
      telefono,
      horario,
      ...safeStoreSocialContacts(data),
      estado,
    },
  };
}
