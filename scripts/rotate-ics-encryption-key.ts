/**
 * Re-encrypts every calendar_sources row from the current ICS_URL_ENCRYPTION_KEY
 * to a new one (CRU-28, runbook step "Rotate the calendar URL encryption key").
 * Without this, changing the key in Vercel leaves every saved feed unreadable.
 *
 * Usage (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ICS_URL_ENCRYPTION_KEY
 * set to the CURRENT key, and NEW_ICS_URL_ENCRYPTION_KEY set to the new one):
 *   bun run scripts/rotate-ics-encryption-key.ts            # dry run: checks every row decrypts
 *   bun run scripts/rotate-ics-encryption-key.ts --apply    # writes the re-encrypted rows
 *
 * Then set ICS_URL_ENCRYPTION_KEY to the new key in Vercel and redeploy. Rows
 * saved between --apply and the redeploy are encrypted with the old key; run
 * the script again with the keys swapped to catch them, or pause signups first.
 *
 * Prints row ids only, never the URLs (they grant read access to a calendar).
 */
// Bun loads .env automatically — no dotenv package needed.
import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { decryptIcsUrl, encryptIcsUrl } from "../src/lib/ics-encryption";
import { isAllowedFeedUrl } from "../src/lib/ics-url";

function withKey<T>(key: string, fn: () => T): T {
  const previous = process.env["ICS_URL_ENCRYPTION_KEY"];
  process.env["ICS_URL_ENCRYPTION_KEY"] = key;
  try {
    return fn();
  } finally {
    process.env["ICS_URL_ENCRYPTION_KEY"] = previous;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const oldKey = process.env["ICS_URL_ENCRYPTION_KEY"];
  const newKey = process.env["NEW_ICS_URL_ENCRYPTION_KEY"];
  if (!oldKey || !newKey) {
    throw new Error("Set ICS_URL_ENCRYPTION_KEY (current) and NEW_ICS_URL_ENCRYPTION_KEY (new).");
  }
  if (oldKey === newKey) throw new Error("The new key is the same as the current one.");
  // Fails fast on a malformed new key before touching any row.
  withKey(newKey, () => encryptIcsUrl("https://example.invalid/"));

  const { data: rows, error } = await supabaseAdmin
    .from("calendar_sources")
    .select("id, ics_url_encrypted");
  if (error) throw new Error(error.message);

  // decryptIcsUrl returns its input unchanged when it can't decrypt, so a row
  // only counts as readable if the result is a URL the sync would accept.
  const prepared = (rows ?? []).map((row) => {
    const plain = withKey(oldKey, () => decryptIcsUrl(row.ics_url_encrypted));
    return { id: row.id, plain, readable: isAllowedFeedUrl(plain) };
  });
  const unreadable = prepared.filter((r) => !r.readable);

  console.log(`${prepared.length} rows, ${unreadable.length} not readable with the current key.`);
  for (const row of unreadable) console.log(`  ${row.id}  NOT readable, will be left as is`);
  if (!apply) {
    console.log("\nDry run. Rerun with --apply to re-encrypt the readable rows.");
    return;
  }

  for (const row of prepared.filter((r) => r.readable)) {
    const { error: updateError } = await supabaseAdmin
      .from("calendar_sources")
      .update({ ics_url_encrypted: withKey(newKey, () => encryptIcsUrl(row.plain)) })
      .eq("id", row.id);
    if (updateError) throw new Error(`${row.id}: ${updateError.message}`);
    console.log(`  ${row.id}  re-encrypted`);
  }
  console.log("\nDone. Now set ICS_URL_ENCRYPTION_KEY to the new key in Vercel and redeploy.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
