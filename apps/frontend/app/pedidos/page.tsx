
import LogoutButton from "@/components/logout-button";
import OrdersList from "@/components/orders-list";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
    </main>
  );
}
