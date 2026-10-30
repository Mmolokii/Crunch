/**
 * One-off for CRU-23: re-encrypts calendar_sources rows still stored as
 * plaintext URLs (saved before CRU-9 added encryption). Once it reports zero
 * plaintext rows, decryptIcsUrl's legacy fallback can be removed.
 *
 * Usage (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ICS_URL_ENCRYPTION_KEY):
 *   bun run scripts/reencrypt-legacy-ics-urls.ts            # dry run
 *   bun run scripts/reencrypt-legacy-ics-urls.ts --apply    # write changes
 *
 * Prints row ids and whether each URL passes the feed allow-list, never the
 * URLs themselves (they grant read access to a student's calendar).
 */
// Bun loads .env automatically — no dotenv package needed.
import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { encryptIcsUrl } from "../src/lib/ics-encryption";
import { isAllowedFeedUrl } from "../src/lib/ics-url";

const ENCRYPTED_SHAPE = /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

async function main() {
  const apply = process.argv.includes("--apply");
  const { data: rows, error } = await supabaseAdmin
    .from("calendar_sources")
    .select("id, ics_url_encrypted");
  if (error) throw new Error(error.message);

  const plaintext = (rows ?? []).filter((r) => !ENCRYPTED_SHAPE.test(r.ics_url_encrypted));
  console.log(`${rows?.length ?? 0} rows, ${plaintext.length} still plaintext.`);

  for (const row of plaintext) {
    const allowed = isAllowedFeedUrl(row.ics_url_encrypted);
    console.log(`  ${row.id}  allow-listed: ${allowed ? "yes" : "NO — sync will refuse it"}`);
    if (!apply) continue;
    const { error: updateError } = await supabaseAdmin
      .from("calendar_sources")
      .update({ ics_url_encrypted: encryptIcsUrl(row.ics_url_encrypted) })
      .eq("id", row.id);
    if (updateError) throw new Error(`${row.id}: ${updateError.message}`);
  }

  if (!apply && plaintext.length > 0) console.log("\nDry run — rerun with --apply to encrypt.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
