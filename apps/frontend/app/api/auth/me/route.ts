import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { SESSION_COOKIE } from "@/lib/api-client";

export async function GET() {
  const result = await getCurrentUser();
  const response = NextResponse.json(
    result.status === "authenticated"
      ? result.user
      : {
          message:
            result.status === "unauthenticated"
              ? "Tu sesión venció o ya no es válida. Iniciá sesión nuevamente."
              : "No se pudo consultar tu cuenta. Intentá nuevamente.",
        },
    {
      status:
        result.status === "authenticated"
          ? 200
          : result.status === "unauthenticated"
            ? 401
            : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
  if (result.status === "unauthenticated")
    response.cookies.delete(SESSION_COOKIE);
  return response;
}
