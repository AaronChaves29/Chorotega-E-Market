
import LogoutButton from "@/components/logout-button";
import OrdersList from "@/components/orders-list";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function PedidosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("chorotega_session")?.value;

  if (!token) {
    redirect("/login");
  }

  return (
    <main className="orders-page">
      <div className="orders-page-inner">
        <header className="orders-header">
          <div>
            <p className="orders-eyebrow">CHOROTEGA E-MARKET</p>
            <h1>Mis pedidos</h1>

            <p className="orders-header-description">
              Consultá el estado y la información de tus pedidos.
            </p>
          </div>

          <LogoutButton />
        </header>

        <OrdersList />
        <div className="orders-new-order">
          <Link href="/pedidos/nuevo">
            <span aria-hidden="true">+</span> Nuevo pedido
          </Link>
        </div>
      </div>
    </main>
  );
}
