"use client";
import { useState } from "react";
import Link from "next/link";
import { useBusinessData } from "@/hooks/use-business-data";
import {
  orderStates,
  orderLabels,
  orderDate,
  type ManagedOrderSummary,
  type OrderStore,
} from "@/lib/managed-orders";
import type { PaginatedResponse } from "@/types/catalog";
import type { OrderState } from "@/types/orders";
import { productPrice } from "@/lib/store-detail";
import styles from "./business.module.css";
export default function OrderManager({ storeId }: { storeId: string }) {
  const [query, setQuery] = useState({ page: 0, estado: "" });
  const root = `/mi-negocio/tiendas/${encodeURIComponent(storeId)}/pedidos`;
  const params = new URLSearchParams({
    page: String(query.page),
    size: "6",
    estado: query.estado,
  });
  const result = useBusinessData<
    PaginatedResponse<ManagedOrderSummary> & { store: OrderStore }
  >(`/api${root}?${params}`);
  return (
    <section aria-labelledby="my-business-orders" aria-busy={result.loading}>
      <Link className={styles.secondary} href="/mi-negocio/tiendas">
        Volver a Mis tiendas
      </Link>
      <h2 id="my-business-orders">
        Pedidos de {result.data?.store.nombre ?? "tu tienda"}
      </h2>
      <p>
        Consultá los pedidos recibidos y su estado. Solo los confirmados
        permiten comenzar preparación.
      </p>
      <div className={styles.field}>
        <label htmlFor="business-order-state">Filtrar por estado</label>
        <select
          id="business-order-state"
          value={query.estado}
          onChange={(e) => setQuery({ page: 0, estado: e.target.value })}
        >
          <option value="">Todos los estados</option>
          {orderStates.map((s) => (
            <option key={s} value={s}>
              {orderLabels[s]}
            </option>
          ))}
        </select>
      </div>
      {result.loading ? (
        <p className={styles.panel} role="status">
          Cargando pedidos…
        </p>
      ) : result.status !== 200 || !result.data ? (
        <section
          className={styles.panel}
          role="alert"
          data-orders-error={result.status}
        >
          <h3>
            {result.status === 404
              ? "Tienda no disponible entre tus negocios"
              : "No pudimos consultar los pedidos"}
          </h3>
          <p>Intentá nuevamente. No se modificó ningún pedido.</p>
          <button className={styles.button} onClick={result.retry}>
            Reintentar
          </button>
        </section>
      ) : (
        <>
          <p role="status">
            {result.data.totalElements} pedidos · Página {query.page + 1} de{" "}
            {Math.max(1, result.data.totalPages)}
          </p>
          {result.data.content.length ? (
            <div className={styles.stores}>
              {result.data.content.map((o) => (
                <article
                  className={styles.panel}
                  key={o.idPedido}
                  data-managed-order={o.idPedido}
                >
                  <span className={styles.badge}>
                    {orderLabels[o.estado as OrderState]}
                  </span>
                  <h3>Pedido #{o.idPedido}</h3>
                  <time dateTime={o.fechaCreacion}>
                    {orderDate(o.fechaCreacion)}
                  </time>
                  <dl className={styles.details}>
                    <div>
                      <dt>Cantidad</dt>
                      <dd>
                        {o.unidades} unidades · {o.lineas} líneas
                      </dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>{productPrice(o.total)}</dd>
                    </div>
                  </dl>
                  <Link
                    className={styles.button}
                    prefetch={false}
                    href={`${root}/${o.idPedido}`}
                  >
                    Ver detalle
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <section className={styles.panel}>
              <h3>No hay pedidos para mostrar</h3>
              <p>
                {query.estado
                  ? "Probá otro estado o seleccioná todos los estados."
                  : "Los pedidos recibidos aparecerán aquí."}
              </p>
            </section>
          )}
          <nav
            className={styles.pagination}
            aria-label="Páginas de pedidos recibidos"
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
