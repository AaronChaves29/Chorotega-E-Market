import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { SESSION_COOKIE } from "@/lib/api-client";
import { accountDestination } from "@/types/auth";

// Revalida antes de borrar: una navegación atrasada no elimina una sesión nueva.
export async function GET(request: NextRequest) {
  const result = await getCurrentUser();
  const target =
    result.status === "authenticated"
      ? accountDestination(result.user.rol)
      : result.status === "unavailable"
        ? "/cuenta"
        : "/login?sesion=vencida";
  const response = NextResponse.redirect(new URL(target, request.url));
  response.headers.set("Cache-Control", "no-store");
  if (result.status === "unauthenticated")
    response.cookies.delete(SESSION_COOKIE);
  return response;
}
