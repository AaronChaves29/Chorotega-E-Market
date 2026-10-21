
import "server-only";

import { cookies } from "next/headers";
import { getApiUrl } from "@/lib/server-api";

export const SESSION_COOKIE = "chorotega_session";

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  authenticated?: boolean;
  timeoutMs?: number;
};

export type ApiResult<T> = {
  response: Response;
  data: T | null;
  sessionExpired: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const {
    method = "GET",
    body,
    authenticated = true,
    timeoutMs = 10000,
  } = options;

  const headers = new Headers({
    Accept: "application/json",
  });

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (authenticated) {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) {
      return {
        response: new Response(
          JSON.stringify({ message: "Debés iniciar sesión." }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        ),
        data: null,
        sessionExpired: true,
      };
    }

    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = (await response.json().catch(() => null)) as T | null;

  return {
    response,
    data,
    sessionExpired: authenticated && response.status === 401,
  };
}
