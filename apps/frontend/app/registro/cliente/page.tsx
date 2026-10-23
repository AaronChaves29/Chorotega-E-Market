import Link from "next/link";
import RegisterClientForm from "../../../components/register-client-form";

export default function RegisterClientPage() {
  return (
    <div className="registration-card registration-client-card">
      <Link className="registration-back" href="/registro">
        <span aria-hidden="true">←</span> Tipo de cuenta
      </Link>
      <p className="registration-kicker">CUENTA DE CLIENTE</p>
      <h2>Creá tu cuenta</h2>
      <p className="registration-description">
        Completá tus datos para descubrir lo mejor de nuestra región.
      </p>
      <RegisterClientForm />
      <p className="registration-footer">
        ¿Ya tenés una cuenta? <Link href="/login">Iniciá sesión</Link>
      </p>
    </div>
  );
}
