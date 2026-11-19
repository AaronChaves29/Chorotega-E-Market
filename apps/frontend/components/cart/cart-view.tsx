"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  applyReview,
  cents,
  colones,
  emptyCart,
  reviewChanges,
  subtotal,
  validQuantity,
  type CartReview,
} from "@/lib/cart";
import { fetchCartReview } from "@/lib/cart-review";
import { submitOrder } from "@/lib/order-submission";
import { useNeighborhoods } from "@/hooks/use-neighborhoods";
import DeliveryFields from "@/components/delivery-fields";
import { useCart } from "./cart-provider";
import styles from "./cart.module.css";

export default function CartView({ checkout = false }: { checkout?: boolean }) {
  const { status, cart, error, verify } = useCart();
  return (
    <main className={styles.main}>
      <Link href="/mercado" className={styles.back}>
        ← Continuar comprando
      </Link>
      <p className={styles.eyebrow}>Elegido por ti, hecho aquí</p>
      <h1>{checkout ? "Confirmá tu pedido" : "Tu carrito"}</h1>
      {status === "loading" ? (
        <p role="status">Verificando el carrito…</p>
      ) : status === "error" ? (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => void verify()}>Reintentar</button>
        </div>
      ) : null}
      {cart ? (
        <div hidden={status !== "ready"}>
          <CartContents key={cart.scope} checkout={checkout} />
        </div>
      ) : null}
    </main>
  );
}

