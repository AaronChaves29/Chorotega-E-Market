import Link from "next/link";
import RegisterEntrepreneurForm from "@/components/register-entrepreneur-form";

export default function RegisterEntrepreneurPage() {
  return (
    <div className="registration-card registration-entrepreneur-card">
      <nav className="registration-access" aria-label="Acceso">
        <Link href="/login">Iniciar sesión</Link>
        <Link href="/registro" aria-current="page">
          Registrarse
        </Link>
      </nav>
      <p className="registration-kicker">ÚNETE COMO EMPRENDEDOR</p>
      <h2>Dale un nuevo espacio a tu negocio.</h2>
      <p className="registration-description">
        Registrá tu cuenta personal y el perfil de tu emprendimiento para
        conectar con clientes locales.
      </p>
      <RegisterEntrepreneurForm />
      <Link className="registration-back" href="/registro">
        ← Volver a elegir tipo de cuenta
      </Link>
    </div>
  );
}
