"use client";

export default function ProfileUnavailable() {
  return (
    <main className="account-page">
      <section className="account-card" role="alert">
        <h1>No pudimos consultar tu cuenta</h1>
        <p>
          El servidor no está disponible en este momento. Tu sesión no se cerró.
        </p>
        <button
          className="account-action"
          onClick={() => window.location.reload()}
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
