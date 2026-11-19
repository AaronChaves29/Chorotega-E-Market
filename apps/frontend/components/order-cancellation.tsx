"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { projectManagedOrder } from "@/lib/managed-orders";
import type { OrderState } from "@/types/orders";

export default function OrderCancellation({
  id,
  state,
  onChanged,
}: {
  id: number;
  state: OrderState;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "confirm" | "sending" | "review">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [reading, setReading] = useState(false);
  const busy = useRef(false);
  const eligible = state === "CONFIRMADO" || state === "PENDIENTE";
  async function cancel() {
    if (busy.current || phase !== "confirm") return;
    busy.current = true;
    setPhase("sending");
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/login?sesion=vencida");
        return;
      }
      if (!response.ok) {
        setPhase("review");
        setMessage(
          response.status === 409
            ? "El pedido cambió o ya no permite cancelación. Consultá su estado vigente."
            : response.status === 403
              ? "No tenés autorización para cancelar este pedido. Consultá tu sesión."
              : response.status === 404
                ? "No encontramos este pedido entre tus compras. Consultá nuevamente."
                : "No pudimos confirmar la cancelación. No se reenviará automáticamente. Consultá el estado real del pedido.",
        );
        return;
      }
      if (response.status !== 200) throw new Error("review");
      const body: unknown = await response.json();
      const order =
        body && typeof body === "object" && "order" in body
          ? projectManagedOrder(body.order)
          : null;
      if (!order || order.idPedido !== id || order.estado !== "CANCELADO")
        throw new Error("review");
      setMessage("Cancelación confirmada por el servidor.");
      setPhase("idle");
      onChanged();
    } catch {
      setPhase("review");
      setMessage(
        "No pudimos confirmar la cancelación. No se reenviará automáticamente. Consultá el estado real del pedido antes de continuar.",
      );
    } finally {
      busy.current = false;
    }
  }
  async function read() {
    if (busy.current) return;
    busy.current = true;
    setReading(true);
    try {
      const response = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login?sesion=vencida");
        return;
      }
      if (response.status !== 200) throw new Error("read");
      const body: unknown = await response.json();
      const order =
        body && typeof body === "object" && "order" in body
          ? projectManagedOrder(body.order)
          : null;
      if (!order || order.idPedido !== id) throw new Error("read");
      setMessage(
        `Estado consultado: ${order.estado}. No se ha reenviado la cancelación.`,
      );
      setPhase("idle");
      onChanged();
    } catch {
      setMessage(
        "No pudimos consultar el estado. Conservá la precaución y volvé a consultar; no se reenviará la cancelación.",
      );
    } finally {
      busy.current = false;
      setReading(false);
    }
  }
  return (
    <div data-order-cancellation={id}>
      {message ? <p role="status">{message}</p> : null}
      {phase === "review" ? (
        <button
          type="button"
          className="orders-secondary-button"
          disabled={reading}
          onClick={() => void read()}
        >
          {reading ? "Consultando…" : "Consultar estado del pedido"}
        </button>
      ) : phase === "sending" ? (
        <p role="status">Cancelando pedido…</p>
      ) : phase === "confirm" ? (
        <section aria-label={`Confirmar cancelación del pedido ${id}`}>
          <p>
            ¿Querés cancelar este pedido? El servidor comprobará que todavía sea
            elegible y restaurará las existencias descontadas cuando
            corresponda.
          </p>
          <button
            type="button"
            className="orders-secondary-button"
            onClick={() => void cancel()}
          >
            Confirmar cancelación
          </button>{" "}
          <button
            type="button"
            className="orders-secondary-button"
            onClick={() => setPhase("idle")}
          >
            Volver
          </button>
        </section>
      ) : eligible ? (
        <button
          type="button"
          className="orders-secondary-button"
          onClick={() => {
            setMessage("");
            setPhase("confirm");
          }}
        >
          Cancelar pedido
        </button>
      ) : null}
    </div>
  );
}
