import AccountMenu from "@/components/account-menu";
import { getAdminLoginUrl } from "@/lib/server-api";
import type { CurrentUser } from "@/types/auth";

export default function AccountHeader({
  user,
  title,
  description,
  className = "",
}: {
  user: CurrentUser;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <header className={`account-header ${className}`}>
      <div className="account-header-copy">
        <p className="orders-eyebrow">CHOROTEGA E-MARKET</p>
        <h1>{title}</h1>
        <p className="account-header-description">{description}</p>
      </div>
      <AccountMenu
        user={user}
        adminUrl={user.rol === "ADMIN" ? getAdminLoginUrl() : undefined}
      />
    </header>
  );
}
