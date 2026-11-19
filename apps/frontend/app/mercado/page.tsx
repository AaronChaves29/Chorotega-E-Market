import { CartProvider } from "@/components/cart/cart-provider";
import SessionBoundary from "@/components/session-boundary";
import ProfileUnavailable from "@/components/profile-unavailable";
import StoreExplorer from "@/components/marketplace/store-explorer";
import { requireCurrentUser } from "@/lib/current-user";
import { getAdminLoginUrl } from "@/lib/server-api";

export default async function MarketPage() {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  const { user } = result;
  return (
    <SessionBoundary user={user}>
      <CartProvider user={user}>
        <StoreExplorer
          user={user}
          adminUrl={user.rol === "ADMIN" ? getAdminLoginUrl() : undefined}
        />
      </CartProvider>
    </SessionBoundary>
  );
}
