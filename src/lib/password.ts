/**
 * The password rule the Crunch forms show (CRU-64). A convenience for students:
 * the real minimum is Supabase Auth's own setting, which a direct API call
 * can't get around. Keep the two the same (docs/go-live-checklist.md).
 */
export const MIN_PASSWORD_LENGTH = 10;

/** How recent a password sign-in must be to delete an account (CRU-69). */
export const PASSWORD_CONFIRMATION_SECONDS = 5 * 60;

/**
 * Whether a token's `amr` claim shows a password sign-in within the window.
 * Refreshing a session keeps the original time, so an old session can't pass.
 */
export function passwordConfirmedRecently(amr: unknown, nowMs = Date.now()): boolean {
  if (!Array.isArray(amr)) return false;
  const now = nowMs / 1000;
  return amr.some((entry: { method?: unknown; timestamp?: unknown }) => {
    if (entry?.method !== "password" || typeof entry.timestamp !== "number") return false;
    return entry.timestamp <= now + 60 && now - entry.timestamp <= PASSWORD_CONFIRMATION_SECONDS;
  });
}

/** What's wrong with a new password, or null if the form may submit it. */
export function passwordProblem(password: string, repeated?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (repeated !== undefined && password !== repeated) {
    return "Those passwords don't match.";
  }
  return null;
}
