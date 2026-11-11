# Database design: review store

Migration `supabase/migrations/20261111100000_readiness_review_store.sql`. Application side: `src/lib/readiness-review/database-store.ts` and `database-config.ts`. It stores review sessions under data contract 1.3.0 unchanged and serves the report input contract (`REPORT-INPUT-CONTRACT.md`).

## Principles

- **The answer log is the truth.** A session is an append-only log of actions. Its state, its Snapshot and every report are recomputed by replaying the log through the ruleset it was recorded under. Nothing derived is stored as truth.
- **Append-only, sequence-checked, idempotent.** Actions are numbered from 0 without gaps, each action id is unique in its session, and an append succeeds only if the log still has the length the writer expected. The database enforces this in one transaction per call, so it holds across any number of server processes.
- **Bound to its ruleset.** Each session points at the complete ruleset it was recorded under (contract, action schema, engine, bank, coverage), stored once and never changed.
- **Fictional only, for now.** The database refuses any session not marked fictional, until MK's method, copy, legal and access decisions (B3 to B7) allow real ones.
- **Lineage for reports.** A report run records which input (by digest and log position) produced which output, so any report can be rebuilt from the log and checked.

## Tables (schema `readiness_review`, not exposed to the Data API)

| Table | Key | Holds | Rules |
|---|---|---|---|
| `rulesets` | `ruleset_key` (SHA-256 of the ruleset's canonical JSON) | the complete ruleset, with its key fields as checked columns | never updated or deleted |
| `sessions` | `session_id` | creation time (exact text and timestamp), organisation label, `fictional` (must be true), contract and engine summary, ruleset key, `action_count`, `last_action_at`, and `link_tokens` (harness only) | only `action_count` and `last_action_at` change, through the append function, and the count never decreases; deleted only by purge |
| `links` | `token_sha256` | role link lookup by hash: session, role, function | never updated; an owner link must name its function |
| `actions` | (`session_id`, `seq`) | each action exactly as recorded (`action` jsonb), with checked copies of id, type, actor, time and question for querying | unique action id per session; type must be in action schema 1; never updated or deleted |
| `report_runs` | `run_id` | input contract, version and digest, log digest and position, ruleset, report engine and version, status, output or failure, who ran it | a generated run carries its output and digest, a failed run its reason; never updated |

Row level security is on for every table with no policies, and every table privilege is revoked from `anon`, `authenticated` and `service_role`. Triggers enforce immutability; deletion is possible only inside `review_purge_session`, which sets a transaction-local flag.

`link_tokens` keeps the raw role links only because the fictional links page shows them; resolving a link never uses it. It is dropped when sign-in and invitations replace links (B3).

## Functions (schema `public`, `security definer`, empty search path, executable by `service_role` only)

| Function | Does | Errors |
|---|---|---|
| `review_create_session(session, ruleset, ruleset_key, links, actions)` | stores the ruleset if new (refusing a different ruleset under the same key), the session, its links and its first actions, all or nothing | `RV422` invalid input or numbering gap; `23505` a session id or link that exists; `23514` a constraint, for example not fictional |
| `review_append_actions(session_id, expected_length, actions)` | locks the session row, checks the length, appends, updates the count | `RV404` unknown session; `RV409` the log changed; `RV422` gap or empty; `23505` a repeated action id |
| `review_load_session(session_id)` | the record in the application's shape, actions in order | none; null if absent |
| `review_find_link(token_sha256)` | session, role and function for a link | none; null if unknown |
| `review_action_count(session_id)` | the stored log length | none; null if absent |
| `review_record_report_run(run)` | records a run against the session's ruleset | `RV404`; `RV422` input ahead of the stored log; `23514` output or failure missing |
| `review_report_runs(session_id)` | runs, newest first, without outputs | none |
| `review_purge_session(session_id)` | retention: removes a session with its links, log and runs | none; false if absent |

## Application side

- **Selection.** `MK_READINESS_REVIEW_STORE=database` with `MK_READINESS_REVIEW_HARNESS=fictional-local`. Without it, the file harness is used as before, and a production runtime still refuses both.
- **Configuration fails closed.** `MK_READINESS_REVIEW_DB_URL`, `MK_READINESS_REVIEW_DB_SERVICE_KEY` and `MK_READINESS_REVIEW_DB_PROJECT_REF` must all be set; the address must be `https://<ref>.supabase.co` for the declared reference; and the reference of the project that preview and production share (`iszihmmbgsfefawqmnwo`) is refused until B2 is resolved. A refusal is reported as an unavailable store: nothing is stored. The key is server-only.
- **Links by hash.** The store sends SHA-256 hashes of role links; the lookup never sees a raw link.
- **Errors say what happened.** A database error means nothing changed, and the message says so. A lost response is different, because the write may have happened: the store reads the log back and reports what is actually stored (saved, conflict, or not saved). Only if it cannot read back either does it say the outcome is unknown and ask for a reload, never "nothing was recorded".
- **Several server processes.** The service caches replayed sessions. With the database store it checks the stored log length before using a cached session and rebuilds it if another process has written since.
- **Notice.** Review pages name where answers are stored: files on this computer, or an isolated test database.

## What was verified, and where

| Check | Where | Result |
|---|---|---|
| Migration applied; every function body identical to the file (MD5 of each `prosrc`) | temporary hosted project `mk-review-store-temp` (`zuqegvsfhzgcydyivnqv`), PostgreSQL 17.11 | identical, 10 of 10 |
| Grants: `anon` and `authenticated` cannot execute any store function; `service_role` can | same | as designed |
| Database-level tests `scripts/readiness-review-database-sql-tests.sql` (sequence, immutability, all-or-nothing creation, fictional only, report runs, access by role, retention) | same | 41 of 41 |
| Security advisor | same | one INFO lint, RLS on with no policies, which is the intended deny-all design |
| Performance advisor | same | two unindexed ruleset foreign keys, indexed; three indexes unused on an empty database |
| The public key over the real API: every store function refused, the tables' schema not exposed | same, `scripts/readiness-review-database-tests.mjs --access-denied` | 8 of 8 refused (`42501`); tables `PGRST106` |
| Store, service and lineage tests `scripts/readiness-review-database-tests.mjs` (round trip identical to the file harness, sequence checks, lost responses, concurrent starts and saves, the service end to end with a write from another process, report lineage, links by hash, purge) | local embedded Postgres 17.5 (PGlite) with the same migration and the Supabase roles | 9 of 9; access check 16 of 16 refused |
| Report input contract | contract tests | C-23 pass; 23 of 23 |

## Not yet verified

- **The store and service tests over the hosted API.** They need the temporary project's service-role key, which this session cannot obtain (the Supabase connection exposes only public keys). Granting the public role access to the store for a test was refused by the session's permission checks, and was not worked around. With the key set as `MK_READINESS_REVIEW_DB_SERVICE_KEY`, the same script runs unchanged against the hosted project.
- **True parallel transactions.** On the embedded database calls run one after another. The outcome under parallel connections is decided by the same row lock and constraints, but it has only been exercised through the file harness and the embedded database.
- **The browser journeys on the database store.** They need a server bound to a hosted project with the service key.
- **Backups, point-in-time recovery and retention periods.** None was configured or tested; the organisation is on the free plan. Retention periods are MK's decision.
- **Performance at scale.** Loading returns the whole log; a session has a few hundred actions at most, which is small.

## Release status

B1 (durable persistence) is implemented and verified on an isolated project at the database level. Hosted use still depends on B2 (staging isolation), B3 (authenticated access), a service key held only by the server, and MK's backup and retention decisions. The migration must not be applied to the shared project until B2 is resolved.

## The temporary project

`mk-review-store-temp` (`zuqegvsfhzgcydyivnqv`, eu-west-1, free plan) was created on 11 November 2026 for this work with the owner's consent, because branching needs a paid plan. It holds the store migration and nothing else: every test session was purged, and one test ruleset row (key `aaaa…`) remains because rulesets are never deleted. It is to be deleted when MK no longer needs it.

## Applying it to a new isolated project

1. Create the project and confirm it is not `iszihmmbgsfefawqmnwo`.
2. Apply `supabase/migrations/20261111100000_readiness_review_store.sql`.
3. Run `scripts/readiness-review-database-sql-tests.sql` as the owner: every row must be `ok`.
4. Run `scripts/readiness-review-database-tests.mjs --access-denied` with the public key, then the full script with the service key.
