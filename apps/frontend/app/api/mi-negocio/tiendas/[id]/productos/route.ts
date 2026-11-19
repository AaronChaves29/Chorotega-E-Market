import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { managementFailure } from "@/lib/managed-stores-api";
import {
  managedProductParams,
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
  scopedProducts,
} from "@/lib/managed-products-api";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const own = await productStoreContext((await context.params).id);
    if (!own.ok) return productResponse(own.status);
    const params = managedProductParams(request.nextUrl.searchParams);
    if (!params) return productResponse(400);
    const result = await scopedProducts(params, own.store.idTienda);
    return result.ok
      ? productResponse(200, { ...result.data, store: own.store })
      : productResponse(result.status);
  } catch (error) {
    return managementFailure(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const own = await productStoreContext((await context.params).id);
    if (!own.ok) return productResponse(own.status);
    if (!sameOriginJson(request)) return productResponse(403);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return productResponse(400);
    }
    const errors = validateProductBody(body, false);
    if (Object.keys(errors).length)
      return productResponse(400, {
        message: "Revisá los campos indicados.",
        errors,
      });
    const dto = body as ProductBody;
    const category = await categoryForWrite(dto);
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
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      "/products",
      { method: "POST", body: { ...dto, idTienda: own.store.idTienda } },
    );
    if (sessionExpired) return productResponse(401);
    if (!response.ok) return productResponse(productStatus(response.status));
    if (response.status !== 201) return productResponse(502);
    const product = projectManagedProduct(data);
    if (!product || product.idTienda !== own.store.idTienda)
      return productResponse(502);
    const result = productResponse(201, product);
    result.headers.set(
      "Location",
      `/api/mi-negocio/tiendas/${own.store.idTienda}/productos/${product.idProducto}`,
    );
    return result;
  } catch (error) {
    return managementFailure(error);
  }
}
