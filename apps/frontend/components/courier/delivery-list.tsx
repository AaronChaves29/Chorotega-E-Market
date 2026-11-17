"use client";
import { useState } from "react";
import Link from "next/link";
import { useBusinessData } from "@/hooks/use-business-data";
import {
  deliveryStates,
  deliveryLabels,
  deliveryDate,
  type CourierDelivery,
} from "@/lib/courier-deliveries";
import type { PaginatedResponse } from "@/types/catalog";
import styles from "@/components/business/business.module.css";

export default function DeliveryList() {
  const [query, setQuery] = useState({ page: 0, estado: "" });
  const params = new URLSearchParams({
    page: String(query.page),
    size: "6",
    estado: query.estado,
  });
  const result = useBusinessData<PaginatedResponse<CourierDelivery>>(
    `/api/mis-entregas?${params}`,
  );
  return (
    <section aria-labelledby="my-deliveries" aria-busy={result.loading}>
      <h2 id="my-deliveries">Entregas asignadas a tu cuenta</h2>
      <p>
        Solo aparecen tus entregas. Consultá el detalle antes de iniciar o
        completar una.
      </p>
      <div className={styles.field}>
        <label htmlFor="delivery-state">Filtrar por estado</label>
        <select
          id="delivery-state"
          value={query.estado}
          onChange={(e) => setQuery({ page: 0, estado: e.target.value })}
        >
          <option value="">Todos los estados</option>
          {deliveryStates.map((s) => (
            <option key={s} value={s}>
              {deliveryLabels[s]}
            </option>
          ))}
        </select>
      </div>
      {result.loading ? (
        <p className={styles.panel} role="status">
          Cargando entregas…
        </p>
      ) : result.status !== 200 || !result.data ? (
        <section
          className={styles.panel}
          role="alert"
          data-deliveries-error={result.status}
        >
          <h3>No pudimos consultar tus entregas</h3>
          <p>Intentá nuevamente. No se modificó ninguna entrega.</p>
          <button className={styles.button} onClick={result.retry}>
            Reintentar
          </button>
        </section>
      ) : (
        <>
          <p role="status">
            {result.data.totalElements} entregas · Página {query.page + 1} de{" "}
            {Math.max(1, result.data.totalPages)}
          </p>
          {result.data.content.length ? (
            <div className={styles.stores}>
              {result.data.content.map((d) => (
                <article
                  className={styles.panel}
                  key={d.idEntrega}
                  data-delivery={d.idEntrega}
                >
                  <span className={styles.badge}>
                    {deliveryLabels[d.estado]}
                  </span>
                  <h3>Entrega #{d.idEntrega}</h3>
                  <p>Pedido #{d.idPedido}</p>
                  <dl className={styles.details}>
                    <div>
                      <dt>Fecha de asignación</dt>
                      <dd>
                        <time dateTime={d.fechaAsignacion}>
                          {deliveryDate(d.fechaAsignacion)}
                        </time>
                      </dd>
                    </div>
                    {d.fechaEntrega ? (
                      <div>
                        <dt>Fecha de entrega</dt>
                        <dd>
                          <time dateTime={d.fechaEntrega}>
                            {deliveryDate(d.fechaEntrega)}
                          </time>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <Link
                    className={styles.button}
                    href={`/mis-entregas/${d.idEntrega}`}
                    prefetch={false}
                  >
                    Ver detalle
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <section className={styles.panel}>
              <h3>No hay entregas para mostrar</h3>
              <p>
                {query.estado
                  ? "Probá otro estado o seleccioná todos los estados."
                  : "Las entregas que te asignen aparecerán aquí."}
              </p>
            </section>
          )}
          <nav className={styles.pagination} aria-label="Páginas de entregas">
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
