import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { positiveId } from "@/lib/store-detail";
import { managementFailure } from "@/lib/managed-stores-api";
import {
  projectManagedProduct,
  validateProductBody,
  type ProductBody,
} from "@/lib/managed-products";
import {
  categoryForWrite,
  productResponse,
  productStatus,
  productStoreContext,
  sameOriginJson,
  scopedProduct,
} from "@/lib/managed-products-api";
type Context = { params: Promise<{ id: string; productoId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    const own = await productStoreContext(params.id);
    if (!own.ok) return productResponse(own.status);
    const id = positiveId(params.productoId);
    if (id === null) return productResponse(400);
    const result = await scopedProduct(id, own.store.idTienda);
    return result.ok
      ? productResponse(200, { store: own.store, product: result.product })
      : productResponse(result.status);
  } catch (error) {
    return managementFailure(error);
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    const own = await productStoreContext(params.id);
    if (!own.ok) return productResponse(own.status);
    if (!sameOriginJson(request)) return productResponse(403);
    const id = positiveId(params.productoId);
    if (id === null) return productResponse(400);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return productResponse(400);
    }
    const errors = validateProductBody(body, true);
    if (Object.keys(errors).length)
      return productResponse(400, {
        message: "Revisá los campos indicados.",
        errors,
      });
    const current = await scopedProduct(id, own.store.idTienda);
    if (!current.ok) return productResponse(current.status);
    const dto = body as ProductBody;
    const category = await categoryForWrite(dto, current.product);
    if (category !== 200)
      return productResponse(
        category,
        category === 400
          ? {
              message: "Seleccioná una categoría activa.",
              errors: { idCategoria: "Seleccioná una categoría activa." },
            }
          : undefined,
      );
    // Preserve the client's original precondition even if current is newer.
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/products/${id}`,
      { method: "PATCH", body: dto },
    );
    if (sessionExpired) return productResponse(401);
    if (!response.ok) return productResponse(productStatus(response.status));
    const product = projectManagedProduct(data);
    if (
      !product ||
      product.idProducto !== id ||
      product.idTienda !== own.store.idTienda ||
      product.version !== dto.version! + 1
    )
      return productResponse(502);
    return productResponse(200, product);
  } catch (error) {
    return managementFailure(error);
  }
}
