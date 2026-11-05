import "server-only";

export function getApiUrl(): string {
  const apiUrl = process.env.API_URL;

  if (!apiUrl) {
    throw new Error("Falta configurar API_URL.");
  }

  return apiUrl.replace(/\/$/, "");
}

export function getAdminLoginUrl(): string {
  // REST usa /api/v1; MVC /admin está excluido del prefijo en NestJS.
  const apiUrl = new URL(getApiUrl());
  if (
    !["http:", "https:"].includes(apiUrl.protocol) ||
    apiUrl.username ||
    apiUrl.password
  ) {
    throw new Error("El origen del backend no es válido.");
  }
  return new URL("/admin/login", apiUrl.origin).toString();
}
