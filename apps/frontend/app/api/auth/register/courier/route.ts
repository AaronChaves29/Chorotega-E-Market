import { NextRequest } from "next/server";
import { handleRegistration } from "@/lib/registration-handler";
import { validateCourierRegistration } from "@/lib/courier-registration";
export async function POST(request: NextRequest) {
  return handleRegistration(
    request,
    validateCourierRegistration,
    "/auth/register/courier",
    "Tu cuenta de repartidor se registró correctamente.",
  );
}
