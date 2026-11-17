import "server-only";
import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { positiveId } from "@/lib/store-detail";
import {
  managementActor,
  managementResponse,
  ownedStore,
  upstreamStatus,
} from "@/lib/managed-stores-api";
import {
  projectManagedCategory,
  projectManagedProduct,
  validPage,
  type ProductBody,
  type ManagedProduct,
} from "@/lib/managed-products";

export function productResponse(status: number, data?: unknown) {
  return managementResponse(
    status,
    data ??
      (status === 409
        ? {
            message:
              "Este producto cambió desde que lo abriste. Consultá la versión vigente antes de volver a editar.",
          }
        : status === 404
          ? {
              message:
                "No encontramos este recurso entre los productos de tu negocio.",
            }
          : undefined),
  );
}
export function productStatus(status: number) {
  return status === 409 ? 409 : upstreamStatus(status);
}
export function sameOriginJson(request: NextRequest) {
  return (
    request.headers.get("origin") === request.nextUrl.origin &&
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ===
      "application/json"
  );
}
export async function productStoreContext(text: string) {
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
  return {
    ok: true,
    status: 200,
    store: own.store,
    actor: actor.user,
  } as const;
}
export async function scopedProducts(params: URLSearchParams, store: number) {
  const query = new URLSearchParams(params);
  query.set("idTienda", String(store));
  const { response, data, sessionExpired } = await apiRequest<unknown>(
    `/products?${query}`,
  );
  if (sessionExpired) return { ok: false, status: 401 } as const;
  if (!response.ok)
    return { ok: false, status: productStatus(response.status) } as const;
  if (!validPage(data, Number(query.get("page")), Number(query.get("size"))))
    return { ok: false, status: 502 } as const;
  const content = data.content.map(projectManagedProduct);
  if (content.some((p) => !p || p.idTienda !== store))
    return { ok: false, status: 502 } as const;
  return {
    ok: true,
    status: 200,
    data: {
      content: content as ManagedProduct[],
      page: data.page,
      size: data.size,
      totalElements: data.totalElements,
      totalPages: data.totalPages,
    },
  } as const;
}
// Call only after authenticating and verifying ownership of the requested store.
// The authenticated catalog permits this read; never return a different store's
// product, even when its owner is the same authenticated entrepreneur.
export async function scopedProduct(id: number, store: number) {
  const { response, data, sessionExpired } = await apiRequest<unknown>(
    `/products/${id}`,
  );
  if (sessionExpired) return { ok: false, status: 401 } as const;
  if (!response.ok)
    return { ok: false, status: productStatus(response.status) } as const;
  const product = projectManagedProduct(data);
  if (!product || product.idProducto !== id)
    return { ok: false, status: 502 } as const;
  if (product.idTienda !== store) return { ok: false, status: 404 } as const;
  return { ok: true, status: 200, product } as const;
}
export async function categoryForWrite(
  body: ProductBody,
  current?: ManagedProduct,
) {
  if (
    body.idCategoria === undefined ||
    body.idCategoria === current?.idCategoria
  )
    return 200;
  const { response, data, sessionExpired } = await apiRequest<unknown>(
    `/categories/${body.idCategoria}`,
  );
  if (sessionExpired) return 401;
  if (!response.ok) return productStatus(response.status);
  const category = projectManagedCategory(data);
  if (!category || category.idCategoria !== body.idCategoria) return 502;
  return category.estado === "ACTIVA" ? 200 : 400;
}
