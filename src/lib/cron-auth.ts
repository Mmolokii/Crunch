/**
 * Checks the nightly sync's bearer token in constant time (CRU-35). A plain
 * === comparison returns as soon as one character differs, which in principle
 * lets an attacker recover the secret from response timings. Both sides are
 * hashed first, so the comparison also doesn't leak the secret's length.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false; // never allow the route to run wide open if unconfigured
  return timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${secret}`));
}

/** Runs fn over items with at most `limit` in flight, keeping results in input order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
