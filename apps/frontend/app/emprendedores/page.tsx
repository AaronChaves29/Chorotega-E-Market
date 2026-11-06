import Link from "next/link";
import AccountHeader from "@/components/account-header";
import SessionBoundary from "@/components/session-boundary";
import ProfileUnavailable from "@/components/profile-unavailable";
import { requireCurrentUser } from "@/lib/current-user";

const benefits = [
  [
    "Publicá tus productos",
    "Ofrecé tus productos a los clientes de la plataforma.",
  ],
  ["Administrá tu tienda", "Organizá la información de tu emprendimiento."],
  [
    "Gestioná tus pedidos",
    "Llevá un mejor control de las compras de tus clientes.",
  ],
  [
    "Llegá a más clientes",
    "Dale mayor visibilidad a tus productos en la Región Chorotega.",
  ],
];

export default async function EntrepreneursPage() {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  const { user } = result;
  return (
    <SessionBoundary user={user}>
      <main className="account-page">
        <div className="orders-page-inner">
          <AccountHeader
            user={user}
            title="Empezá a vender en Chorotega E-Market"
            description="Conectá tu emprendimiento con más clientes de la Región Chorotega y administrá tus productos desde una misma plataforma."
          />
          <section
            className="entrepreneur-benefits"
            aria-label="Beneficios para tu emprendimiento"
          >
            {benefits.map(([title, description], index) => (
              <article className="account-card" key={title}>
                <span className="benefit-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <h2>{title}</h2>
                <p>{description}</p>
              </article>
            ))}
          </section>
          <section className="account-card entrepreneur-notice">
            <h2>¿Cómo incorporarte?</h2>
            <p>
              Ya está disponible el registro de una nueva cuenta de emprendedor
              junto con su negocio. Registrarte no convierte tu cuenta actual ni
              cambia su rol.
            </p>
            <Link className="account-action" href="/registro/emprendedor">Registrar un negocio</Link>
            <p>
              Esta página es informativa: no envía solicitudes ni cambia el rol
              de tu cuenta. Los beneficios describen las posibilidades del
              marketplace; aquí no se habilita un panel de gestión.
            </p>
            <Link
              className="account-action"
              href={user.rol === "CLIENTE" ? "/pedidos" : "/cuenta"}
              prefetch={false}
            >
              Volver a {user.rol === "CLIENTE" ? "mis pedidos" : "mi cuenta"}
            </Link>
          </section>
        </div>
      </main>
    </SessionBoundary>
  );
}
