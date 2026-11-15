"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  isStoreProductPage,
  productPrice,
  type StoreDetail,
  type StoreProduct,
} from "@/lib/store-detail";
import type { PaginatedResponse } from "@/types/catalog";
import styles from "./store-detail.module.css";

const orders = {
  "nombre-ASC": { label: "Nombre: A–Z", column: "nombre", direction: "ASC" },
  "nombre-DESC": { label: "Nombre: Z–A", column: "nombre", direction: "DESC" },
  "precio-ASC": {
    label: "Precio: menor a mayor",
    column: "precio",
    direction: "ASC",
  },
  "precio-DESC": {
    label: "Precio: mayor a menor",
    column: "precio",
    direction: "DESC",
  },
  "idProducto-DESC": {
    label: "Identificador: mayor a menor",
    column: "idProducto",
    direction: "DESC",
  },
  "idProducto-ASC": {
    label: "Identificador: menor a mayor",
    column: "idProducto",
    direction: "ASC",
  },
} as const;
type Order = keyof typeof orders;

export default function StoreProducts({
  store,
  canBuy,
  onUnavailable,
}: {
  store: StoreDetail;
  canBuy: boolean;
  onUnavailable: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState({
    order: "nombre-ASC" as Order,
    page: 0,
    available: false,
  });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    status: number;
    data?: PaginatedResponse<StoreProduct>;
  }>({ key: "", status: 0 });
  const params = new URLSearchParams({
    page: String(query.page),
    size: "6",
    sortBy: orders[query.order].column,
    sortDirection: orders[query.order].direction,
    soloDisponibles: String(query.available),
  }).toString();
  const key = `${params}:${attempt}`;
  const status = result.key === key ? result.status : 0;
  const data = status === 200 ? result.data : undefined;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/stores/${store.idTienda}/products?${params}`,
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(12000),
            ]),
          },
        );
        if (response.status === 401) {
          if (!controller.signal.aborted)
            router.replace("/login?sesion=vencida");
          return;
        }
        if (!response.ok) {
          if (response.status === 404 && !controller.signal.aborted) {
            onUnavailable();
            return;
          }
          if (!controller.signal.aborted)
            setResult({ key, status: response.status });
          return;
        }
        const page: unknown = await response.json();
        if (!isStoreProductPage(page, store.idTienda))
          throw new Error("Productos no disponibles");
        if (!controller.signal.aborted)
          setResult({ key, status: 200, data: page });
      } catch {
        if (!controller.signal.aborted) setResult({ key, status: 502 });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, params, store.idTienda, router, onUnavailable]);

  return (
    <section
      id="shop-products"
      className={styles.products}
      aria-labelledby="products-title"
      aria-busy={status === 0}
    >
      <div className={styles.toolbar}>
        <div className={styles.productsHeading}>
          <h2 id="products-title">Productos de esta tienda</h2>
          <p aria-live="polite">
            {data
              ? `${data.totalElements} ${data.totalElements === 1 ? "producto" : "productos"}`
              : status === 0
                ? "Consultando productos…"
                : "Productos"}
          </p>
        </div>
        <label className={styles.stockFilter}>
          <input
            id="available-products"
            type="checkbox"
            checked={query.available}
            onChange={(event) =>
              setQuery((previous) => ({
                ...previous,
                available: event.target.checked,
                page: 0,
              }))
            }
          />
          Solo con existencias
        </label>
        <div className={styles.sort}>
          <label htmlFor="product-sort">Ordenar por</label>
          <select
            id="product-sort"
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
      {canBuy ? (
        <p className={styles.flowNote}>
          Para comprar, continuá al formulario de pedido y elegí esta tienda y
          sus productos. No se agregan automáticamente.
        </p>
      ) : null}
      {status === 0 ? (
        <div className={styles.notice} role="status">
          Cargando productos…
        </div>
      ) : null}
      {status !== 0 && status !== 200 ? (
        <div className={styles.notice} role="alert">
          <h3>
            {status === 404
              ? "La tienda ya no está disponible"
              : "No pudimos cargar los productos"}
          </h3>
          <p>Volvé al mercado o intentá nuevamente.</p>
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
          <h3>No hay productos para mostrar</h3>
          <p>
            {query.available
              ? "No hay productos activos con existencias para este filtro."
              : "Esta tienda no tiene productos activos en esta página."}
          </p>
          {query.page > 0 ? (
            <button
              type="button"
              onClick={() => setQuery((previous) => ({ ...previous, page: 0 }))}
            >
              Primera página
            </button>
          ) : null}
        </div>
      ) : null}
      {data && data.content.length > 0 ? (
        <div className={styles.grid}>
          {data.content.map((product) => (
            <article
              className={styles.productCard}
              key={product.idProducto}
              data-product-id={product.idProducto}
            >
              <div className={styles.productPhoto}>
                <Image
                  src="/landing/package.svg"
                  width={26}
                  height={26}
                  alt=""
                />
                <span>Sin fotografía del producto</span>
              </div>
              <div className={styles.productBody}>
                <p className={styles.businessName}>{store.nombre}</p>
                <h3>{product.nombre}</h3>
                <p className={styles.productDescription}>
                  {product.descripcion || "Sin descripción del producto."}
                </p>
                <p className={styles.price}>{productPrice(product.precio)}</p>
                <p
                  className={
                    product.cantidadDisponible > 0
                      ? styles.available
                      : styles.soldOut
                  }
                >
                  {product.cantidadDisponible > 0
                    ? `Disponibles: ${product.cantidadDisponible}`
                    : "Sin existencias"}
                </p>
                {canBuy && product.cantidadDisponible > 0 ? (
                  <Link
                    className={styles.buy}
                    href="/pedidos/nuevo"
                    prefetch={false}
                  >
                    Continuar al pedido <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {data && data.totalPages > 0 ? (
        <>
          <p className={styles.pageSummary}>
            Mostrando {data.content.length ? data.page * data.size + 1 : 0}–
            {data.content.length
              ? data.page * data.size + data.content.length
              : 0}{" "}
            de {data.totalElements} productos de {store.nombre}.
          </p>
          <nav className={styles.pagination} aria-label="Páginas de productos">
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
            <p>
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
        </>
      ) : null}
    </section>
  );
}
