/** Formats an API instant for Costa Rica without changing the original value. */
export function costaRicaDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
}
