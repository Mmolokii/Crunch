# Archived migrations

These ten migrations (28–29 August 2026) built the schema before this repository had a migration history. Their effects are all contained in `supabase/migrations/00000000000000_baseline.sql`, a dump of the database taken on 17 September 2026.

They were moved here on 31 October 2026 (CRU-34) because replaying them after the baseline fails: they re-create policies the baseline already contains. With them out of the way, `supabase/migrations/` builds a complete database from scratch, which local development, a staging project and CI all rely on.

Kept for history only. Nothing applies them, and production is unaffected: its migrations were applied by hand, and none of its tables or functions change.
