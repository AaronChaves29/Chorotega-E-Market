"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "./cart-provider";
import styles from "./cart.module.css";

export default function CartLink() {
  const { cart, status } = useCart();
  const count =
    status === "ready"
      ? (cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0)
      : null;
  return (
    <Link
      href="/carrito"
      prefetch={false}
      className={styles.cartLink}
      aria-label={`Carrito${count === null ? "" : `, ${count} artículos`}`}
    >
      <Image src="/landing/shopping-bag.svg" width={32} height={32} alt="" />
      <span aria-hidden="true" data-cart-count>
        {count ?? "…"}
      </span>
    </Link>
  );
}
