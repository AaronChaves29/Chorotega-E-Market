import "server-only";

export function getApiUrl(): string {
  const apiUrl = process.env.API_URL;

  if (!apiUrl) {
    throw new Error("Falta configurar API_URL.");
  }

  return apiUrl.replace(/\/$/, "");
}