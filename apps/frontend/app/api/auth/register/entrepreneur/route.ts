import { NextRequest } from "next/server";
import { handleRegistration } from "@/lib/registration-handler";
import { validateEntrepreneurRegistration } from "@/lib/entrepreneur-registration";
export async function POST(request: NextRequest) {
  return handleRegistration(
    request,
    validateEntrepreneurRegistration,
    "/auth/register/entrepreneur",
    "Tu cuenta y tu negocio se registraron correctamente.",
  );
}
