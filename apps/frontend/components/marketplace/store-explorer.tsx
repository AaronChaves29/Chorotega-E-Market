"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MarketplaceHeader from "./marketplace-header";
import { isStorePage } from "@/lib/store-search";
import type { CurrentUser } from "@/types/auth";
import type { PaginatedResponse, Store } from "@/types/catalog";
import styles from "./store-explorer.module.css";

const orders = {
  "nombre-ASC": {
    label: "Nombre del negocio: A–Z",
    sortBy: "nombre",
    sortDirection: "ASC",
  },
  "nombre-DESC": {
    label: "Nombre del negocio: Z–A",
    sortBy: "nombre",
    sortDirection: "DESC",
  },
  "idTienda-ASC": {
    label: "Identificador: menor a mayor",
    sortBy: "idTienda",
    sortDirection: "ASC",
  },
  "idTienda-DESC": {
    label: "Identificador: mayor a menor",
    sortBy: "idTienda",
    sortDirection: "DESC",
  },
} as const;
type Order = keyof typeof orders;
type Result = {
  key: string;
  data: PaginatedResponse<Store> | null;
  error: boolean;
};

export default function StoreExplorer({
  user,
  adminUrl,
}: {
  user: CurrentUser;
  adminUrl?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState({
    nombre: "",
    order: "nombre-ASC" as Order,
    page: 0,
  });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({
    key: "",
    data: null,
    error: false,
  });
  const params = new URLSearchParams({
    page: String(query.page),
    size: "6",
    nombre: query.nombre,
    sortBy: orders[query.order].sortBy,
    sortDirection: orders[query.order].sortDirection,
  }).toString();
  const key = `${params}:${attempt}`;
  const current = result.key === key;
  const data = current ? result.data : null;
  const error = current && result.error;
  const loading = !current;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/stores?${params}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (response.status === 401) {
          if (!controller.signal.aborted)
            router.replace("/login?sesion=vencida");
          return;
        }
        if (!response.ok) throw new Error("Tiendas no disponibles");
        const page: unknown = await response.json();
        if (!isStorePage(page)) throw new Error("Respuesta no disponible");
        if (!controller.signal.aborted)
          setResult({ key, data: page, error: false });
      } catch {
        if (!controller.signal.aborted)
          setResult({ key, data: null, error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [params, key, router]);

  function clear() {
    setDraft("");
    setQuery({ nombre: "", order: "nombre-ASC", page: 0 });
  }

  return (
    <div className={styles.market}>
      <a className={styles.skipLink} href="#emprendimientos">
        Saltar a los emprendimientos
      </a>
      <MarketplaceHeader user={user} adminUrl={adminUrl} exploring />

      <main className={styles.main}>
        <section className={styles.introduction} aria-labelledby="market-title">
          <div>
            <p className={styles.eyebrow}>Descubre tu comunidad</p>
            <h1 id="market-title">Encuentra lo extraordinario de aquí.</h1>
            <p className={styles.subtitle}>
              Explora emprendimientos, conoce sus creaciones y compra local.
            </p>
          </div>
          <aside className={styles.region} aria-label="Nuestra región">
            <svg
              className={styles.regionIcon}
              width="26"
              height="28"
              viewBox="0 0 26 28"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M23 11c0 7-10 15-10 15S3 18 3 11a10 10 0 1 1 20 0Z" />
              <circle cx="13" cy="11" r="3.5" />
            </svg>
            <h2>Nuestra tierra, nuestro mercado.</h2>
            <p>Región Chorotega · Costa Rica</p>
          </aside>
        </section>

        <div className={styles.toolbar}>
          <form
            className={styles.search}
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery((previous) => ({
                ...previous,
                nombre: draft.trim(),
                page: 0,
              }));
            }}
          >
            <label htmlFor="store-name" className={styles.srOnly}>
              Buscar emprendimientos por nombre
            </label>
            <input
              id="store-name"
              name="nombre"
              type="search"
              maxLength={150}
              placeholder="Buscar emprendimientos…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit">Buscar</button>
          </form>
          <div className={styles.sort}>
            <label htmlFor="store-sort">Ordenar por</label>
            <select
              id="store-sort"
              value={query.order}
              onChange={(event) =>
                setQuery((previous) => ({
                  ...previous,
                  order: event.target.value as Order,
                  page: 0,
                }))
              }
            >
              {Object.entries(orders).map(([value, order]) => (
                <option key={value} value={value}>
                  {order.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.layout}>
          <aside className={styles.filters} aria-labelledby="filters-title">
            <h2 id="filters-title">Filtros</h2>
            <p className={styles.filterLabel}>Disponibilidad</p>
            <p className={styles.badge}>Tiendas activas</p>
            <p className={styles.filterLabel}>Nombre del negocio</p>
            <p className={styles.filterValue}>
              {query.nombre || "Todos los nombres"}
            </p>
            <p className={styles.filterHelp}>
              Usá el buscador para encontrar un emprendimiento por su nombre.
            </p>
            <button type="button" onClick={clear}>
              Limpiar filtros
            </button>
          </aside>

          <section
            id="emprendimientos"
            className={styles.results}
            aria-label="Emprendimientos"
            aria-busy={loading}
          >
            <div className={styles.resultsHeading} aria-live="polite">
              <p>
                {data
                  ? `${data.totalElements} ${data.totalElements === 1 ? "emprendimiento" : "emprendimientos"}`
                  : loading
                    ? "Buscando emprendimientos…"
                    : "Emprendimientos"}
              </p>
              <span>Negocios activos de nuestra comunidad</span>
            </div>
            {loading ? (
              <div className={styles.notice} role="status">
                Cargando emprendimientos…
              </div>
            ) : null}
            {error ? (
              <div className={styles.notice} role="alert">
                <h2>No pudimos cargar los emprendimientos</h2>
                <p>Intentá nuevamente. Tu sesión no se cerró.</p>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Reintentar
                </button>
              </div>
            ) : null}
            {data?.content.length === 0 ? (
              <div className={styles.notice} role="status">
                <h2>No encontramos emprendimientos</h2>
                <p>
                  {data.totalElements > 0
                    ? "No hay resultados en esta página. Volvé a la primera página."
                    : "Probá con otro nombre o limpiá los filtros."}
                </p>
                <button
                  type="button"
                  onClick={
                    data.totalElements > 0
                      ? () => setQuery((previous) => ({ ...previous, page: 0 }))
                      : clear
                  }
                >
                  {data.totalElements > 0
                    ? "Primera página"
                    : "Limpiar filtros"}
                </button>
              </div>
            ) : null}
            {data && data.content.length > 0 ? (
              <>
                <div className={styles.grid}>
                  {data.content.map((store) => (
                    <article
                      key={store.idTienda}
                      className={styles.card}
                      data-store-id={store.idTienda}
                    >
                      <div
                        className={styles.noPhoto}
                        aria-label={`${store.nombre}: sin fotografía`}
                      >
                        <Image
                          src="/landing/store.svg"
                          width={32}
                          height={32}
                          alt=""
                        />
                        <span>Sin fotografía</span>
                      </div>
                      <div className={styles.cardBody}>
                        <span className={styles.badge}>Tienda activa</span>
                        <h2>{store.nombre}</h2>
                        <p className={styles.description}>
                          {store.descripcion ||
                            "Este emprendimiento todavía no agregó una descripción."}
                        </p>
                        <p className={styles.address}>{store.direccion}</p>
                        <Link
                          href={`/tiendas/${store.idTienda}`}
                          prefetch={false}
                          className={styles.purchase}
                        >
                          Ver tienda <span aria-hidden="true">→</span>
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
            {data && data.totalPages > 0 ? (
              <nav
                className={styles.pagination}
                aria-label="Páginas de emprendimientos"
              >
                <button
                  type="button"
                  disabled={query.page === 0}
                  onClick={() =>
                    setQuery((previous) => ({
                      ...previous,
                      page: previous.page - 1,
                    }))
                  }
                >
                  Anterior
                </button>
                <p aria-live="polite">
                  Página {data.page + 1} de {data.totalPages}
                </p>
                <button
                  type="button"
                  disabled={query.page >= data.totalPages - 1}
                  onClick={() =>
                    setQuery((previous) => ({
                      ...previous,
                      page: previous.page + 1,
                    }))
                  }
                >
                  Siguiente
                </button>
              </nav>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
