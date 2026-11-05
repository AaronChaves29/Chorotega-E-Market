"use client";

import { useState } from "react";

export default function LogoutButton() {
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

      // Navegación completa: descarta el router cache y los datos de esta cuenta.
      window.location.replace("/login");
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
        className="account-logout"
      >
        {cargando ? "Saliendo..." : "Cerrar sesión"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
