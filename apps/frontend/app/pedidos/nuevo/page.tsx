import AccountHeader from "@/components/account-header";
import SessionBoundary from "@/components/session-boundary";
import ProfileUnavailable from "@/components/profile-unavailable";
import { requireCurrentUser } from "@/lib/current-user";
import { redirect } from "next/navigation";
import Link from "next/link";
import CreateOrderForm from "@/components/create-order-form";

export default async function NewOrderPage() {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  const { user } = result;
  if (user.rol !== "CLIENTE") redirect("/cuenta");

  return (
    <SessionBoundary user={user}>
      <main className="create-order-page">
        <div className="create-order-page-inner">
          <Link href="/pedidos" className="create-order-back">
            <span aria-hidden="true">←</span> Volver a mis pedidos
          </Link>

          <AccountHeader
            user={user}
            title="Crear nuevo pedido"
            description="Elegí una tienda, seleccioná tus productos e indicá dónde recibir tu pedido."
            className="create-order-header"
          />

          <CreateOrderForm />
        </div>
      </main>
    </SessionBoundary>
  );
}
