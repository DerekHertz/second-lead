# Supabase: schema, row-level security, tests

Local Supabase (Docker) for Second Lead's database. The spec is `docs/mvp.md` ("Data", "Security and privacy"). Nothing here needs a hosted project.

## Commands

The CLI is pinned and run through `npx`, from the repo root. It is not a package dependency.

```sh
npx --yes supabase@2.122.0 start        # first run pulls images (can take minutes); applies migrations and seed.sql
npx --yes supabase@2.122.0 db reset     # drop, re-run every migration, re-seed (a clean-database check)
npx --yes supabase@2.122.0 test db      # run supabase/tests/database/*.test.sql (pgTAP)
npx --yes supabase@2.122.0 stop         # stop and remove the containers
```

Only the services the schema needs run: Postgres, the API gateway and Auth (Auth owns `auth.users`). Studio, Realtime, Storage, mail, Edge Functions and analytics are disabled in `config.toml`.

## What is here

| Path | What |
|---|---|
| `migrations/20261029120000_schema.sql` | learner, scene, character, line, take, line_attempt |
| `migrations/20261029120100_rls.sql` | grants, row-level security (enabled and forced), policies |
| `migrations/20261029120200_signup_trigger.sql` | a `learner` row for every new auth user |
| `migrations/20261029120300_views.sql` | `line_support` and `research_stats` |
| `seed.sql` | one fixture starter scene (owner_id null). Seeding the real starter scenes from `content/scenes/` comes with that content. |
| `tests/database/` | pgTAP tests, one file per concern |

`line_attempt.created_at` is the one column beyond the `docs/mvp.md` list: it orders a line's attempt history.

## Who can do what

| Data | anon (signed out) | authenticated learner | Migrations / service_role |
|---|---|---|---|
| Starter scenes, characters, lines (`owner_id` null) | read | read | write |
| Imported scenes, characters, lines | none | owner reads and writes | all |
| `learner` | none | read own; update `display_name`, `speech_pref`, `research_opt_in` of own | all |
| `take` | none | read own; insert own (on a starter scene or an own scene, not setting timestamps); update only `ended_at`, `checkin`, `checkin_note`; no delete | all |
| `line_attempt` | none | read own; insert own; **no update, no delete** | all |
| `line_support` view | none | own rows | all |
| `research_stats` view | none | **none** | read |

Mechanics worth knowing:

- Every table has row-level security enabled **and forced**, and `anon`/`authenticated` get no default privileges in `public` (see `20261029120100_rls.sql`). Starter rows have a null owner, so no write policy matches them: only migrations (the database owner) and `service_role` write them.
- Ownership chains are foreign keys where a policy can't see across rows: a line's speaker and a take's role are characters of the same scene (composite keys), and the `line_attempt` insert policy checks the take is the caller's and the line is in the take's scene.
- Append-only is enforced by privileges: `authenticated` holds only INSERT and SELECT on `line_attempt`. A learner cannot delete attempts one by one. Deleting the **account** still removes them, and so does deleting an imported scene (cascade).
- Deleting a learner: delete the `auth.users` row (the Auth admin API or `service_role`). It cascades `auth.users` to `learner` to their scenes (with characters and lines) and takes (with line attempts). Learners have no `DELETE` on their own `learner` row: removing it alone would orphan the auth user. An "erase my account" button needs an Edge Function that calls the admin API (a later issue).
- Server-owned columns are not insertable or updatable by learners (column grants): `line_attempt.created_at` (so history order can't be rewritten), `take.started_at`/`ended_at` at insert, `take.scene_id`/`role_id`/`mode`, `scene.source`/`owner_id`/`created_at`, `learner.id`/`created_at`.
- Learner-supplied numbers that feed `research_stats` are bounded by constraints so the view can't overflow for the maintainer: a take lasts at most 24 hours, `response_ms` is 0 to 3,600,000, and `hints` has exactly `meaning`, `slower`, `replay`, each a whole number 0 to 1000.
- Functions are private by default (`alter default privileges revoke execute on functions from public`). A function meant for the API needs an explicit `grant execute`; a test fails if any function in `public` is callable by `anon` or `authenticated`. Check this when a later migration installs an extension.
- Deleting an imported scene also deletes the takes and attempts on it: it is the learner's own data and mvp.md gives the owner write access to imported scenes.
- `handle_new_user()` is `security definer` with `search_path = ''` and not executable by `anon` or `authenticated`.

## Support level

`line_support` has one row per learner per line they have attempted, derived from `line_attempt` (no stored progress). Levels: 3 = characters + pinyin + English, 2 = characters + pinyin, 1 = English only, 0 = nothing.

Rule: take the learner's latest attempt on the line (by `created_at`). If it passed, the line is one level below the level it was attempted at (never below 0); if it did not, it stays at that level. A manual raise or lower by the learner is the `support_level` logged on their next attempt, so it flows through the same history; a flipped verdict is the logged `passed` (`judged_by = 'self'`). A line with no attempts has no row, and the client treats it as level 3. The view is `security_invoker`, so row-level security on `take` and `line_attempt` limits it to the caller's own rows.

## Research stats and the maintainer

`research_stats` has one row per take of every learner with `research_opt_in = true`: day (UTC), mode, improv level, scene source (`starter`/`paste`/`subtitle`), duration in seconds, check-in number, attempt and pass counts, pass rate, averages (syllable match, tone score, support level, response ms) and hint counts. No text (no `heard_text`, `variation_text`, `checkin_note`, hanzi, titles, names) and no IDs (no learner, take, scene or line id). Opting out removes a learner's rows at once.

**Maintainer access (a choice the docs did not settle).** The view runs with its owner's rights (it is deliberately not `security_invoker`, since it must read other learners' rows) and the only grant on it is `SELECT` to `service_role`. `anon` and `authenticated` hold no privilege on it, so the API refuses them. The maintainer reads it with the `service_role` key (server side or a script, never in the browser or the PWA bundle) or as the database owner in `psql`/SQL editor. This needs no extra service or claim. If a maintainer dashboard inside the app is wanted later, give the maintainer an `app_metadata` claim and read through an Edge Function that holds the service key. With very few opted-in learners, per-take rows can still be re-identified by context; that is a consent-copy matter for the opt-in screen.

## Tests

pgTAP files run in a transaction and roll back, so they leave no data. They create their own users, scenes and takes with fixed IDs and do not depend on `seed.sql`, except `08_seed.test.sql`, which checks the seeded fixture (run after `start` or `db reset`).

| File | Covers |
|---|---|
| `01_schema.test.sql` | tables and columns, forced RLS, explicit grants, signup trigger, locked `search_path` |
| `02_learner.test.sql` | a learner reads and updates only their own row, cannot change `id` |
| `03_scenes_rls.test.sql` | anon reads starter content only; owners read and write their own; starter rows immutable |
| `04_takes_attempts_rls.test.sql` | takes and attempts private to the learner; ownership chains; attempts append-only |
| `05_support_level.test.sql` | the support-level rule and its isolation |
| `06_research_stats.test.sql` | opted-in learners only; no text or ID columns; maintainer-only access |
| `07_account_delete.test.sql` | deleting an account removes every row the learner owns and nothing else |
| `08_seed.test.sql` | the seeded fixture scene |
