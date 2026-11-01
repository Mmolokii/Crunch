/**
 * CRU-59: does production's schema match supabase/migrations?
 *
 * Migrations are applied to production by hand, so nothing records whether
 * they all landed, or whether someone changed production directly. This
 * fingerprints the public schema (columns, constraints, indexes, RLS,
 * policies, functions, triggers, grants) as one row per object with an md5
 * of its definition: no data, no personal information.
 *
 *   bun run db:fingerprint --sql              # print the query; run it in the
 *                                             # production SQL editor (read-only)
 *                                             # and export the result as CSV
 *   bun run db:fingerprint --compare prod.csv # compare with the local database
 *                                             # (after bun run db:start)
 *   bun run db:fingerprint                    # print the local fingerprint
 */
import { readFileSync } from "node:fs";

export const QUERY = `
WITH t AS (
  SELECT c.oid, c.relname::text AS name, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
)
SELECT kind, name, md5(def) AS hash FROM (
  SELECT 'columns' AS kind, t.name,
         string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) ||
                    CASE WHEN a.attnotnull THEN ' not null' ELSE '' END ||
                    COALESCE(' default ' || pg_get_expr(d.adbin, d.adrelid), ''),
                    ', ' ORDER BY a.attname) AS def
  FROM t JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  GROUP BY t.name
  UNION ALL
  SELECT 'constraints', t.name, string_agg(pg_get_constraintdef(k.oid), ', ' ORDER BY pg_get_constraintdef(k.oid))
  FROM t JOIN pg_constraint k ON k.conrelid = t.oid GROUP BY t.name
  UNION ALL
  SELECT 'indexes', t.name, string_agg(pg_get_indexdef(i.indexrelid), ', ' ORDER BY pg_get_indexdef(i.indexrelid))
  FROM t JOIN pg_index i ON i.indrelid = t.oid GROUP BY t.name
  UNION ALL
  SELECT 'rls', t.name, t.relrowsecurity::text || ' force=' || t.relforcerowsecurity::text FROM t
  UNION ALL
  SELECT 'policy', p.tablename || '.' || p.policyname,
         p.cmd || ' ' || p.permissive || ' ' || p.roles::text || ' using ' ||
         COALESCE(p.qual, '') || ' check ' || COALESCE(p.with_check, '')
  FROM pg_policies p WHERE p.schemaname = 'public'
  UNION ALL
  SELECT 'function', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
  UNION ALL
  SELECT 'trigger', t.name || '.' || g.tgname, pg_get_triggerdef(g.oid)
  FROM t JOIN pg_trigger g ON g.tgrelid = t.oid AND NOT g.tgisinternal
  UNION ALL
  SELECT 'grants', c.relname::text,
         COALESCE((SELECT string_agg(r.rolname || '=' || a.privilege_type, ',' ORDER BY r.rolname, a.privilege_type)
                   FROM aclexplode(c.relacl) a JOIN pg_roles r ON r.oid = a.grantee
                   WHERE r.rolname IN ('anon', 'authenticated')), '')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v')
) x
ORDER BY kind, name;
`;

function local(): Map<string, string> {
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
      "-F",
      ",",
    ],
    { stdin: new TextEncoder().encode(QUERY), stderr: "pipe" },
  );
  if (proc.exitCode !== 0) {
    console.error(
      `Couldn't query the local database. Is it running (bun run db:start)?\n${proc.stderr}`,
    );
    process.exit(1);
  }
  return parse(proc.stdout.toString());
}

// kind,name,hash per line; names can contain commas (function signatures),
// so split on the first and last comma. A CSV header row is skipped.
function parse(text: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/"/g, "");
    const first = line.indexOf(",");
    const last = line.lastIndexOf(",");
    if (first < 0 || first === last || line.startsWith("kind,")) continue;
    rows.set(`${line.slice(0, first)} ${line.slice(first + 1, last)}`, line.slice(last + 1));
  }
  return rows;
}

const args = process.argv.slice(2);
if (args[0] === "--sql") {
  console.log(QUERY.trim());
} else if (args[0] === "--compare") {
  if (!args[1]) {
    console.error("Usage: bun run db:fingerprint --compare <exported.csv>");
    process.exit(1);
  }
  const prod = parse(readFileSync(args[1], "utf8"));
  const mine = local();
  const lines: string[] = [];
  for (const [key, hash] of mine) {
    if (!prod.has(key)) lines.push(`  only in the migrations: ${key}`);
    else if (prod.get(key) !== hash) lines.push(`  different:              ${key}`);
  }
  for (const key of prod.keys()) if (!mine.has(key)) lines.push(`  only in production:     ${key}`);
  if (lines.length === 0) {
    console.log(`Production matches the migrations (${mine.size} objects).`);
  } else {
    console.log(
      `${lines.length} difference(s) out of ${mine.size} objects:\n${lines.sort().join("\n")}`,
    );
    process.exit(1);
  }
} else {
  for (const [key, hash] of local()) console.log(`${key} ${hash}`);
}
