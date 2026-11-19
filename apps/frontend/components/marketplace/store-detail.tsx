"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  isStoreDetail,
  positiveId,
  type StoreDetail,
} from "@/lib/store-detail";
import type { CurrentUser } from "@/types/auth";
import StoreSocialLinks from "./store-social-links";
import StoreProducts from "./store-products";
import styles from "./store-detail.module.css";

export default function StoreDetailView({
  id,
  user,
}: {
  id: string;
  user: CurrentUser;
}) {
  const router = useRouter();
  const storeId = positiveId(id);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    status: number;
    store?: StoreDetail;
  }>({ key: "", status: 0 });
  const key = `${id}:${attempt}`;
  const status =
    storeId === null ? 400 : result.key === key ? result.status : 0;
  const store = result.key === key && status === 200 ? result.store : undefined;
  const markUnavailable = useCallback(
    () => setResult({ key, status: 404 }),
    [key],
  );
  useEffect(() => {
    if (storeId === null) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/stores/${storeId}`, {
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
        if (!response.ok) {
          if (!controller.signal.aborted)
            setResult({ key, status: response.status });
          return;
        }
        const data: unknown = await response.json();
        if (
          !isStoreDetail(data) ||
          data.idTienda !== storeId ||
          data.estado !== "ACTIVA"
        )
          throw new Error("Tienda no disponible");
        if (!controller.signal.aborted)
          setResult({ key, status: 200, store: data });
      } catch {
        if (!controller.signal.aborted) setResult({ key, status: 502 });
      }
    }
    void load();
    return () => controller.abort();
  }, [storeId, key, router]);

  return (
    <main className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="Ubicación">
        <Link href="/mercado" prefetch={false}>
          ← Volver al mercado
        </Link>
        {store ? (
          <>
            <span aria-hidden="true"> / </span>
            <span>{store.nombre}</span>
          </>
        ) : null}
      </nav>
      {status === 0 ? (
        <p className={styles.notice} role="status">
          Cargando tienda…
        </p>
      ) : null}
      {status !== 0 && status !== 200 ? (
        <section
          className={styles.notice}
          role="alert"
          data-store-error={status}
        >
          <h1>
            {status === 400
              ? "Identificador de tienda no válido"
              : status === 404
                ? "Tienda no disponible"
                : "No pudimos consultar la tienda"}
          </h1>
          <p>
            {status === 400
              ? "Revisá el enlace de la tienda."
              : status === 404
                ? "La tienda no existe o no está disponible en el mercado."
                : "Intentá nuevamente. Tu sesión no se cerró."}
          </p>
          {status !== 400 && status !== 404 ? (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Reintentar
            </button>
          ) : null}
        </section>
      ) : null}
      {store ? (
        <>
          <section className={styles.hero} aria-labelledby="shop-title">
            <div className={styles.storePhoto}>
              <Image src="/landing/store.svg" width={32} height={32} alt="" />
              <span>Sin fotografía de la tienda</span>
            </div>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Tienda activa</p>
              <h1 id="shop-title">{store.nombre}</h1>
              <p className={styles.storeDescription}>
                {store.descripcion ||
                  "Este emprendimiento todavía no agregó una descripción."}
              </p>
              <dl className={styles.contact}>
                <div>
                  <dt>Dirección</dt>
                  <dd>{store.direccion}</dd>
                </div>
                {store.telefono ? (
                  <div>
                    <dt>Teléfono</dt>
                    <dd>{store.telefono}</dd>
                  </div>
                ) : null}
                {store.horario ? (
                  <div>
                    <dt>Horario</dt>
                    <dd>{store.horario}</dd>
                  </div>
                ) : null}
              </dl>
              <StoreSocialLinks store={store} />
            </div>
            <span className={styles.emblem}>
              <Image
                src="/registration/chorotega-emblem.png"
                width={1024}
                height={1024}
                alt="Chorotega E-Market"
              />
            </span>
          </section>
          <StoreProducts
            key={store.idTienda}
            store={store}
            canBuy={user.rol === "CLIENTE"}
            onUnavailable={markUnavailable}
          />
        </>
      ) : null}
    </main>
  );
}
