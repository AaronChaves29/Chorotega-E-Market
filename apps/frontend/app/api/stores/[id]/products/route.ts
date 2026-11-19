import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import {
  isStoreProductPage,
  positiveId,
  storeProductParams,
} from "@/lib/store-detail";
import { activeStore, detailResponse } from "@/lib/store-detail-api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const id = positiveId((await context.params).id);
  const params =
    id === null ? null : storeProductParams(request.nextUrl.searchParams, id);
  if (id === null || !params) return detailResponse(400);
  try {
    const store = await activeStore(id);
    if (store.status !== 200) return detailResponse(store.status);
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/products?${params.toString()}`,
    );
    if (sessionExpired) return detailResponse(401);
    if (!response.ok) return detailResponse(response.status);
    if (
      !isStoreProductPage(data, id) ||
      data.page !== Number(params.get("page")) ||
      data.size !== Number(params.get("size"))
    )
      return detailResponse(502);
    return detailResponse(200, {
      page: data.page,
      size: data.size,
      totalElements: data.totalElements,
      totalPages: data.totalPages,
      content: data.content.map(
        ({
          idProducto,
          idTienda,
          nombre,
          descripcion,
          precio,
          cantidadDisponible,
          estado,
        }) => ({
          idProducto,
          idTienda,
          nombre,
          descripcion,
          precio,
          cantidadDisponible,
          estado,
        }),
      ),
    });
  } catch {
    return detailResponse(502);
  }
}
