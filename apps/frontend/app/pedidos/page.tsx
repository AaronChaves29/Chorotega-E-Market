import LogoutButton from "@/components/logout-button";
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Mis pedidos</h1>
        <LogoutButton />
      </div>

      <p className="mt-6 text-gray-600">
        Próximamente mostraremos tus pedidos desde la API.
      </p>
    </main>
  );
}