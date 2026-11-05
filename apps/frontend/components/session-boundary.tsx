"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CurrentUser } from "@/types/auth";

// Revalida al volver a una pestaña o al historial; no guarda identidad entre sesiones.
export default function SessionBoundary({
  user,
  children,
}: {
  user: CurrentUser;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<"ready" | "checking" | "unavailable">(
    "checking",
  );
  const pending = useRef(false);
  const check = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setStatus("checking");
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 401) {
        window.location.replace("/login?sesion=vencida");
        return;
      }
      if (!response.ok) throw new Error("Perfil no disponible");
      const current: CurrentUser = await response.json();
      if (
        current.idUsuario !== user.idUsuario ||
        current.rol !== user.rol ||
        current.nombre !== user.nombre ||
        current.apellido !== user.apellido ||
        current.correo !== user.correo
      ) {
        window.location.replace("/");
        return;
      }
      setStatus("ready");
    } catch {
      setStatus("unavailable");
    } finally {
      pending.current = false;
    }
  }, [user.idUsuario, user.rol, user.nombre, user.apellido, user.correo]);

  useEffect(() => {
    function visible() {
      if (document.visibilityState === "visible") void check();
    }
    function restored(event: PageTransitionEvent) {
      if (event.persisted) void check();
    }
    // Oculta antes de almacenar en bfcache o abandonar la pestaña.
    function hide() {
      setStatus("checking");
    }
    function visibility() {
      if (document.visibilityState === "hidden") hide();
      else visible();
    }
    window.addEventListener("pageshow", restored);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visibility);
    const interval = window.setInterval(visible, 30000);
    const initialCheck = window.setTimeout(() => void check(), 0);
    return () => {
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visibility);
      window.clearInterval(interval);
      window.clearTimeout(initialCheck);
    };
  }, [check]);

  return (
    <>
      {status !== "ready" ? (
        <section
          className="session-notice"
          role={status === "unavailable" ? "alert" : "status"}
        >
          <p>
            {status === "unavailable"
              ? "No se pudo verificar tu sesión. Tu sesión no se cerró."
              : "Verificando tu sesión…"}
          </p>
          {status === "unavailable" ? (
            <button className="account-action" onClick={() => void check()}>
              Reintentar
            </button>
          ) : null}
        </section>
      ) : null}
      <div hidden={status !== "ready"}>{children}</div>
    </>
  );
}
