import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import AccountHeader from "@/components/account-header";
import ProfileUnavailable from "@/components/profile-unavailable";
import SessionBoundary from "@/components/session-boundary";
import { requireCurrentUser } from "@/lib/current-user";
import styles from "@/components/business/business.module.css";

export default async function BusinessLayout({
  children,
}: {
  children: ReactNode;
}) {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  if (result.user.rol !== "EMPRENDEDOR") redirect("/cuenta");
  return (
    <SessionBoundary user={result.user}>
      <main className={styles.business}>
        <div className={styles.inner}>
          <AccountHeader
            user={result.user}
            title="Mi negocio"
            description="Administrá la información comercial de tus tiendas."
          />
          <nav
            className={styles.navigation}
            aria-label="Navegación de Mi negocio"
          >
            <Link href="/mi-negocio/tiendas" prefetch={false}>
              Mis tiendas
            </Link>
            <Link href="/cuenta" prefetch={false}>
              Mi cuenta
            </Link>
          </nav>
          {children}
        </div>
      </main>
    </SessionBoundary>
  );
}
