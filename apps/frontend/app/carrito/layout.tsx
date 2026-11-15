import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/current-user";
import ProfileUnavailable from "@/components/profile-unavailable";
import SessionBoundary from "@/components/session-boundary";
import { CartProvider } from "@/components/cart/cart-provider";
import MarketplaceHeader from "@/components/marketplace/marketplace-header";
import styles from "@/components/marketplace/store-explorer.module.css";

export default async function CartLayout({
  children,
}: {
  children: ReactNode;
}) {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  if (result.user.rol !== "CLIENTE") redirect("/cuenta");
  return (
    <SessionBoundary user={result.user}>
      <CartProvider user={result.user}>
        <div className={styles.market}>
          <MarketplaceHeader user={result.user} />
          {children}
        </div>
      </CartProvider>
    </SessionBoundary>
  );
}
