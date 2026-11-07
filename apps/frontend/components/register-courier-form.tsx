"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import RegistrationAccountFields from "./registration-account-fields";
import {
  validateCourierRegistration,
  type CourierRegistrationInput,
} from "@/lib/courier-registration";
export default function RegisterCourierForm() {
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
    const body: CourierRegistrationInput = {
      nombre: text("nombre").trim(),
      apellido: text("apellido").trim(),
      correo: text("correo").trim(),
      clave: text("clave"),
      ...(telefono ? { telefono } : {}),
      medioTransporte: text("medioTransporte").trim(),
    };
    const validation = validateCourierRegistration(body);
    if (body.clave !== text("confirmacion"))
      validation.push("Las contraseñas no coinciden.");
    setErrors(validation);
    if (validation.length) return;
    submitting.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register/courier", {
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
          result?.message ?? "No se pudo registrar la cuenta de repartidor.",
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
        <h3>¡Tu cuenta de repartidor está lista!</h3>
        <p>
          Tu cuenta y tu perfil se crearon correctamente. Iniciá sesión para
          consultar tus datos.
        </p>
        <Link className="registration-submit" href="/login">
          Ir a iniciar sesión →
        </Link>
      </section>
    );
  return (
    <form className="registration-form" onSubmit={submit} aria-busy={loading}>
      <RegistrationAccountFields prefix="courier" />
      <div className="registration-field">
        <label htmlFor="courier-telefono">
          Teléfono <span className="registration-optional">(opcional)</span>
        </label>
        <input
          id="courier-telefono"
          name="telefono"
          type="tel"
          maxLength={20}
          autoComplete="tel"
          placeholder="+506 8888-8888"
          aria-describedby="courier-phone-help"
        />
        <p id="courier-phone-help" className="registration-help">
          Entre 8 y 15 dígitos; podés incluir el prefijo internacional.
        </p>
      </div>
      <div className="registration-field">
        <label htmlFor="courier-transporte">Medio de transporte</label>
        <select
          id="courier-transporte"
          name="medioTransporte"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Seleccioná tu medio de transporte
          </option>
          <option value="Bicicleta">Bicicleta</option>
          <option value="Motocicleta">Motocicleta</option>
          <option value="Automóvil">Automóvil</option>
          <option value="A pie">A pie</option>
        </select>
      </div>
      <aside className="registration-pending" aria-label="Funciones pendientes">
        <strong>Placa y descripción del vehículo</strong>
        <p>
          Pendientes de integración. No se solicitan ni se guardan en este
          registro.
        </p>
      </aside>
      {errors.length > 0 && (
        <div className="registration-error" role="alert">
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <button className="registration-submit" type="submit" disabled={loading}>
        {loading ? "Creando cuenta…" : "Crear cuenta de repartidor"}
      </button>
    </form>
  );
}
