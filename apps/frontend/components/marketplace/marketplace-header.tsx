import CartLink from "@/components/cart/cart-link";
import Image from "next/image";
import Link from "next/link";
import AccountMenu from "@/components/account-menu";
import type { CurrentUser } from "@/types/auth";
import styles from "./store-explorer.module.css";

export default function MarketplaceHeader({
  user,
  adminUrl,
  exploring = false,
}: {
  user: CurrentUser;
  adminUrl?: string;
  exploring?: boolean;
}) {
  return (
    <header className={styles.header}>
      <Link
        href="/"
        className={styles.brand}
        aria-label="Chorotega E-Market, inicio"
      >
        <span className={styles.emblem}>
          <Image
            src="/registration/chorotega-emblem.png"
            width={1024}
            height={1024}
            alt=""
          />
        </span>
        <span>
          <strong>Chorotega</strong>
          <small>E-MARKET</small>
        </span>
      </Link>
      <nav className={styles.navigation} aria-label="Navegación del mercado">
        <Link
          href="/mercado"
          aria-current={exploring ? "page" : undefined}
          prefetch={false}
        >
          Explorar
        </Link>
      </nav>
      <div className={styles.actions}>
        {user.rol === "CLIENTE" ? <CartLink /> : null}
        <AccountMenu user={user} adminUrl={adminUrl} />
      </div>
    </header>
  );
}
