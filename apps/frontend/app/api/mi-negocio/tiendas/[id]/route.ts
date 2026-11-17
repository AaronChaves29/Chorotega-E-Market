import type { NextRequest } from "next/server";
import { apiRequest } from "@/lib/api-client";
import { positiveId } from "@/lib/store-detail";
import { validateStorePatch } from "@/lib/managed-stores";
import {
  managementActor,
  managementFailure,
  managementResponse,
  ownedStore,
  projectManagedStore,
  upstreamStatus,
} from "@/lib/managed-stores-api";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    const actor = await managementActor();
    if (actor.status !== 200) return managementResponse(actor.status);
    const id = positiveId((await context.params).id);
    if (id === null) return managementResponse(400);
    const result = await ownedStore(id, actor.user.idUsuario);
    return managementResponse(result.status, result.store);
  } catch (error) {
    return managementFailure(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const actor = await managementActor();
    if (actor.status !== 200) return managementResponse(actor.status);
    // Cookie-authenticated writes are restricted to JSON from this same origin.
    if (
      request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return managementResponse(403);
    const id = positiveId((await context.params).id);
    if (id === null) return managementResponse(400);
    let patch: unknown;
    try {
      patch = await request.json();
    } catch {
      return managementResponse(400);
    }
    const errors = validateStorePatch(patch);
    if (Object.keys(errors).length)
      return managementResponse(400, {
        message: "Revisá los campos indicados.",
        errors,
      });
    const before = await ownedStore(id, actor.user.idUsuario);
    if (before.status !== 200) return managementResponse(before.status);
    const { response, data, sessionExpired } = await apiRequest<unknown>(
      `/stores/${id}`,
      { method: "PATCH", body: patch },
    );
    if (sessionExpired) return managementResponse(401);
    if (!response.ok)
      return managementResponse(upstreamStatus(response.status));
    const store = projectManagedStore(data);
    if (
      !store ||
      store.idTienda !== id ||
      store.idEmprendedor !== actor.user.idUsuario
    )
      return managementResponse(502);
    return managementResponse(200, store);
  } catch (error) {
    return managementFailure(error);
  }
}
