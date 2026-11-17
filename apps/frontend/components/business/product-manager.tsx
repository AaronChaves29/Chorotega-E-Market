"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useBusinessData } from "@/hooks/use-business-data";
import { productPrice } from "@/lib/store-detail";
import type { ManagedProduct, ManagedCategory } from "@/lib/managed-products";
import type { Store, PaginatedResponse } from "@/types/catalog";
import styles from "./business.module.css";
import productStyles from "./products.module.css";

export default function ProductManager({ storeId }: { storeId: string }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState({ page: 0, nombre: "" });
  const path = `/mi-negocio/tiendas/${encodeURIComponent(storeId)}/productos`;
  const params = new URLSearchParams({
    page: String(query.page),
    size: "6",
    nombre: query.nombre,
  });
  const result = useBusinessData<
    PaginatedResponse<ManagedProduct> & { store: Store }
  >(`/api${path}?${params}`);
  const categories = useBusinessData<{ categories: ManagedCategory[] }>(
    "/api/mi-negocio/categorias",
  );
  const names = new Map(
    categories.data?.categories.map((c) => [c.idCategoria, c.nombre]),
  );
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery({ page: 0, nombre: draft.trim() });
  }
  return (
    <section
      aria-labelledby="my-products-title"
      aria-busy={result.loading || categories.loading}
    >
      <div className={styles.actions}>
        <Link href="/mi-negocio/tiendas" className={styles.secondary}>
          Volver a Mis tiendas
        </Link>
        <Link className={styles.button} href={`${path}/nuevo`} prefetch={false}>
          Agregar producto
        </Link>
      </div>
      <h2 id="my-products-title">
        Productos de {result.data?.store.nombre ?? "tu tienda"}
      </h2>
      <p className={styles.help}>
        Incluye ACTIVO, INACTIVO y AGOTADO. Cambiar existencias no cambia
        automáticamente el estado.
      </p>
      <form className={productStyles.search} role="search" onSubmit={search}>
        <div className={styles.field}>
          <label htmlFor="business-product-search">
            Buscar productos por nombre
          </label>
          <input
            id="business-product-search"
            maxLength={150}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <button className={styles.button} type="submit">
          Buscar
        </button>
        <button
          className={styles.secondary}
          type="button"
          onClick={() => {
            setDraft("");
            setQuery({ page: 0, nombre: "" });
          }}
        >
          Limpiar
        </button>
      </form>
      {result.loading || categories.loading ? (
        <p className={styles.panel} role="status">
          Cargando productos y categorías…
        </p>
      ) : result.status !== 200 || categories.status !== 200 || !result.data ? (
        <section
          className={styles.panel}
          role="alert"
          data-products-error={
            result.status !== 200 ? result.status : categories.status
          }
        >
          <h3>
            {result.status === 404
              ? "Tienda no disponible entre tus negocios"
              : "No pudimos consultar el catálogo de gestión"}
          </h3>
          <p>Intentá nuevamente. No se modificaron tus productos.</p>
          <button
            className={styles.button}
            onClick={() => {
              result.retry();
              categories.retry();
            }}
          >
            Reintentar
          </button>
        </section>
      ) : (
        <>
          <p role="status">
            {result.data.totalElements} productos · Página {query.page + 1} de{" "}
            {Math.max(1, result.data.totalPages)}
          </p>
          {result.data.content.length ? (
            <div className={styles.stores}>
              {result.data.content.map((p) => (
                <article
                  className={styles.panel}
                  key={p.idProducto}
                  data-managed-product={p.idProducto}
                >
                  <span className={styles.badge}>{p.estado}</span>
                  <h3>{p.nombre}</h3>
                  <p>
                    {names.get(p.idCategoria) ??
                      `Categoría #${p.idCategoria} (no disponible)`}
                  </p>
                  <p className={styles.description}>
                    {p.descripcion || "Sin descripción registrada."}
                  </p>
                  <dl className={styles.details}>
                    <div>
                      <dt>Precio</dt>
                      <dd>{productPrice(p.precio)}</dd>
                    </div>
                    <div>
                      <dt>Existencias</dt>
                      <dd>{p.cantidadDisponible}</dd>
                    </div>
                  </dl>
                  <Link
                    className={styles.button}
                    href={`${path}/${p.idProducto}/editar`}
                    prefetch={false}
                  >
                    Editar
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.panel}>
              <h3>No hay productos para mostrar</h3>
              <p>
                {query.nombre
                  ? "Probá otro nombre o limpiá la búsqueda."
                  : "Podés registrar el primer producto de esta tienda."}
              </p>
            </div>
          )}
          <nav
            className={styles.pagination}
            aria-label="Páginas de mis productos"
          >
            <button
              className={styles.secondary}
              disabled={!query.page}
              onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
            >
              Anterior
            </button>
            <button
              className={styles.secondary}
              disabled={query.page + 1 >= result.data.totalPages}
              onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
