"use client";

import { useState, type FormEvent } from "react";
import { login } from "../../services/auth";

export default function LoginPage() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [autenticado, setAutenticado] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensaje("");
    setAutenticado(false);
    setCargando(true);

    try {
      const respuesta = await login({ correo, clave });

      if (!respuesta.token) {
        throw new Error("El servidor no devolvió un token.");
      }

      // Por ahora verificamos el login sin almacenar el JWT.
      // La gestión segura de sesiones será el siguiente bloque.
      setAutenticado(true);
      setClave("");
      setMensaje("Inicio de sesión correcto.");
    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado.",
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <section className="w-full max-w-md rounded-xl bg-white p-8 shadow-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          Chorotega E-Market
        </h1>

        <p className="mt-2 text-center text-gray-600">
          Iniciar sesión
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="correo"
              className="block text-sm font-medium text-gray-700"
            >
              Correo electrónico
            </label>

            <input
              id="correo"
              type="email"
              required
              autoComplete="email"
              value={correo}
              onChange={(event) => setCorreo(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div>
            <label
              htmlFor="clave"
              className="block text-sm font-medium text-gray-700"
            >
              Contraseña
            </label>

            <input
              id="clave"
              type="password"
              required
              autoComplete="current-password"
              value={clave}
              onChange={(event) => setClave(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              placeholder="Ingresa tu contraseña"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-lg bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800 disabled:opacity-50"
          >
            {cargando ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>

        {mensaje && (
          <p
            role={autenticado ? "status" : "alert"}
            className={`mt-4 text-center text-sm ${
              autenticado ? "text-green-700" : "text-red-600"
            }`}
          >
            {mensaje}
          </p>
        )}
      </section>
    </main>
  );
}