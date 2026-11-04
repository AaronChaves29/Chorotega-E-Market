"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensaje("");
    setCargando(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, clave }),
      });

      const data = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "No se pudo iniciar sesión.");
      }

      setClave("");
      router.replace("/pedidos");
      router.refresh();
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
    <main className="login-page">
      <section className="login-story" aria-label="Chorotega E-Market">
        <div className="login-story-content">
          <div className="login-brand" aria-label="Chorotega E-Market">
            <span className="login-brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>Chorotega <strong>E-Market</strong></span>
          </div>

          <div className="login-intro">
            <p className="login-eyebrow">IDENTIDAD QUE NOS UNE</p>
            <h1>Lo nuestro,<br />cerca de vos.</h1>
            <p className="login-story-copy">
              Descubrí el talento, los sabores y las historias de quienes hacen
              grande nuestra tierra.
            </p>
          </div>

          <div className="login-artwork" aria-hidden="true">
            <span className="login-artwork-sun" />
            <span className="login-artwork-hill login-artwork-hill-back" />
            <span className="login-artwork-hill login-artwork-hill-front" />
            <span className="login-artwork-vase" />
            <span className="login-artwork-vase-neck" />
            <span className="login-artwork-vase-pattern" />
            <span className="login-artwork-leaf login-artwork-leaf-one" />
            <span className="login-artwork-leaf login-artwork-leaf-two" />
            <span className="login-artwork-caption">HECHO CON ORGULLO LOCAL</span>
          </div>

          <p className="login-story-footer">
            Un mercado con raíces guanacastecas.
          </p>
        </div>
        <span className="login-story-orbit login-story-orbit-one" aria-hidden="true" />
        <span className="login-story-orbit login-story-orbit-two" aria-hidden="true" />
      </section>

      <section className="login-form-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <p className="login-form-kicker">TU COMUNIDAD TE ESPERA</p>
          <h2 id="login-title">Qué bueno verte</h2>
          <p className="login-form-description">
            Ingresá a tu cuenta para continuar.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="correo">Correo electrónico</label>
              <input
                id="correo"
                type="email"
                required
                autoComplete="email"
                value={correo}
                onChange={(event) => setCorreo(event.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div className="login-field">
              <label htmlFor="clave">Contraseña</label>
              <div className="login-password">
                <input
                  id="clave"
                  type={mostrarClave ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={clave}
                  onChange={(event) => setClave(event.target.value)}
                  placeholder="Ingresá tu contraseña"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  aria-label={
                    mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={mostrarClave}
                  onClick={() => setMostrarClave((visible) => !visible)}
                >
                  {mostrarClave ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <button type="submit" disabled={cargando} className="login-submit">
              {cargando ? "Ingresando..." : "Iniciar sesión"}
              {!cargando && <span aria-hidden="true">→</span>}
            </button>
          </form>

          {mensaje && (
            <p role="alert" className="login-error">
              {mensaje}
            </p>
          )}

          <p className="login-form-footer">
            Apoyá lo local. Descubrí algo único.
            <span className="mt-3 block">
              ¿No tenés cuenta?{" "}
              <Link
                className="font-semibold text-[#315b47] underline decoration-[#a8b5a7] underline-offset-4"
                href="/registro"
              >
                Registrate
              </Link>
            </span>
          </p>
        </div>
      </section>
    </main>
  );
}
