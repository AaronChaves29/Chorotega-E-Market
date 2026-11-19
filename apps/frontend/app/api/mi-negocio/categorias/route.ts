import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { managementActor, managementFailure } from "@/lib/managed-stores-api";
import {
  projectManagedCategory,
  validPage,
  type ManagedCategory,
} from "@/lib/managed-products";
import { productResponse, productStatus } from "@/lib/managed-products-api";
export async function GET(request: NextRequest) {
  try {
    const actor = await managementActor();
    if (actor.status !== 200) return productResponse(actor.status);
    if ([...request.nextUrl.searchParams.keys()].length)
      return productResponse(400);
    const categories: ManagedCategory[] = [];
    let pages = 1,
      total = -1;
    for (let page = 0; page < pages; page++) {
      const { response, data, sessionExpired } = await apiRequest<unknown>(
        `/categories?page=${page}&size=100&sortBy=idCategoria&sortDirection=ASC`,
      );
      if (sessionExpired) return productResponse(401);
      if (!response.ok) return productResponse(productStatus(response.status));
      if (!validPage(data, page, 100)) return productResponse(502);
      if (page === 0) {
        pages = data.totalPages;
        total = data.totalElements;
      }
      if (data.totalPages !== pages || data.totalElements !== total)
        return productResponse(502);
      for (const raw of data.content) {
        const c = projectManagedCategory(raw);
        if (
          !c ||
          categories.some((existing) => existing.idCategoria === c.idCategoria)
        )
          return productResponse(502);
        categories.push(c);
      }
    }
    if (categories.length !== total) return productResponse(502);
    return productResponse(200, { categories });
  } catch (error) {
    return managementFailure(error);
  }
}
