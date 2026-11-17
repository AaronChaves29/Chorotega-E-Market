"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Store, PaginatedResponse } from "@/types/catalog";
import { storeSocialLinks } from "@/lib/store-social-contact";
import styles from "./business.module.css";

export default function StoreManager() {
  const [page, setPage] = useState(0),
    [attempt, setAttempt] = useState(0);
  const key = `${page}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    status: number;
    data?: PaginatedResponse<Store>;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(
          `/api/mi-negocio/tiendas?page=${page}&size=6`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!active) return;
        if (response.status === 401) {
          window.location.replace("/login?sesion=vencida");
          return;
        }
        const data = response.ok
          ? ((await response.json()) as PaginatedResponse<Store>)
          : undefined;
        if (active) setResult({ key, status: response.status, data });
      } catch {
        if (active) setResult({ key, status: 502 });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, key]);
  const current = result?.key === key ? result : undefined;
  return (
    <section aria-labelledby="my-stores-title" aria-busy={!current}>
      <h2 id="my-stores-title">Mis tiendas</h2>
      <p className={styles.help}>
        Incluye tus negocios activos e inactivos. No se modifica su propietario
        ni su estado desde esta pantalla.
      </p>
      {!current ? (
        <p role="status" className={styles.panel}>
          Cargando tus tiendas…
        </p>
      ) : current.status !== 200 || !current.data ? (
        <section
          className={styles.panel}
          role="alert"
          data-management-status={current.status}
        >
          <h3>No pudimos consultar tus tiendas</h3>
          <p>
            {current.status === 403
              ? "Necesitás una cuenta EMPRENDEDOR para acceder."
              : "Intentá nuevamente. Tu sesión no se cerró."}
          </p>
          <button
            className={styles.button}
            onClick={() => setAttempt((v) => v + 1)}
          >
            Reintentar
          </button>
        </section>
      ) : (
        <>
          <p role="status">
            {current.data.totalElements}{" "}
            {current.data.totalElements === 1 ? "tienda" : "tiendas"} · Página{" "}
            {page + 1} de {Math.max(1, current.data.totalPages)}
          </p>
          {current.data.content.length === 0 ? (
            <div className={styles.panel}>
              <h3>
                {page === 0
                  ? "Todavía no tenés tiendas"
                  : "No hay tiendas en esta página"}
              </h3>
              <p>
                Cuando existan negocios asociados a tu cuenta, aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className={styles.stores}>
              {current.data.content.map((store) => (
                <article
                  className={styles.panel}
                  key={store.idTienda}
                  data-managed-store={store.idTienda}
                >
                  <span className={styles.badge}>
                    {store.estado === "ACTIVA" ? "Activa" : "Inactiva"}
                  </span>
                  <h3>{store.nombre}</h3>
                  <p className={styles.description}>
                    {store.descripcion || "Sin descripción registrada."}
                  </p>
                  <dl className={styles.details}>
                    <div>
                      <dt>Dirección</dt>
                      <dd>{store.direccion}</dd>
                    </div>
                    <div>
                      <dt>Teléfono comercial</dt>
                      <dd>{store.telefono || "No registrado"}</dd>
                    </div>
                    <div>
                      <dt>Horario</dt>
                      <dd>{store.horario || "No registrado"}</dd>
                    </div>
                  </dl>
                  {storeSocialLinks(store).length ? (
                    <nav
                      className={styles.contacts}
                      aria-label={`Contactos comerciales de ${store.nombre}`}
                    >
                      {storeSocialLinks(store).map((link) => (
                        <a
                          key={link.kind}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.label} ↗
                        </a>
                      ))}
                    </nav>
                  ) : (
                    <p className={styles.help}>
                      Sin redes sociales registradas.
                    </p>
                  )}
                  <div className={styles.actions}>
                    <Link
                      className={styles.button}
                      href={`/mi-negocio/tiendas/${store.idTienda}/editar`}
                      prefetch={false}
                    >
                      Editar tienda
                    </Link>
                    {store.estado === "ACTIVA" ? (
                      <Link
                        className={styles.secondary}
                        href={`/tiendas/${store.idTienda}`}
                        prefetch={false}
                      >
                        Ver tienda
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
          <nav
            className={styles.pagination}
            aria-label="Páginas de mis tiendas"
          >
            <button
              className={styles.secondary}
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <button
              className={styles.secondary}
              disabled={page + 1 >= current.data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
