/**
 * The password rule the Crunch forms show (CRU-64). A convenience for students:
 * the real minimum is Supabase Auth's own setting, which a direct API call
 * can't get around. Keep the two the same (docs/go-live-checklist.md).
 */
export const MIN_PASSWORD_LENGTH = 10;

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
