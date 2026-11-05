export interface LoginCredentials {
  correo: string;
  clave: string;
}

export interface LoginResponse {
  token: string;
  tipo: string;
  expiraEnSegundos: number;
}

export type UserRole = "CLIENTE" | "EMPRENDEDOR" | "ADMIN" | "REPARTIDOR";

export interface CurrentUser {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: UserRole;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  CLIENTE: "Cliente",
  EMPRENDEDOR: "Emprendedor",
  ADMIN: "Administrador",
  REPARTIDOR: "Repartidor",
};

export function accountDestination(role: UserRole): "/pedidos" | "/cuenta" {
  return role === "CLIENTE" ? "/pedidos" : "/cuenta";
}
