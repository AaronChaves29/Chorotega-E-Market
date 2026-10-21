
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
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mis pedidos</h1>

          <p className="mt-2 text-gray-600">
            Consultá el estado y la información de tus pedidos.
          </p>
        </div>

        <LogoutButton />
      </header>

      <OrdersList />
      <div className="mt-6">
        <Link
          href="/pedidos/nuevo"
          className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
        >
          + Nuevo pedido
        </Link>
      </div>
    </main>
  );
}
