"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setCargando(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("No se pudo cerrar sesión.");
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError("No se pudo cerrar sesión. Intentá nuevamente.");
      setCargando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={cargando}
        className="rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {cargando ? "Saliendo..." : "Cerrar sesión"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}