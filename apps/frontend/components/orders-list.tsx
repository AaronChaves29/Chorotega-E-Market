
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderState, PaginatedOrders } from "@/types/orders";

const PAGE_SIZE = 10;

const STATE_LABELS: Record<OrderState, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADO: "Confirmado",
  PREPARANDO: "Preparando",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

const STATE_STYLES: Record<OrderState, string> = {
  PENDIENTE: "orders-status-pending",
  CONFIRMADO: "orders-status-confirmed",
  PREPARANDO: "orders-status-preparing",
  EN_CAMINO: "orders-status-on-the-way",
  ENTREGADO: "orders-status-delivered",
  CANCELADO: "orders-status-cancelled",
};

function formatMoney(value: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function OrdersList() {
  const router = useRouter();

  const [page, setPage] = useState(0);
  const [data, setData] = useState<PaginatedOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);


  useEffect(() => {
    const controller = new AbortController();

    async function fetchOrders() {
      try {
        const response = await fetch(`/api/orders?page=${page}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("No fue posible cargar los pedidos.");
        }

        const result = (await response.json()) as PaginatedOrders;

        if (!controller.signal.aborted) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setData(null);
        setError(
          err instanceof Error
            ? err.message
            : "Ocurrió un error inesperado.",
        );
        setLoading(false);
      }
    }

    void fetchOrders();

    return () => controller.abort();
  }, [page, retryCount, router]);

  if (loading) {
    return (
      <div role="status" className="orders-message orders-loading">
        Cargando pedidos...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="orders-message orders-error">
        <p>{error}</p>

        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(null);
            setRetryCount((value) => value + 1);
          }}
          className="orders-secondary-button"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data || data.content.length === 0) {
    return (
      <div className="orders-message orders-empty">
        <h2>
          {page === 0 ? "Todavía no tenés pedidos" : "No hay pedidos en esta página"}
        </h2>
        <p>
          {page === 0
            ? "Cuando realicés tu primer pedido, aparecerá aquí."
            : "Podés regresar a la página anterior."}
        </p>

        {page > 0 && (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setPage((value) => Math.max(0, value - 1));
            }}
            className="orders-secondary-button"
          >
            Página anterior
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="orders-list">
      <p className="orders-count">
        {data.totalElements} pedido(s) encontrado(s)
      </p>

      <div className="orders-cards">
        {data.content.map((order: Order) => (
          <article key={order.idPedido} className="order-card">
            <div className="order-card-header">
              <h2>
                Pedido #{order.idPedido}
              </h2>

              <span
                className={`orders-status ${STATE_STYLES[order.estado]}`}
              >
                {STATE_LABELS[order.estado]}
              </span>
            </div>

            <dl className="order-details">
              <div className="order-detail">
                <dt>Fecha</dt>
                <dd>
                  {formatDate(order.fechaCreacion)}
                </dd>
              </div>

              <div className="order-detail">
                <dt>Total</dt>
                <dd className="order-total">
                  {formatMoney(order.total)}
                </dd>
              </div>

              <div className="order-detail order-detail-address">
                <dt>Dirección de entrega</dt>
                <dd>
                  {order.direccionEntrega}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <nav
        aria-label="Paginación de pedidos"
        className="orders-pagination"
      >
        <button
          type="button"
          disabled={page === 0}
          onClick={() => {
            setLoading(true);
            setPage((value) => Math.max(0, value - 1));
          }}
          className="orders-page-button"
        >
          Anterior
        </button>

        <span className="orders-page-number">
          Página {data.page + 1} de {data.totalPages}
          {" · "} {PAGE_SIZE} por página
        </span>

        <button
          type="button"
          disabled={page + 1 >= data.totalPages}
          onClick={() => {
            setLoading(true);
            setPage((value) => value + 1);
          }}
          className="orders-page-button"
        >
          Siguiente
        </button>
      </nav>
    </section>
  );
}
