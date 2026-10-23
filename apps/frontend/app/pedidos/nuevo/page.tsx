import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import CreateOrderForm from "@/components/create-order-form";

export default async function NewOrderPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("chorotega_session")?.value;

  if (!token) {
    redirect("/login");
  }

  return (
    <main className="create-order-page">
      <div className="create-order-page-inner">
        <Link href="/pedidos" className="create-order-back">
          <span aria-hidden="true">←</span> Volver a mis pedidos
        </Link>

        <header className="create-order-header">
          <p className="create-order-eyebrow">CHOROTEGA E-MARKET</p>
          <h1>Crear nuevo pedido</h1>
          <p>
            Elegí una tienda, seleccioná tus productos e indicá dónde recibir
            tu pedido.
          </p>
        </header>

        <CreateOrderForm />
      </div>
    </main>
  );
}