"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useBusinessData } from "@/hooks/use-business-data";
import {
  orderLabels,
  orderDate,
  type OrderDetailData,
} from "@/lib/managed-orders";
import { productPrice } from "@/lib/store-detail";
import styles from "./business.module.css";
import orderStyles from "./orders.module.css";

function OrderPreparation({
  initial,
  root,
  api,
}: {
  initial: OrderDetailData;
  root: string;
  api: string;
}) {
  const [data, setData] = useState(initial),
    [phase, setPhase] = useState<"idle" | "confirm" | "sending" | "review">(
      "idle",
    );
  const [message, setMessage] = useState(""),
    [reading, setReading] = useState(false),
    [checked, setChecked] = useState(false);
  const sending = useRef(false),
    readingRef = useRef(false);
  const { order, store } = data;
  async function prepare() {
    if (sending.current || phase !== "confirm") return;
    sending.current = true;
    setPhase("sending");
    setMessage("");
    setChecked(false);
    try {
      const response = await fetch(`${api}/preparar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.replace("/login?sesion=vencida");
        return;
      }
      if (!response.ok) {
        setPhase("review");
        setMessage(
          response.status === 409
            ? "El pedido cambió o ya no permite comenzar preparación. Consultá el estado vigente; no repetiremos la operación automáticamente."
            : response.status >= 500
              ? "No pudimos confirmar si comenzó la preparación. El estado mostrado es el último confirmado. Consultá el estado vigente antes de volver a intentar."
              : response.status === 404
                ? "El pedido ya no está disponible entre tus negocios. Consultá nuevamente antes de continuar."
                : response.status === 403
                  ? "No tenés autorización para preparar este pedido."
                  : "La solicitud fue rechazada. Consultá el estado vigente antes de continuar.",
        );
        return;
      }
      const next = (await response.json()) as OrderDetailData;
      setData(next);
      setPhase("idle");
      setMessage("Preparación confirmada por el servidor.");
    } catch {
      setPhase("review");
      setMessage(
        "Se perdió la conexión y no pudimos confirmar si comenzó la preparación. No se reenviará la solicitud. Consultá el estado vigente antes de continuar.",
      );
    } finally {
      sending.current = false;
    }
  }
  async function readCurrent() {
    if (readingRef.current || sending.current) return;
    readingRef.current = true;
    setReading(true);
    setChecked(false);
    try {
      const response = await fetch(api, { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/login?sesion=vencida");
        return;
      }
      if (!response.ok) throw new Error("read_failed");
      const next = (await response.json()) as OrderDetailData;
      setData(next);
      setChecked(true);
      setMessage(
        `Estado confirmado por el servidor: ${orderLabels[next.order.estado]}.`,
      );
      if (next.order.estado !== "CONFIRMADO") setPhase("idle");
    } catch {
      setMessage(
        "No pudimos consultar el estado vigente. No conocemos el resultado de la operación anterior; no se ha reenviado.",
      );
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }
  return (
    <article className={styles.panel} data-order-detail={order.idPedido}>
      <p>Tienda: {store.nombre}</p>
      <h2>Pedido #{order.idPedido}</h2>
      <p data-order-state={order.estado}>
        <span className={styles.badge}>
          {phase === "review" ? "Último estado confirmado: " : ""}
          {orderLabels[order.estado]}
        </span>
      </p>
      <time dateTime={order.fechaCreacion}>
        {orderDate(order.fechaCreacion)}
      </time>
      <h3>Productos del pedido</h3>
      <p className={styles.help}>
        Los importes corresponden al momento de la compra. Se identifican los
        productos por su ID, sin atribuirles nombres actuales.
      </p>
      {order.items.length ? (
        <ol className={orderStyles.items}>
          {order.items.map((d) => (
            <li key={d.idDetalle} data-order-item={d.idDetalle}>
              <h4>Producto #{d.idProducto}</h4>
              <dl className={styles.details}>
                <div>
                  <dt>Cantidad</dt>
                  <dd>{d.cantidad}</dd>
                </div>
                <div>
                  <dt>Precio unitario histórico</dt>
                  <dd>{productPrice(d.precioUnitario)}</dd>
                </div>
                <div>
                  <dt>Subtotal del detalle</dt>
                  <dd>{productPrice(d.subtotal)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <p>Sin detalles registrados.</p>
      )}
      <dl className={styles.details}>
        <div>
          <dt>Subtotal del pedido</dt>
          <dd>{productPrice(order.subtotal)}</dd>
        </div>
        <div>
          <dt>Tarifa de envío</dt>
          <dd>{productPrice(order.tarifaEnvio)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{productPrice(order.total)}</dd>
        </div>
        <div>
          <dt>Dirección de entrega</dt>
          <dd>{order.direccionEntrega}</dd>
        </div>
      </dl>
      {message ? (
        <p
          role="status"
          className={phase === "review" ? styles.error : styles.success}
        >
          {message}
        </p>
      ) : null}
      {order.estado === "CONFIRMADO" && phase === "idle" ? (
        <button
          className={styles.button}
          onClick={() => {
            setPhase("confirm");
            setMessage("");
          }}
        >
          Comenzar preparación
        </button>
      ) : null}
      {phase === "confirm" ? (
        <section
          className={orderStyles.confirm}
          aria-label="Confirmar preparación"
        >
          <h3>¿Comenzar preparación del pedido #{order.idPedido}?</h3>
          <p>
            Confirmá que vas a comenzar a preparar los productos. Esta acción
            cambia el estado del pedido.
          </p>
          <div className={styles.actions}>
            <button className={styles.button} onClick={() => void prepare()}>
              Confirmar preparación
            </button>
            <button
              className={styles.secondary}
              onClick={() => setPhase("idle")}
            >
              Volver sin preparar
            </button>
          </div>
        </section>
      ) : null}
      {phase === "sending" ? (
        <button className={styles.button} disabled>
          Comenzando preparación…
        </button>
      ) : null}
      {phase === "review" ? (
        <section
          className={orderStyles.confirm}
          aria-label="Revisar resultado de preparación"
        >
          <h3>Comprobá el resultado antes de continuar</h3>
          <p>No se enviará otro PATCH automáticamente.</p>
          <button
            className={styles.button}
            disabled={reading}
            onClick={() => void readCurrent()}
          >
            {reading ? "Consultando…" : "Consultar estado vigente"}
          </button>
          {checked && order.estado === "CONFIRMADO" ? (
            <button
              className={styles.secondary}
              onClick={() => {
                setPhase("idle");
                setChecked(false);
                setMessage(
                  "Estado consultado. Una nueva preparación requiere tu confirmación.",
                );
              }}
            >
              Estado consultado; habilitar nueva confirmación
            </button>
          ) : null}
        </section>
      ) : null}
      <div className={styles.actions}>
        <Link className={styles.secondary} href={root}>
          Volver a pedidos de la tienda
        </Link>
      </div>
    </article>
  );
}
export default function OrderDetail({
  storeId,
  orderId,
}: {
  storeId: string;
  orderId: string;
}) {
  const root = `/mi-negocio/tiendas/${encodeURIComponent(storeId)}/pedidos`,
    api = `/api${root}/${encodeURIComponent(orderId)}`;
  const result = useBusinessData<OrderDetailData>(api);
  if (result.loading)
    return (
      <p className={styles.panel} role="status">
        Cargando pedido…
      </p>
    );
  if (result.status !== 200 || !result.data)
    return (
      <section
        className={styles.panel}
        role="alert"
        data-order-detail-error={result.status}
      >
        <h2>No pudimos consultar el pedido</h2>
        <p>
          El pedido o la tienda puede no estar disponible entre tus negocios.
        </p>
        <button className={styles.button} onClick={result.retry}>
          Reintentar
        </button>
        <Link className={styles.secondary} href={root}>
          Volver a pedidos
        </Link>
      </section>
    );
  return (
    <OrderPreparation key={api} initial={result.data} root={root} api={api} />
  );
}
