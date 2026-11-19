import { CartProvider } from "@/components/cart/cart-provider";
import SessionBoundary from "@/components/session-boundary";
import ProfileUnavailable from "@/components/profile-unavailable";
import MarketplaceHeader from "@/components/marketplace/marketplace-header";
import StoreDetailView from "@/components/marketplace/store-detail";
import { requireCurrentUser } from "@/lib/current-user";
import { getAdminLoginUrl } from "@/lib/server-api";
import styles from "@/components/marketplace/store-explorer.module.css";

export default async function StorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  const { id } = await params;
  const { user } = result;
  return (
    <SessionBoundary user={user}>
      <CartProvider user={user}>
        <div className={styles.market}>
          <MarketplaceHeader
            user={user}
            adminUrl={user.rol === "ADMIN" ? getAdminLoginUrl() : undefined}
          />
          <StoreDetailView key={id} id={id} user={user} />
        </div>
      </CartProvider>
    </SessionBoundary>
  );
}
