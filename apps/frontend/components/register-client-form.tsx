"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type RegistrationError = {
  message?: string;
  errors?: string[];
};

export default function RegisterClientForm() {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [clave, setClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [registrado, setRegistrado] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensaje("");
    setErrores([]);

    if (clave !== confirmacion) {
      setMensaje("Las contraseñas no coinciden.");
      return;
    }

    setCargando(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          apellido,
          correo,
          ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
          clave,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | RegistrationError
        | null;

      if (!response.ok) {
        setMensaje(
          data?.message ?? "No se pudo crear la cuenta. Revisá tus datos.",
        );
        setErrores(
          Array.isArray(data?.errors)
            ? data.errors.filter((error) => typeof error === "string")
            : [],
        );
        return;
      }

      setClave("");
      setConfirmacion("");
      setRegistrado(true);
    } catch {
      setMensaje("No se pudo conectar con el servidor. Intentá de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  if (registrado) {
    return (
      <section className="registration-success" role="status">
        <span className="registration-success-icon" aria-hidden="true">
          ✓
        </span>
        <h3>¡Tu cuenta está lista!</h3>
        <p>
          Ya podés iniciar sesión con el correo que registraste y descubrir los
          productos de nuestra región.
        </p>
        <Link className="registration-submit" href="/login">
          Ir a iniciar sesión <span aria-hidden="true">→</span>
        </Link>
      </section>
    );
  }

  return (
    <form className="registration-form" onSubmit={handleSubmit}>
      <div className="registration-name-fields">
        <div className="registration-field">
          <label htmlFor="registro-nombre">Nombre(s)</label>
          <input
            id="registro-nombre"
            name="nombre"
            type="text"
            required
            maxLength={100}
            autoComplete="given-name"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Tu nombre"
          />
        </div>
        <div className="registration-field">
          <label htmlFor="registro-apellido">Apellidos</label>
          <input
            id="registro-apellido"
            name="apellido"
            type="text"
            required
            maxLength={100}
            autoComplete="family-name"
            value={apellido}
            onChange={(event) => setApellido(event.target.value)}
            placeholder="Tus apellidos"
          />
        </div>
      </div>

      <div className="registration-field">
        <label htmlFor="registro-correo">Correo electrónico</label>
        <input
          id="registro-correo"
          name="correo"
          type="email"
          required
          maxLength={150}
          autoComplete="email"
          value={correo}
          onChange={(event) => setCorreo(event.target.value)}
          placeholder="correo@ejemplo.com"
        />
      </div>

      <div className="registration-field">
        <label htmlFor="registro-telefono">
          Teléfono <span className="registration-optional">(opcional)</span>
        </label>
        <input
          id="registro-telefono"
          name="telefono"
          type="tel"
          maxLength={20}
          autoComplete="tel"
          value={telefono}
          onChange={(event) => setTelefono(event.target.value)}
          placeholder="Tu número de teléfono"
        />
      </div>

      <div className="registration-field">
        <label htmlFor="registro-clave">Contraseña</label>
        <div className="registration-password">
          <input
            id="registro-clave"
            name="clave"
            type={mostrarClave ? "text" : "password"}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={clave}
            onChange={(event) => setClave(event.target.value)}
            placeholder="Al menos 8 caracteres"
            aria-describedby="registro-clave-ayuda"
          />
          <button
            type="button"
            className="registration-password-toggle"
            aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={mostrarClave}
            onClick={() => setMostrarClave((visible) => !visible)}
          >
            {mostrarClave ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <p id="registro-clave-ayuda" className="registration-help">
          Usá al menos 8 caracteres y no más de 72 bytes.
        </p>
      </div>

      <div className="registration-field">
        <label htmlFor="registro-confirmacion">Confirmar contraseña</label>
        <div className="registration-password">
          <input
            id="registro-confirmacion"
            name="confirmacion"
            type={mostrarConfirmacion ? "text" : "password"}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={confirmacion}
            onChange={(event) => setConfirmacion(event.target.value)}
            placeholder="Repetí tu contraseña"
          />
          <button
            type="button"
            className="registration-password-toggle"
            aria-label={
              mostrarConfirmacion
                ? "Ocultar confirmación de contraseña"
                : "Mostrar confirmación de contraseña"
            }
            aria-pressed={mostrarConfirmacion}
            onClick={() => setMostrarConfirmacion((visible) => !visible)}
          >
            {mostrarConfirmacion ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {mensaje && (
        <div className="registration-error" role="alert">
          <p>{mensaje}</p>
          {errores.length > 0 && (
            <ul>
              {errores.map((error, index) => (
                <li key={`${index}-${error}`}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="submit"
        className="registration-submit"
        disabled={cargando}
      >
        {cargando ? "Creando cuenta..." : "Crear cuenta"}
        {!cargando && <span aria-hidden="true">→</span>}
      </button>
    </form>
  );
}
