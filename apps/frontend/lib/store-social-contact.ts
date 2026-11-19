// Mirrors the Phase 6A input contract; no network calls or backend imports.
export type SocialField = "instagramUrl" | "facebookUrl" | "whatsappComercial";
export type StoreSocialContact = Partial<Record<SocialField, string | null>>;
export type SocialFieldErrors = Partial<Record<SocialField, string>>;
export const socialFields = [
  "instagramUrl",
  "facebookUrl",
  "whatsappComercial",
] as const;

const reservedInstagram = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "about",
  "developer",
  "developers",
  "legal",
  "privacy",
  "terms",
  "challenge",
  "oauth",
  "api",
  "share",
  "sharing",
  "web",
  "graphql",
  "ajax",
  "ads",
]);
const reservedFacebook = new Set([
  "login",
  "logout",
  "sharer",
  "share",
  "dialog",
  "plugins",
  "redirect",
  "r",
  "watch",
  "reel",
  "reels",
  "stories",
  "groups",
  "events",
  "marketplace",
  "help",
  "settings",
  "policies",
  "privacy",
  "developers",
  "oauth",
  "checkpoint",
  "recover",
  "photo",
  "pages",
  "people",
  "ads",
  "business",
]);

// Validate the original authority/path before URL normalization can hide a port,
// backslash, dot segment or percent-encoded resource. Never fetch supplied URLs.
function profileUrl(
  value: string,
  network: "instagram" | "facebook",
): string | undefined {
  if (
    value.length > 500 ||
    [...value].some(
      (char) =>
        char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\",
    )
  )
    return;
  const match = /^https:\/\/([^/?#]+)(\/[^#]*)$/i.exec(value);
  if (
    !match ||
    ![`${network}.com`, `www.${network}.com`].includes(match[1].toLowerCase())
  )
    return;
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash
  )
    return;
  const resource = match[2];
  if (
    network === "facebook" &&
    /^\/profile\.php\?id=[1-9][0-9]{0,19}$/.test(resource)
  ) {
    return `https://www.facebook.com${resource}`;
  }
  const handle = /^\/([A-Za-z0-9_.]+)\/?$/.exec(resource)?.[1];
  if (
    !handle ||
    handle.startsWith(".") ||
    handle.endsWith(".") ||
    handle.includes("..")
  )
    return;
  if (network === "instagram") {
    if (handle.length > 30 || reservedInstagram.has(handle.toLowerCase()))
      return;
  } else if (
    handle.length > 100 ||
    handle.includes("_") ||
    handle.toLowerCase().endsWith(".php") ||
    reservedFacebook.has(handle.toLowerCase())
  )
    return;
  return `https://www.${network}.com/${handle}/`;
}

export function normalizeSocialValue(
  field: SocialField,
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return;
  if (field !== "whatsappComercial")
    return profileUrl(
      value,
      field === "instagramUrl" ? "instagram" : "facebook",
    );
  // Formatted numbers must explicitly begin with +. Canonical input is already
  // international digits. Do not infer a country or reuse the personal phone.
  if (value.length > 64) return;
  const digits = /^\+[1-9][0-9 -]*$/.test(value)
    ? value.slice(1).replace(/[ -]/g, "")
    : value;
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : undefined;
}

export function socialContactErrors(
  input: StoreSocialContact,
): SocialFieldErrors {
  const errors: SocialFieldErrors = {};
  const messages: Record<SocialField, string> = {
    instagramUrl:
      "Ingresá un perfil HTTPS de instagram.com o www.instagram.com, sin publicaciones ni parámetros.",
    facebookUrl:
      "Ingresá un perfil HTTPS de facebook.com o www.facebook.com por nombre o profile.php?id=numérico, sin parámetros adicionales.",
    whatsappComercial:
      "Ingresá el número internacional con código de país, por ejemplo +506 8888-8888. No ingresés un enlace.",
  };
  for (const field of socialFields) {
    if (
      input[field] !== undefined &&
      input[field] !== null &&
      normalizeSocialValue(field, input[field]) === undefined
    )
      errors[field] = messages[field];
  }
  return errors;
}

export function safeStoreSocialContacts(
  input: StoreSocialContact,
): Record<SocialField, string | null> {
  return {
    instagramUrl:
      normalizeSocialValue("instagramUrl", input.instagramUrl) ?? null,
    facebookUrl: normalizeSocialValue("facebookUrl", input.facebookUrl) ?? null,
    whatsappComercial:
      normalizeSocialValue("whatsappComercial", input.whatsappComercial) ??
      null,
  };
}

export function storeSocialLinks(
  input: StoreSocialContact,
): { kind: SocialField; label: string; href: string }[] {
  const safe = safeStoreSocialContacts(input);
  const links = [];
  if (safe.instagramUrl)
    links.push({
      kind: "instagramUrl" as const,
      label: "Instagram",
      href: safe.instagramUrl,
    });
  if (safe.facebookUrl)
    links.push({
      kind: "facebookUrl" as const,
      label: "Facebook",
      href: safe.facebookUrl,
    });
  if (safe.whatsappComercial)
    links.push({
      kind: "whatsappComercial" as const,
      label: "WhatsApp",
      href: `https://wa.me/${safe.whatsappComercial}`,
    });
  return links;
}
