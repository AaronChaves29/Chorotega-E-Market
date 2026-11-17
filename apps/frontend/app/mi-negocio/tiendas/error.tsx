"use client";
export default function BusinessError({ reset }: { reset: () => void }) {
  return (
    <section role="alert">
      <h2>No pudimos cargar Mi negocio</h2>
      <p>Intentá nuevamente. Tu sesión no se cerró.</p>
      <button className="account-action" onClick={reset}>
        Reintentar
      </button>
    </section>
  );
}
