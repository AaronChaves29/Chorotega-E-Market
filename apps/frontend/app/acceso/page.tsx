import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/current-user";
import { accountDestination } from "@/types/auth";
import ProfileUnavailable from "@/components/profile-unavailable";

// Conserva el destino por rol que antes resolvía la página raíz.
export default async function AccountEntryPage() {
  const result = await requireCurrentUser();
  if (result.status === "unavailable") return <ProfileUnavailable />;
  redirect(accountDestination(result.user.rol));
}
