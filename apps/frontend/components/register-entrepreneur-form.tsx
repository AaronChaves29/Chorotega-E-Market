"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  validateEntrepreneurRegistration,
  type EntrepreneurRegistrationInput,
} from "@/lib/entrepreneur-registration";

export default function RegisterEntrepreneurForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [registered, setRegistered] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "");
    const telefono = text("telefono").trim();
    const body: EntrepreneurRegistrationInput = {
      nombre: text("nombre").trim(),
      apellido: text("apellido").trim(),
      correo: text("correo").trim(),
      clave: text("clave"),
      ...(telefono ? { telefono } : {}),
      tienda: {
        nombre: text("negocio").trim(),
        direccion: text("direccion").trim(),
        descripcion: text("descripcion").trim(),
        horario: text("horario").trim(),
      },
    };
    const validation = validateEntrepreneurRegistration(body);
    if (body.clave !== text("confirmacion"))
      validation.push("Las contraseñas no coinciden.");
    setErrors(validation);
    if (validation.length) return;
    submitting.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register/entrepreneur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
        errors?: string[];
      } | null;
      if (!response.ok) {
        setErrors([
          result?.message ?? "No se pudo registrar el negocio.",
          ...(Array.isArray(result?.errors)
            ? result.errors.filter((error) => typeof error === "string")
            : []),
        ]);
        return;
      }
      form.reset();
      setRegistered(true);
    } catch {
      setErrors([
        "No se pudo confirmar el resultado. Intentá iniciar sesión antes de repetir el registro.",
      ]);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  if (registered)
    return (
      <section className="registration-success" role="status">
        <span className="registration-success-icon" aria-hidden="true">
          ✓
        </span>
        <h3>¡Tu cuenta de negocio está lista!</h3>
        <p>
          Tu cuenta de emprendedor y tu tienda se crearon correctamente. Iniciá
          sesión para consultar tu perfil. El panel de gestión estará disponible
          en una fase posterior.
        </p>
        <Link className="registration-submit" href="/login">
          Ir a iniciar sesión →
        </Link>
      </section>
    );

  return (
    <form className="registration-form" onSubmit={submit} aria-busy={loading}>
      <div className="registration-field">
        <label htmlFor="entrepreneur-negocio">Nombre del negocio</label>
        <input
          id="entrepreneur-negocio"
          name="negocio"
          required
          maxLength={150}
          autoComplete="organization"
          placeholder="Ingresá el nombre de tu negocio"
        />
      </div>
      <div className="registration-name-fields">
        <div className="registration-field">
          <label htmlFor="entrepreneur-nombre">Tu nombre personal</label>
          <input
            id="entrepreneur-nombre"
            name="nombre"
            required
            maxLength={100}
            autoComplete="given-name"
          />
        </div>
        <div className="registration-field">
          <label htmlFor="entrepreneur-apellido">Tus apellidos</label>
          <input
            id="entrepreneur-apellido"
            name="apellido"
            required
            maxLength={100}
            autoComplete="family-name"
          />
        </div>
      </div>
      <div className="registration-field">
        <label htmlFor="entrepreneur-correo">Correo electrónico</label>
        <input
          id="entrepreneur-correo"
          name="correo"
          type="email"
          required
          maxLength={150}
          autoComplete="email"
          placeholder="negocio@correo.com"
        />
      </div>
      <div className="registration-name-fields">
        <div className="registration-field">
          <label htmlFor="entrepreneur-clave">Contraseña</label>
          <div className="registration-password">
            <input
              id="entrepreneur-clave"
              name="clave"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              aria-describedby="entrepreneur-password-help"
            />
            <button
              type="button"
              className="registration-password-toggle"
              aria-pressed={showPassword}
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        <div className="registration-field">
          <label htmlFor="entrepreneur-confirmacion">
            Confirmar contraseña
          </label>
          <div className="registration-password">
            <input
              id="entrepreneur-confirmacion"
              name="confirmacion"
              type={showConfirmation ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="registration-password-toggle"
              aria-pressed={showConfirmation}
              aria-label={
                showConfirmation
                  ? "Ocultar confirmación de contraseña"
                  : "Mostrar confirmación de contraseña"
              }
              onClick={() => setShowConfirmation((value) => !value)}
            >
              {showConfirmation ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
      </div>
      <p id="entrepreneur-password-help" className="registration-help">
        Usá al menos 8 caracteres y no más de 72 bytes.
      </p>
      <div className="registration-field">
        <label htmlFor="entrepreneur-direccion">Dirección del negocio</label>
        <input
          id="entrepreneur-direccion"
          name="direccion"
          required
          maxLength={255}
          autoComplete="street-address"
          placeholder="Dirección para ubicar tu negocio"
        />
      </div>
      <div className="registration-field">
        <label htmlFor="entrepreneur-descripcion">
          Descripción <span className="registration-optional">(opcional)</span>
        </label>
        <textarea
          id="entrepreneur-descripcion"
          name="descripcion"
          maxLength={500}
          rows={3}
          placeholder="Contanos sobre tu negocio y lo que creás"
        />
      </div>
      <div className="registration-field">
        <label htmlFor="entrepreneur-telefono">
          Teléfono de contacto{" "}
          <span className="registration-optional">(opcional)</span>
        </label>
        <input
          id="entrepreneur-telefono"
          name="telefono"
          type="tel"
          maxLength={20}
          autoComplete="tel"
          placeholder="+506 8888-8888"
          aria-describedby="entrepreneur-phone-help"
        />
        <p id="entrepreneur-phone-help" className="registration-help">
          Se guardará como contacto de tu cuenta y de tu negocio.
        </p>
      </div>
      <div className="registration-field">
        <label htmlFor="entrepreneur-horario">
          Horario <span className="registration-optional">(opcional)</span>
        </label>
        <input
          id="entrepreneur-horario"
          name="horario"
          maxLength={150}
          placeholder="Ejemplo: lunes a viernes, 8 a. m. a 5 p. m."
        />
      </div>
      <aside className="registration-pending" aria-label="Funciones pendientes">
        <strong>Logo del negocio y redes sociales</strong>
        <p>
          Pendientes de integración. No se solicitan ni se guardan en este
          registro.
        </p>
      </aside>
      {errors.length > 0 ? (
        <div className="registration-error" role="alert">
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button className="registration-submit" type="submit" disabled={loading}>
        {loading ? "Creando cuenta de negocio…" : "Crear cuenta de negocio"}
      </button>
    </form>
  );
}
