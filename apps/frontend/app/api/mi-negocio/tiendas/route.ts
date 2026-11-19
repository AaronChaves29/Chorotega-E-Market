import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { managementPageParams } from "@/lib/managed-stores";
import {
  managementActor,
  managementFailure,
  managementResponse,
  projectManagedStore,
  upstreamStatus,
} from "@/lib/managed-stores-api";
import type { PaginatedResponse } from "@/types/catalog";

export async function GET(request: NextRequest) {
  try {
    const actor = await managementActor();
    if (actor.status !== 200) return managementResponse(actor.status);
    const params = managementPageParams(request.nextUrl.searchParams);
    if (!params) return managementResponse(400);
    params.set("idEmprendedor", String(actor.user.idUsuario));
    const { response, data, sessionExpired } = await apiRequest<
      PaginatedResponse<unknown>
    >(`/stores?${params}`);
    if (sessionExpired) return managementResponse(401);
    if (!response.ok)
      return managementResponse(upstreamStatus(response.status));
    if (
      !data ||
      !Array.isArray(data.content) ||
      data.page !== Number(params.get("page")) ||
      data.size !== Number(params.get("size")) ||
      !Number.isSafeInteger(data.totalElements) ||
      data.totalElements < 0 ||
      data.totalPages !== Math.ceil(data.totalElements / data.size) ||
      data.content.length > data.size
    )
      return managementResponse(502);
    const content = data.content.map(projectManagedStore);
    if (
      content.some(
        (store) => !store || store.idEmprendedor !== actor.user.idUsuario,
      )
    )
      return managementResponse(502);
    return managementResponse(200, {
      content,
      page: data.page,
      size: data.size,
      totalElements: data.totalElements,
      totalPages: data.totalPages,
    });
  } catch (error) {
    return managementFailure(error);
  }
}
