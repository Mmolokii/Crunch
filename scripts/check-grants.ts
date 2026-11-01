/**
 * CRU-56: checks what the API roles (anon, authenticated) may do in the
 * local database against the committed snapshot in supabase/grants.txt, and
 * that every public table has RLS on.
 *
 * Supabase's default privileges grant anon and authenticated ALL on every new
 * table and EXECUTE on every new function, so a migration that forgets its
 * REVOKE/GRANT silently opens the table to both roles (RLS is then the only
 * guard). This makes that a CI failure, and every grant change a reviewed
 * diff of grants.txt.
 *
 * Usage (after `bun run db:start`):
 *   bun run db:grants            # compare; exits 1 on any difference
 *   bun run db:grants --update   # rewrite supabase/grants.txt after an intended change
 *
 * The same QUERY, run in the production SQL editor (it only reads), should
 * print the same lines (CONTRIBUTING.md, "Database changes").
 */
import { readFileSync, writeFileSync } from "node:fs";

const SNAPSHOT = "supabase/grants.txt";

const QUERY = `
WITH roles(name) AS (VALUES ('anon'), ('authenticated')),
objects AS (
  SELECT 'table' AS kind, c.relname::text AS name,
         COALESCE(c.relacl, acldefault('r', c.relowner)) AS acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
  UNION ALL
  SELECT 'sequence', c.relname, COALESCE(c.relacl, acldefault('s', c.relowner))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S'
  UNION ALL
  SELECT 'function', p.oid::regprocedure::text, COALESCE(p.proacl, acldefault('f', p.proowner))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
)
SELECT o.kind || ' ' || o.name || ' ' || r.name || ' ' ||
       string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
FROM objects o
CROSS JOIN LATERAL aclexplode(o.acl) a
JOIN roles r ON a.grantee = 0 OR a.grantee = r.name::regrole
GROUP BY o.kind, o.name, r.name
UNION ALL
SELECT 'rls-off ' || c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
ORDER BY 1;
`;

const projectId = readFileSync("supabase/config.toml", "utf8").match(
  /^project_id\s*=\s*"([^"]+)"/m,
)?.[1];
const proc = Bun.spawnSync(
  [
    "docker",
    "exec",
    "-i",
    `supabase_db_${projectId}`,
    "psql",
    "-U",
    "postgres",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { stdin: new TextEncoder().encode(QUERY), stderr: "pipe" },
);
if (proc.exitCode !== 0) {
  console.error(
    `Couldn't query the local database. Is it running (bun run db:start)?\n${proc.stderr}`,
  );
  process.exit(1);
}
const actual = proc.stdout.toString();

if (process.argv.includes("--update")) {
  writeFileSync(SNAPSHOT, actual);
  console.log(`Wrote ${SNAPSHOT}. Review the diff before committing.`);
  process.exit(0);
}

const expected = readFileSync(SNAPSHOT, "utf8");
if (actual === expected) {
  console.log(`API-role grants match ${SNAPSHOT}.`);
  process.exit(0);
}
const want = new Set(expected.split("\n").filter(Boolean));
const have = new Set(actual.split("\n").filter(Boolean));
for (const line of have) if (!want.has(line)) console.log(`+ ${line}`);
for (const line of want) if (!have.has(line)) console.log(`- ${line}`);
console.error(
  `\nAPI-role grants differ from ${SNAPSHOT} (+ in the database, - in the snapshot).\n` +
    "Add the missing REVOKE/GRANT to your migration, or, if the change is intended,\n" +
    "run `bun run db:grants --update` and commit the new snapshot.",
);
process.exit(1);
