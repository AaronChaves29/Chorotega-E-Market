"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBusinessData } from "@/hooks/use-business-data";
import {
  projectCourierDelivery,
  projectCourierDeliveryDestination,
  deliveryDate,
  deliveryLabels,
  type CourierDelivery,
  type CourierDeliveryDestination,
} from "@/lib/courier-deliveries";
import styles from "@/components/business/business.module.css";
import detailStyles from "@/components/business/orders.module.css";

function DeliveryDestination({ id }: { id: number }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    status: number;
    data: CourierDeliveryDestination | null;
  }>();
  const current = result?.attempt === attempt ? result : undefined;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/mis-entregas/${id}/destino`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!active) return;
        if (response.status === 401) {
          window.location.replace("/login?sesion=vencida");
          return;
        }
        const data = response.ok
          ? projectCourierDeliveryDestination(await response.json())
          : null;
        if (active)
          setResult({
            attempt,
            status: data && response.status === 200 ? 200 : 502,
            data,
          });
      } catch {
        if (active) setResult({ attempt, status: 502, data: null });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, attempt]);

  return (
    <section aria-labelledby="delivery-destination-title">
      <h3 id="delivery-destination-title">Dirección de entrega</h3>
      {!current ? (
        <p role="status">Consultando el destino…</p>
      ) : current.status === 200 && current.data ? (
        <dl className={styles.details} data-delivery-destination>
          <div>
            <dt>Dirección</dt>
            <dd>{current.data.direccionEntrega}</dd>
          </div>
          <div>
            <dt>Barrio</dt>
            <dd>{current.data.nombreBarrio}</dd>
          </div>
        </dl>
      ) : (
        <div role="alert">
          <p className={styles.error}>
            No fue posible consultar el destino de esta entrega.
          </p>
          <button
            className={styles.secondary}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reintentar consulta del destino
          </button>
        </div>
      )}
    </section>
  );
}

function DeliveryActions({
  initial,
  api,
}: {
  initial: CourierDelivery;
  api: string;
}) {
  const [delivery, setDelivery] = useState(initial);
  const [phase, setPhase] = useState<"idle" | "confirm" | "sending" | "review">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [reading, setReading] = useState(false),
    [checked, setChecked] = useState(false);
  const sending = useRef(false),
    readingRef = useRef(false);
  const action =
    delivery.estado === "ASIGNADA"
      ? "iniciar"
      : delivery.estado === "EN_CAMINO"
        ? "completar"
        : null;
  const label = action === "iniciar" ? "Iniciar entrega" : "Completar entrega";
  const parse = (value: unknown) => {
    const d = projectCourierDelivery(value);
    return d &&
      d.idEntrega === initial.idEntrega &&
      d.idPedido === initial.idPedido &&
      d.idRepartidor === initial.idRepartidor
      ? d
      : null;
  };
  async function submit() {
    if (sending.current || phase !== "confirm" || !action) return;
    sending.current = true;
    setPhase("sending");
    setMessage("");
    setChecked(false);
    try {
      const response = await fetch(`${api}/${action}`, {
        method: "POST",
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
            ? "La entrega cambió o no permite esta acción. Consultá el estado vigente; no repetiremos el POST automáticamente."
            : response.status === 403
              ? "No tenés autorización para realizar esta operación de reparto."
              : response.status === 404
                ? "La entrega ya no está disponible. Consultá nuevamente antes de continuar."
                : "No pudimos confirmar el resultado. El estado mostrado es el último confirmado. Consultá el estado vigente antes de volver a intentar.",
        );
        return;
      }
      const next = parse(await response.json());
      if (
        response.status !== 200 ||
        !next ||
        next.estado !== (action === "iniciar" ? "EN_CAMINO" : "ENTREGADA")
      )
        throw new Error("unconfirmed");
      setDelivery(next);
      setPhase("idle");
      setMessage(
        action === "iniciar"
          ? "Inicio de entrega confirmado por el servidor."
          : "Entrega completada y confirmada por el servidor.",
      );
    } catch {
      setPhase("review");
      setMessage(
        "Se perdió la conexión o no pudimos confirmar la respuesta. No sabemos si la operación terminó. Consultá el estado vigente; no se reenviará el POST.",
      );
    } finally {
      sending.current = false;
    }
  }
  async function readCurrent() {
    if (sending.current || readingRef.current) return;
    readingRef.current = true;
    setReading(true);
    setChecked(false);
    try {
      const response = await fetch(api, { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/login?sesion=vencida");
        return;
      }
      if (response.status !== 200) throw new Error("read_failed");
      const next = parse(await response.json());
      if (!next) throw new Error("unconfirmed");
      setDelivery(next);
      setChecked(true);
      setMessage(
        `Estado confirmado por el servidor: ${deliveryLabels[next.estado]}.`,
      );
      if (
        next.estado !== delivery.estado ||
        ["ENTREGADA", "CANCELADA"].includes(next.estado)
      )
        setPhase("idle");
    } catch {
      setMessage(
        "No pudimos consultar el estado vigente. No conocemos el resultado anterior; no se ha reenviado la operación.",
      );
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  }
  return (
    <article className={styles.panel} data-delivery-detail={delivery.idEntrega}>
      <h2>Entrega #{delivery.idEntrega}</h2>
      <p>Pedido #{delivery.idPedido}</p>
      <p data-delivery-state={delivery.estado}>
        <span className={styles.badge}>
          {phase === "review" ? "Último estado confirmado: " : ""}
          {deliveryLabels[delivery.estado]}
        </span>
      </p>
      <dl className={styles.details}>
        <div>
          <dt>Fecha de asignación</dt>
          <dd>
            <time dateTime={delivery.fechaAsignacion}>
              {deliveryDate(delivery.fechaAsignacion)}
            </time>
          </dd>
        </div>
        {delivery.fechaEntrega ? (
          <div>
            <dt>Fecha de entrega</dt>
            <dd data-delivered-at>
              <time dateTime={delivery.fechaEntrega}>
                {deliveryDate(delivery.fechaEntrega)}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
      {delivery.estado === "ASIGNADA" || delivery.estado === "EN_CAMINO" ? (
        <DeliveryDestination id={delivery.idEntrega} />
      ) : null}
      {message ? (
        <p
          role="status"
          className={phase === "review" ? styles.error : styles.success}
        >
          {message}
        </p>
      ) : null}
      {action && phase === "idle" ? (
        <button
          className={styles.button}
          onClick={() => {
            setPhase("confirm");
            setMessage("");
          }}
        >
          {label}
        </button>
      ) : null}
      {phase === "confirm" && action ? (
        <section
          className={detailStyles.confirm}
          aria-label="Confirmar acción de entrega"
        >
          <h3>
            ¿{action === "iniciar" ? "Iniciar" : "Completar"} la entrega #
            {delivery.idEntrega}?
          </h3>
          <p>
            {action === "iniciar"
              ? "Confirmá que vas a comenzar el recorrido. El servidor validará el estado vigente."
              : "Confirmá que la entrega se completó. El servidor registrará la finalización."}
          </p>
          <div className={styles.actions}>
            <button className={styles.button} onClick={() => void submit()}>
              Confirmar {action === "iniciar" ? "inicio" : "entrega"}
            </button>
            <button
              className={styles.secondary}
              onClick={() => setPhase("idle")}
            >
              Volver sin cambios
            </button>
          </div>
        </section>
      ) : null}
      {phase === "sending" ? (
        <button className={styles.button} disabled>
          Enviando…
        </button>
      ) : null}
      {phase === "review" ? (
        <section
          className={detailStyles.confirm}
          aria-label="Revisar resultado de entrega"
        >
          <h3>Comprobá el resultado antes de continuar</h3>
          <p>No se enviará otro POST automáticamente.</p>
          <button
            className={styles.button}
            disabled={reading}
            onClick={() => void readCurrent()}
          >
            {reading ? "Consultando…" : "Consultar estado vigente"}
          </button>
          {checked && action ? (
            <button
              className={styles.secondary}
              onClick={() => {
                setPhase("idle");
                setChecked(false);
                setMessage(
                  "Estado consultado. Una nueva acción requiere tu confirmación.",
                );
              }}
            >
              Estado consultado; habilitar nueva confirmación
            </button>
          ) : null}
        </section>
      ) : null}
      <div className={styles.actions}>
        <Link className={styles.secondary} href="/mis-entregas">
          Volver a Mis entregas
        </Link>
      </div>
    </article>
  );
}
export default function DeliveryDetail({ id }: { id: string }) {
  const api = `/api/mis-entregas/${encodeURIComponent(id)}`;
  const result = useBusinessData<CourierDelivery>(api);
  if (result.loading)
    return (
      <p className={styles.panel} role="status">
        Cargando entrega…
      </p>
    );
  if (result.status !== 200 || !result.data)
    return (
      <section
        className={styles.panel}
        role="alert"
        data-delivery-detail-error={result.status}
      >
        <h2>No pudimos consultar esta entrega</h2>
        <p>
          {result.status === 404
            ? "No existe o no está disponible entre tus entregas."
            : result.status === 403
              ? "No tenés autorización para consultar entregas."
              : "Intentá nuevamente cuando se restablezca la conexión."}
        </p>
        <button className={styles.button} onClick={result.retry}>
          Reintentar
        </button>
        <Link className={styles.secondary} href="/mis-entregas">
          Volver a Mis entregas
        </Link>
      </section>
    );
  return <DeliveryActions key={api} initial={result.data} api={api} />;
}
