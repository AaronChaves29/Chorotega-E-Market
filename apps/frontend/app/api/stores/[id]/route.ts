import type { NextRequest } from "next/server";
import { positiveId } from "@/lib/store-detail";
import { activeStore, detailResponse } from "@/lib/store-detail-api";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const id = positiveId((await context.params).id);
  if (id === null) return detailResponse(400);
  try {
    const result = await activeStore(id);
    return detailResponse(result.status, result.store);
  } catch {
    return detailResponse(502);
  }
}
