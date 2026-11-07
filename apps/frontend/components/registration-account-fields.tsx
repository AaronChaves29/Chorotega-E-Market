"use client";
import { useState } from "react";
export default function RegistrationAccountFields({
  prefix,
}: {
  prefix: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  return (
    <>
      <div className="registration-name-fields">
        <div className="registration-field">
          <label htmlFor={`${prefix}-nombre`}>Tu nombre personal</label>
          <input
            id={`${prefix}-nombre`}
            name="nombre"
            required
            maxLength={100}
            autoComplete="given-name"
          />
        </div>
        <div className="registration-field">
          <label htmlFor={`${prefix}-apellido`}>Tus apellidos</label>
          <input
            id={`${prefix}-apellido`}
            name="apellido"
            required
            maxLength={100}
            autoComplete="family-name"
          />
        </div>
      </div>
      <div className="registration-field">
        <label htmlFor={`${prefix}-correo`}>Correo electrónico</label>
        <input
          id={`${prefix}-correo`}
          name="correo"
          type="email"
          required
          maxLength={150}
          autoComplete="email"
          placeholder="persona@correo.com"
        />
      </div>
      <div className="registration-name-fields">
        <div className="registration-field">
          <label htmlFor={`${prefix}-clave`}>Contraseña</label>
          <div className="registration-password">
            <input
              id={`${prefix}-clave`}
              name="clave"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              aria-describedby={`${prefix}-password-help`}
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
          <label htmlFor={`${prefix}-confirmacion`}>Confirmar contraseña</label>
          <div className="registration-password">
            <input
              id={`${prefix}-confirmacion`}
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
      <p id={`${prefix}-password-help`} className="registration-help">
        Usá al menos 8 caracteres y no más de 72 bytes.
      </p>
    </>
  );
}
