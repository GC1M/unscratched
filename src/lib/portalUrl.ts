/**
 * The trimmed URL when it is http(s) with a host, else null. Only these may be opened as a landlord portal, so a
 * saved value can never launch javascript:, tel:, or another app's scheme. No userinfo ("user@host") either.
 */
export function validatePortalUrl(text: string): string | null {
  const url = text.trim();
  return /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?([/?#]\S*)?$/i.test(url) ? url : null;
}
