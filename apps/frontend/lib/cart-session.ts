import "server-only";
import { createHash } from "node:crypto";
export const CART_SESSION_COOKIE = "chorotega_cart_session";
// Public opaque storage namespace. It is never accepted as authentication.
export function cartScope(
  userId: number,
  nonce: string,
  token: string,
): string {
  return createHash("sha256")
    .update(`cart-v1:${userId}:${nonce}:${token}`)
    .digest("hex");
}
