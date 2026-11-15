"use client";

import { useState } from "react";
import { addItem, validQuantity, type Cart } from "@/lib/cart";
import type { StoreProduct } from "@/lib/store-detail";
import { useCart } from "./cart-provider";
import styles from "./cart.module.css";

export default function AddToCart({
  store,
  product,
}: {
  store: NonNullable<Cart["store"]>;
  product: StoreProduct;
}) {
  const { cart, status, error, update, verify } = useCart();
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState("");
  const [replace, setReplace] = useState(false);
  function add(replacing = false) {
    try {
      if (!validQuantity(Number(quantity), product.cantidadDisponible))
        throw new Error(
          "Ingresá una cantidad entera entre 1 y las existencias.",
        );
      if (
        !replacing &&
        cart?.items.length &&
        cart.store?.idTienda !== store.idTienda
      ) {
        setReplace(true);
        return;
      }
      update((current) =>
        addItem(current, store, product, Number(quantity), replacing),
      );
      setReplace(false);
      setMessage("Producto agregado al carrito.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo agregar el producto.",
      );
    }
  }
  return (
    <div className={styles.add}>
      <label>
        Cantidad{" "}
        <input
          aria-label={`Cantidad de ${product.nombre}`}
          type="number"
          min="1"
          max={product.cantidadDisponible}
          step="1"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            setMessage("");
          }}
        />
      </label>
      <button
        type="button"
        data-add-product={product.idProducto}
        onClick={() => add()}
        disabled={
          status !== "ready" ||
          (cart?.phase !== "editing" && cart?.phase !== "created")
        }
      >
        ＋ Agregar al carrito
      </button>
      {status === "error" ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => void verify()}>
            Reintentar carrito
          </button>
        </p>
      ) : null}
      {cart?.phase === "uncertain" || cart?.phase === "submitting" ? (
        <p role="alert">
          Revisá Mis pedidos: existe una compra con resultado pendiente.
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {replace ? (
        <section
          className={styles.replacement}
          aria-label="Cambiar emprendimiento"
          role="alert"
        >
          <p>
            Tu carrito contiene productos de {cart?.store?.nombre}. Para agregar
            este producto de {store.nombre}, tenés que reemplazarlo.
          </p>
          <button type="button" onClick={() => add(true)}>
            Reemplazar carrito y agregar
          </button>
          <button type="button" onClick={() => setReplace(false)}>
            Conservar carrito
          </button>
        </section>
      ) : null}
    </div>
  );
}