function CartContents({ checkout }: { checkout: boolean }) {
  const { cart, update, verify } = useCart();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [reviewed, setReviewed] = useState<{
    key: string;
    data?: CartReview;
    error?: string;
  }>({ key: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [neighborhood, setNeighborhood] = useState("");
  const [address, setAddress] = useState("");
  const locations = useNeighborhoods(checkout);
  const selectedNeighborhood = locations.neighborhoods.find(
    (n) => String(n.idBarrio) === neighborhood,
  );
  const key = `${JSON.stringify(cart)}:${attempt}`;
  const review = reviewed.key === key ? reviewed.data : undefined;
  const error = reviewed.key === key ? reviewed.error : undefined;
  const changes = review && cart ? reviewChanges(cart, review) : [];

  useEffect(() => {
    if (!cart?.items.length || cart.phase !== "editing") return;
    const snapshot = cart;
    const controller = new AbortController();
    void fetchCartReview(
      snapshot,
      AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
    )
      .then((data) => {
        if (!controller.signal.aborted) setReviewed({ key, data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setReviewed({
            key,
            error:
              "No se pudo verificar la disponibilidad. Si la tienda no está disponible, no se puede confirmar el pedido.",
          });
      });
    return () => controller.abort();
  }, [cart, key]);

  if (!cart) return null;
  if (cart.phase === "created")
    return (
      <section className={styles.empty} role="status">
        <h2>¡Tu pedido se creó con éxito!</h2>
        <p>Pedido #{cart.orderId}. El carrito quedó vacío.</p>
        <Link href="/pedidos">Ver mis pedidos</Link>
      </section>
    );
  if (cart.phase === "uncertain" || cart.phase === "submitting")
    return (
      <section className={styles.empty} role="alert">
        <h2>Resultado de compra pendiente</h2>
        <p>
          No reenviés la compra. La solicitud pudo haberse guardado; revisá Mis
          pedidos antes de continuar. Este carrito permanece bloqueado.
        </p>
        <Link href="/pedidos">Revisar mis pedidos</Link>
      </section>
    );
  if (!cart.store || cart.items.length === 0)
    return (
      <section className={styles.empty}>
        <h2>Tu carrito está vacío</h2>
        <p>Explorá los emprendimientos y agregá productos de una tienda.</p>
        <Link href="/mercado">Explorar emprendimientos</Link>
      </section>
    );
  const snapshot = cart;
  const selectedStore = cart.store;
  const shipping =
    checkout && selectedNeighborhood
      ? cents(selectedNeighborhood.tarifaEnvio)
      : null;

  function quantity(id: number, value: number) {
    try {
      update((current) => ({
        ...current,
        items: current.items.map((item) => {
          if (item.product.idProducto !== id) return item;
          if (!validQuantity(value, item.product.cantidadDisponible))
            throw new Error(
              "La cantidad debe ser entera, mayor que cero y no superar las existencias.",
            );
          return { ...item, quantity: value };
        }),
      }));
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Cantidad no válida.",
      );
    }
  }
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    let dispatched = false;
    try {
      if (!selectedNeighborhood || !address.trim() || address.length > 255)
        throw new Error(
          "Seleccioná un barrio e ingresá la dirección de entrega.",
        );
      if (!(await verify()))
        throw new Error(
          "No se pudo verificar tu sesión. No se envió el pedido.",
        );
      const fresh = await fetchCartReview(snapshot, AbortSignal.timeout(12000));
      if (reviewChanges(snapshot, fresh).length) {
        setReviewed({ key, data: fresh });
        throw new Error(
          "La disponibilidad cambió. Revisá y aplicá los cambios antes de confirmar.",
        );
      }
      update((current) => {
        if (
          current.scope !== snapshot.scope ||
          current.phase !== "editing" ||
          JSON.stringify(current.items) !== JSON.stringify(snapshot.items)
        )
          throw new Error("El carrito cambió. Revisalo antes de confirmar.");
        return { ...current, phase: "submitting" };
      });
      dispatched = true;
      const result = await submitOrder(
        {
          idBarrio: selectedNeighborhood.idBarrio,
          direccionEntrega: address.trim(),
          items: snapshot.items.map((i) => ({
            idProducto: i.product.idProducto,
            cantidad: i.quantity,
          })),
        },
        { scope: snapshot.scope, storeId: selectedStore.idTienda },
      );
      if (result.status === "created") {
        update((current) => {
          if (current.scope !== snapshot.scope)
            throw new Error("La sesión cambió.");
          return {
            ...emptyCart(current.scope),
            phase: "created",
            orderId: result.order.idPedido,
          };
        });
      } else {
        update((current) =>
          current.scope === snapshot.scope
            ? {
                ...current,
                phase: result.status === "uncertain" ? "uncertain" : "editing",
              }
            : current,
        );
        if (result.status === "rejected" && result.code === 401)
          router.replace("/login?sesion=vencida");
        setMessage(result.message);
        setAttempt((n) => n + 1);
      }
    } catch (error) {
      if (dispatched) {
        try {
          update((current) =>
            current.scope === snapshot.scope
              ? { ...current, phase: "uncertain" }
              : current,
          );
        } catch {
          /* The persisted submitting marker already blocks resubmission. */
        }
      }
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo verificar el pedido.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.subtitle}>
        {cart.items.reduce((sum, i) => sum + i.quantity, 0)} artículos de{" "}
        {cart.store.nombre}.
      </p>
      {message ? (
        <p className={styles.warning} role="alert">
          {message}
        </p>
      ) : null}
      <div className={styles.layout}>
        <div>
          <div className={styles.items}>
            {cart.items.map((item) => (
              <article
                key={item.product.idProducto}
                className={styles.item}
                data-cart-product={item.product.idProducto}
              >
                <div className={styles.photo}>
                  <Image
                    src="/landing/package.svg"
                    width={32}
                    height={32}
                    alt=""
                  />
                  <span>Sin fotografía del producto</span>
                </div>
                <div className={styles.itemCopy}>
                  <p>{cart.store?.nombre}</p>
                  <h2>{item.product.nombre}</h2>
                  <strong>{colones(cents(item.product.precio))}</strong>
                  <div className={styles.controls}>
                    <button
                      type="button"
                      aria-label={`Disminuir ${item.product.nombre}`}
                      disabled={busy || item.quantity <= 1}
                      onClick={() =>
                        quantity(item.product.idProducto, item.quantity - 1)
                      }
                    >
                      −
                    </button>
                    <input
                      aria-label={`Cantidad de ${item.product.nombre}`}
                      type="number"
                      min="1"
                      max={item.product.cantidadDisponible}
                      step="1"
                      value={item.quantity}
                      disabled={busy}
                      onChange={(event) =>
                        quantity(
                          item.product.idProducto,
                          Number(event.target.value),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Aumentar ${item.product.nombre}`}
                      disabled={
                        busy || item.quantity >= item.product.cantidadDisponible
                      }
                      onClick={() =>
                        quantity(item.product.idProducto, item.quantity + 1)
                      }
                    >
                      ＋
                    </button>
                  </div>
                </div>
                <button
                  className={styles.remove}
                  type="button"
                  disabled={busy}
                  aria-label={`Eliminar ${item.product.nombre}`}
                  onClick={() =>
                    update((current) => {
                      const items = current.items.filter(
                        (i) => i.product.idProducto !== item.product.idProducto,
                      );
                      return {
                        ...current,
                        items,
                        store: items.length ? current.store : null,
                      };
                    })
                  }
                >
                  Eliminar
                </button>
              </article>
            ))}
          </div>
          <p className={styles.community}>
            <Image src="/landing/sprout.svg" width={22} height={22} alt="" />
            Con cada compra, conectas con el talento de nuestra comunidad.
          </p>
          {checkout ? (
            <section
              className={styles.delivery}
              aria-labelledby="delivery-title"
            >
              <h2 id="delivery-title">Datos de entrega</h2>
              <DeliveryFields
                neighborhoods={locations.neighborhoods}
                loading={locations.loading}
                error={locations.error}
                neighborhood={neighborhood}
                address={address}
                onNeighborhood={setNeighborhood}
                onAddress={setAddress}
                disabled={busy}
              />
              {locations.error ? (
                <button type="button" onClick={locations.retry}>
                  Reintentar barrios
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
        <aside className={styles.summary} aria-label="Resumen del pedido">
          <h2>Resumen del pedido</h2>
          <dl>
            <div>
              <dt>Subtotal estimado</dt>
              <dd>{colones(subtotal(cart.items))}</dd>
            </div>
          </dl>
          <section className={styles.shipping}>
            <p>
              Envío{" "}
              <span>{shipping === null ? "Pendiente" : colones(shipping)}</span>
            </p>
            <p>
              {checkout
                ? "La tarifa corresponde al barrio seleccionado; el backend confirma el total definitivo."
                : "Indicá barrio y dirección en el siguiente paso para conocer el envío."}
            </p>
          </section>
          <div className={styles.total}>
            <span>Total estimado{shipping === null ? " sin envío" : ""}</span>
            <strong>
              {colones(subtotal(cart.items) + (shipping ?? BigInt(0)))}
            </strong>
          </div>
          {error ? (
            <div className={styles.warning} role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Revisar disponibilidad
              </button>
            </div>
          ) : !review ? (
            <p role="status">Revisando precios y existencias…</p>
          ) : null}
          {changes.length ? (
            <section className={styles.warning} role="alert">
              <h3>Revisá los cambios</h3>
              <ul>
                {changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  update((current) => applyReview(current, review!));
                  setMessage("");
                }}
              >
                Aplicar cambios de precio, cantidades y disponibilidad
              </button>
            </section>
          ) : null}
          <button
            type="button"
            data-cart-continue
            className={styles.primary}
            disabled={
              busy ||
              !review ||
              changes.length > 0 ||
              (checkout &&
                (!selectedNeighborhood ||
                  !address.trim() ||
                  address.length > 255))
            }
            onClick={() =>
              checkout ? void confirm() : router.push("/carrito/confirmar")
            }
          >
            {busy
              ? "Confirmando…"
              : checkout
                ? "Confirmar pedido"
                : "Continuar al pedido"}{" "}
            <span aria-hidden="true">→</span>
          </button>
          <p className={styles.disclaimer}>
            El carrito no reserva inventario. La compra se confirma con los
            precios y existencias del servidor. No se procesa ningún pago en
            esta pantalla.
          </p>
        </aside>
      </div>
    </>
  );
}
