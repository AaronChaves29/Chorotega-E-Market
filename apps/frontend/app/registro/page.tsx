import Link from "next/link";

const accountTypes = [
  {
    name: "Cliente",
    description: "Descubrí y comprá productos hechos en nuestra región.",
    available: true,
  },
  {
    name: "Emprendedor",
    description: "Compartí tus productos y hacé crecer tu emprendimiento.",
    available: false,
  },
  {
    name: "Repartidor",
    description: "Conectá comercios y clientes con cada entrega.",
    available: false,
  },
] as const;

export default function RegisterPage() {
  return (
    <div className="registration-card">
      <p className="registration-kicker">EMPEZÁ POR ACÁ</p>
      <h2>Elegí tu tipo de cuenta</h2>
      <p className="registration-description">
        Formá parte de una comunidad que apoya lo local.
      </p>

      <div className="account-type-list">
        {accountTypes.map((account, index) => {
          const content = (
            <>
              <span className="account-type-icon" aria-hidden="true">
                {index === 0 ? "C" : index === 1 ? "E" : "R"}
              </span>
              <span className="account-type-copy">
                <span className="account-type-heading">
                  <strong>{account.name}</strong>
                  {!account.available && (
                    <span className="account-type-soon">Próximamente</span>
                  )}
                </span>
                <span className="account-type-description">
                  {account.description}
                </span>
              </span>
              <span className="account-type-arrow" aria-hidden="true">
                →
              </span>
            </>
          );

          return account.available ? (
            <Link
              key={account.name}
              className="account-type-card account-type-card-available"
              href="/registro/cliente"
            >
              {content}
            </Link>
          ) : (
            <button
              key={account.name}
              className="account-type-card account-type-card-disabled"
              type="button"
              disabled
              aria-label={`${account.name}: próximamente`}
            >
              {content}
            </button>
          );
        })}
      </div>

      <p className="registration-footer">
        ¿Ya tenés una cuenta? <Link href="/login">Iniciá sesión</Link>
      </p>
    </div>
  );
}
