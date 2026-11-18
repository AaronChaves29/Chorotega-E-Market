import type { NextRequest } from "next/server";
import {
  deliveryAction,
  type DeliveryContext,
} from "@/lib/courier-deliveries-api";
export async function POST(request: NextRequest, context: DeliveryContext) {
  return deliveryAction(request, context, "complete");
}
