import { apiRequest } from "./api-client";
import type { LoginCredentials, LoginResponse } from "../types/auth";

export async function login(
  credentials: LoginCredentials,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}