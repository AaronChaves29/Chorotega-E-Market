"use client";
import { useEffect, useState } from "react";

export function useBusinessData<T>(url: string) {
  const [attempt, setAttempt] = useState(0);
  const key = `${url}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    status: number;
    data?: T;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!active) return;
        if (response.status === 401) {
          window.location.replace("/login?sesion=vencida");
          return;
        }
        const data = response.ok ? ((await response.json()) as T) : undefined;
        if (active) setResult({ key, status: response.status, data });
      } catch {
        if (active) setResult({ key, status: 502 });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [url, key]);
  const current = result?.key === key ? result : undefined;
  return {
    loading: !current,
    status: current?.status,
    data: current?.data,
    retry: () => setAttempt((n) => n + 1),
  };
}
