import Link from "next/link";
import RegisterCourierForm from "@/components/register-courier-form";

export default function RegisterCourierPage() {
  return (
    <div className="registration-card registration-entrepreneur-card">
      <nav className="registration-access" aria-label="Acceso">
        <Link href="/login">Iniciar sesión</Link>
        <Link href="/registro" aria-current="page">
          Registrarse
        </Link>
      </nav>
      <p className="registration-kicker">ÚNETE COMO REPARTIDOR</p>
      <h2>Conecta nuestra región con cada entrega.</h2>
      <p className="registration-description">
        Configurá tu perfil de repartidor y tu medio de transporte para
        comenzar.
      </p>
      <RegisterCourierForm />
      <Link className="registration-back" href="/registro">
        ← Volver a elegir tipo de cuenta
      </Link>
    </div>
  );
}
