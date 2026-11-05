import AccountHeader from "@/components/account-header";
import SessionBoundary from "@/components/session-boundary";
import ProfileUnavailable from "@/components/profile-unavailable";
import { requireCurrentUser } from "@/lib/current-user";
import OrdersList from "@/components/orders-list";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function PedidosPage() {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  const { user } = result;
  if (user.rol !== "CLIENTE") redirect("/cuenta");

  return (
    <SessionBoundary user={user}>
      <main className="orders-page">
        <div className="orders-page-inner">
          <AccountHeader
            user={user}
            title="Mis pedidos"
            description="Consultá el estado y la información de tus pedidos."
            className="orders-header"
          />

          <OrdersList />
          <div className="orders-new-order">
            <Link href="/pedidos/nuevo">
              <span aria-hidden="true">+</span> Nuevo pedido
            </Link>
          </div>
        </div>
      </main>
    </SessionBoundary>
  );
}
