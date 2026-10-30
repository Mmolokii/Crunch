/**
 * The one rule for which calendar feed URLs Crunch will ever fetch (CRU-23).
 * Checked when a URL is saved AND again right before every fetch, so a value
 * that reached the database some other way (a legacy row, a direct write
 * before the grant was revoked) still can't point the server anywhere else.
 *
 * Allowed: https only, a host on the allow-list, a Brightspace calendar feed
 * path, no credentials in the URL, default port only.
 */

const DEFAULT_ALLOWED_HOSTS = "brightspace.myemeris.edu.za";
const FEED_PATH = /^\/d2l\/le\/calendar\/feed\/[^\s]+$/i;

/**
 * Comma-separated hostnames from ICS_ALLOWED_HOSTS. An entry starting with
 * "*." matches any subdomain of the rest (not the bare domain itself).
 */
function allowedHosts(): string[] {
  return (process.env["ICS_ALLOWED_HOSTS"] ?? DEFAULT_ALLOWED_HOSTS)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts().some((entry) =>
    entry.startsWith("*.") ? host.endsWith(entry.slice(1)) : host === entry,
  );
}

export function isAllowedFeedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    hostAllowed(url.hostname) &&
    FEED_PATH.test(url.pathname)
  );
}
