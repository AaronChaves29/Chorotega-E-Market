import Link from "next/link";
import AccountHeader from "@/components/account-header";
import SessionBoundary from "@/components/session-boundary";
import ProfileUnavailable from "@/components/profile-unavailable";
import { requireCurrentUser } from "@/lib/current-user";
import { getAdminLoginUrl } from "@/lib/server-api";
import { ROLE_LABELS } from "@/types/auth";

export default async function AccountPage() {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  const { user } = result;
  return (
    <SessionBoundary user={user}>
      <main className="account-page">
        <div className="orders-page-inner">
          <AccountHeader
            user={user}
            title="Mi cuenta"
            description="Tu información en Chorotega E-Market."
          />
          <section
            className="account-card"
            aria-label="Información de tu cuenta"
          >
            <dl className="account-profile">
              <div>
                <dt>Nombre completo</dt>
                <dd>
                  {user.nombre} {user.apellido}
                </dd>
              </div>
              <div>
                <dt>Correo electrónico</dt>
                <dd>{user.correo}</dd>
              </div>
              <div>
                <dt>Rol actual</dt>
                <dd>{ROLE_LABELS[user.rol]}</dd>
              </div>
            </dl>
            {user.rol === "CLIENTE" ? (
              <Link className="account-action" href="/pedidos" prefetch={false}>
                Ver mis pedidos
              </Link>
            ) : null}
            {user.rol === "ADMIN" ? (
              <>
                <a className="account-action" href={getAdminLoginUrl()}>
                  Ir al panel administrativo
                </a>
                <p className="account-help">
                  El panel requiere su propio inicio de sesión. Cerrar sesión
                  aquí no cierra la sesión administrativa.
                </p>
              </>
            ) : null}
          </section>
        </div>
      </main>
    </SessionBoundary>
  );
}
