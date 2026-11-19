import "server-only";
import { redirect } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import type { CurrentUser } from "@/types/auth";

export type CurrentUserResult =
  | { status: "authenticated"; user: CurrentUser }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

export async function getCurrentUser(): Promise<CurrentUserResult> {
  try {
    const { response, data, sessionExpired } =
      await apiRequest<CurrentUser>("/auth/me");
    if (sessionExpired) return { status: "unauthenticated" };
    if (
      !response.ok ||
      !data ||
      !Number.isInteger(data.idUsuario) ||
      data.idUsuario < 1 ||
      typeof data.nombre !== "string" ||
      typeof data.apellido !== "string" ||
      typeof data.correo !== "string" ||
      !["CLIENTE", "EMPRENDEDOR", "ADMIN", "REPARTIDOR"].includes(data.rol)
    )
      return { status: "unavailable" };
    // Solo estos atributos cruzan el límite servidor/cliente; nunca el JWT.
    return {
      status: "authenticated",
      user: {
        idUsuario: data.idUsuario,
        nombre: data.nombre,
        apellido: data.apellido,
        correo: data.correo,
        rol: data.rol,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function requireCurrentUser() {
  const result = await getCurrentUser();
  if (result.status === "unauthenticated") redirect("/api/auth/session");
  return result;
}
