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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/pedidos"
        className="text-sm text-blue-600 hover:underline"
      >
        ← Volver a mis pedidos
      </Link>

      <h1 className="mt-6 text-3xl font-bold">
        Crear nuevo pedido
      </h1>

      <p className="mt-2 text-gray-600">
        Seleccioná una tienda, elegí los productos que necesitás
        e indicá dónde querés recibir tu pedido.
      </p>
      <CreateOrderForm />
    </main>
  );
}