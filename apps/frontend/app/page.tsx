import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <h1 className="text-4xl font-bold text-gray-900">
        Chorotega E-Market
      </h1>

      <p className="mt-4 max-w-lg text-lg text-gray-600">
        Marketplace para emprendedores de la región Chorotega.
      </p>

      <Link
        href="/login"
        className="mt-8 rounded-lg bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800"
      >
        Iniciar sesión
      </Link>
    </main>
  );
}