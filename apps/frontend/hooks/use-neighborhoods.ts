"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Neighborhood } from "@/types/catalog";
import { cents, validId } from "@/lib/cart";

export function useNeighborhoods(enabled = true) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    neighborhoods: Neighborhood[];
    loading: boolean;
    error: string;
  }>({ neighborhoods: [], loading: true, error: "" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/neighborhoods", {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (response.status === 401) {
          router.replace("/login?sesion=vencida");
          return;
        }
        if (!response.ok) throw new Error("Barrios no disponibles");
        const data: unknown = await response.json();
        if (
          !Array.isArray(data) ||
          !data.every(
            (n) =>
              validId(n.idBarrio) &&
              typeof n.nombre === "string" &&
              n.estado === "ACTIVO" &&
              typeof n.tarifaEnvio === "string" &&
              cents(n.tarifaEnvio) >= BigInt(0),
          )
        )
          throw new Error("Barrios no disponibles");
        if (!controller.signal.aborted)
          setResult({ neighborhoods: data, loading: false, error: "" });
      } catch {
        if (!controller.signal.aborted)
          setResult({
            neighborhoods: [],
            loading: false,
            error: "No fue posible cargar los barrios. Intentá nuevamente.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [router, attempt, enabled]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}
