import { CART_SESSION_COOKIE } from "@/lib/cart-session";
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    message: "Sesión cerrada.",
  });

  response.cookies.set("chorotega_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.delete(CART_SESSION_COOKIE);
  return response;
}
