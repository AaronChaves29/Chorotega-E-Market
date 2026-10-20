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

  return response;
}