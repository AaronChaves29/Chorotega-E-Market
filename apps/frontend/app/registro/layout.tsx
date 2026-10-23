import type { ReactNode } from "react";

export default function RegistrationLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <main className="registration-page">
      <section className="registration-story" aria-label="Chorotega E-Market">
        <div className="registration-story-content">
          <div className="login-brand" aria-label="Chorotega E-Market">
            <span className="login-brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>
              Chorotega <strong>E-Market</strong>
            </span>
          </div>

          <div className="registration-story-intro">
            <p className="login-eyebrow">IDENTIDAD QUE NOS UNE</p>
            <h1>Lo nuestro,<br />crece con vos.</h1>
            <p className="login-story-copy">
              Un espacio para conectar con el talento y los emprendimientos de
              nuestra tierra.
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
        <span
          className="login-story-orbit login-story-orbit-one"
          aria-hidden="true"
        />
        <span
          className="login-story-orbit login-story-orbit-two"
          aria-hidden="true"
        />
      </section>
      <section className="registration-content">{children}</section>
    </main>
  );
}
