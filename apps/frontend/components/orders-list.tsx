
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
  PENDIENTE: "bg-yellow-100 text-yellow-800",
  CONFIRMADO: "bg-blue-100 text-blue-800",
  PREPARANDO: "bg-orange-100 text-orange-800",
  EN_CAMINO: "bg-purple-100 text-purple-800",
  ENTREGADO: "bg-green-100 text-green-800",
  CANCELADO: "bg-red-100 text-red-800",
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
      <div role="status" className="mt-8 rounded-lg border p-6 text-gray-600">
        Cargando pedidos...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mt-8 rounded-lg border border-red-200 p-6">
        <p className="text-red-700">{error}</p>

        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(null);
            setRetryCount((value) => value + 1);
          }}
          className="mt-4 rounded bg-gray-900 px-4 py-2 text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data || data.content.length === 0) {
    return (
      <div className="mt-8 rounded-lg border p-8 text-center">
        <h2 className="text-xl font-semibold">
          {page === 0 ? "Todavía no tenés pedidos" : "No hay pedidos en esta página"}
        </h2>
        <p className="mt-2 text-gray-600">
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
            className="mt-4 rounded border px-4 py-2"
          >
            Página anterior
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="mt-8 space-y-5">
      <p className="text-sm text-gray-600">
        {data.totalElements} pedido(s) encontrado(s)
      </p>

      <div className="space-y-4">
        {data.content.map((order: Order) => (
          <article
            key={order.idPedido}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                Pedido #{order.idPedido}
              </h2>

              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${STATE_STYLES[order.estado]
                  }`}
              >
                {STATE_LABELS[order.estado]}
              </span>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Fecha</dt>
                <dd className="font-medium">
                  {formatDate(order.fechaCreacion)}
                </dd>
              </div>

              <div>
                <dt className="text-gray-500">Total</dt>
                <dd className="font-semibold">
                  {formatMoney(order.total)}
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-gray-500">Dirección de entrega</dt>
                <dd className="font-medium">
                  {order.direccionEntrega}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <nav
        aria-label="Paginación de pedidos"
        className="flex flex-wrap items-center justify-between gap-4 pt-4"
      >
        <button
          type="button"
          disabled={page === 0}
          onClick={() => {
            setLoading(true);
            setPage((value) => Math.max(0, value - 1));
          }}
          className="rounded border px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>

        <span className="text-sm text-gray-600">
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
          className="rounded border px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente
        </button>
      </nav>
    </section>
  );
}
