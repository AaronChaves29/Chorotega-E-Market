import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { SESSION_COOKIE } from "@/lib/api-client";
import { CART_SESSION_COOKIE, cartScope } from "@/lib/cart-session";

export async function GET() {
  const identity = await getCurrentUser();
  if (identity.status !== "authenticated" || identity.user.rol !== "CLIENTE") {
    const status =
      identity.status === "unauthenticated"
        ? 401
        : identity.status === "unavailable"
          ? 503
          : 403;
    return NextResponse.json(
      { message: "No se pudo habilitar el carrito." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({}, { status: 401 });
  const previous = jar.get(CART_SESSION_COOKIE)?.value;
  const nonce =
    previous && /^[a-f0-9-]{36}$/.test(previous) ? previous : randomUUID();
  const response = NextResponse.json(
    {
      userId: identity.user.idUsuario,
      scope: cartScope(identity.user.idUsuario, nonce, token),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
  if (nonce !== previous)
    response.cookies.set(CART_SESSION_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  return response;
}
