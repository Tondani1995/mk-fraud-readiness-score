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

## Running the tests

`scripts/readiness-review-database-tests.mjs` runs the same scenarios against one backend, chosen explicitly. There is no default and no fallback.

| Mode | What it runs against | Settings |
|---|---|---|
| `MK_REVIEW_TEST_BACKEND=local` | Embedded Postgres 17.5 (PGlite, `scripts/lib/readiness-review-pglite-client.mjs`, unchanged apart from two added helpers) with this migration and the Supabase API roles. Nothing is sent over the network; hosted settings in the environment are ignored. | `MK_PGLITE_DIR`, a folder where `@electric-sql/pglite@0.3` is installed outside the project |
| `MK_REVIEW_TEST_BACKEND=hosted` | The authorised temporary project `zuqegvsfhzgcydyivnqv` only, through the existing RPC interface (`DatabaseReviewStore` over PostgREST) with the server-side secret key | `MK_READINESS_REVIEW_DB_URL`, `MK_READINESS_REVIEW_DB_PROJECT_REF`, `MK_REVIEW_TEST_PUBLIC_KEY`, and the secret key as `MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE` (a file readable only by its owner) or `MK_READINESS_REVIEW_DB_SERVICE_KEY` |

The hosted mode fails closed (`scripts/lib/readiness-review-test-backends.mjs`). Before any test it refuses: a missing mode or setting; any project other than `zuqegvsfhzgcydyivnqv`, pinned in code, including the shared preview and production project; an address that is not `https://zuqegvsfhzgcydyivnqv.supabase.co`; a public key in the secret key setting; a key issued for another project; the same value for both keys; a key file other users can read; and both key settings at once. Over the network it then requires that every answer comes from the authorised project (the gateway's `sb-project-ref` header), that the public key is refused by the store (`42501`), that the secret key can execute the store functions, and that the interface lists all eight. A refusal stops the run with exit code 2. Without the secret key, the public-key checks run and every other test is reported as blocked, with exit code 3 and the configuration steps; a blocked test is never reported as a pass.

For the signed-in role the hosted mode creates a temporary fictional user (`mk-review-test-…@example.invalid`) with the secret key, signs it in with the public key, and deletes it at the end. Nothing is granted to any role for testing.

| Scenario | Tests |
|---|---|
| Harness | H.1 store configuration fails closed; H.2 test configuration fails closed (19 cases) |
| 1 Creation, retrieval, ordered appends, corrections | S1.1 round trip identical to the file harness; S1.2 ordered appends; S1.3 correction history; S1.4 links by hash |
| 2 Concurrency, stale saves, retries, ambiguous responses | S2.1 stale and repeated saves; S2.2 lost responses at the store; S2.3 24 concurrent starts and 12 concurrent saves; S2.4 retries through the service after a lost or unconfirmed save; S2.5 the service end to end, with a write from another process |
| 3 Denial of unauthorised roles | S3.1 the public role (needs only the public key); S3.2 public and signed-in roles against a stored session, and no table route even with the secret key |
| 4 The complete report input | S4.1 a stored session with owner answers, evidence and conclusions: all 902 controls, states kept distinct |
| 5 Determinism and lineage | S5.1 a fixed fictional session gives the same input digest on every load, replay and backend (`cb2180f5…`); S5.2 report runs recorded exactly, rebuilt from the stored prefix, invalid runs refused |
| 6 No unsupported conclusions | S6.1 gaps are reported practice only, conclusions only from recorded reviews; S6.2 a reviewer record written straight to the store for an unasked control |
| 7 Immutability, purge, errors | S7.1 changes refused through the interface; S7.2 explicit, complete purge; S7.3 the owner-level SQL suite (local here; hosted through the management connection); S7.4 every stored record read back, screened for personal data, purged |

Every record is fictional and labelled so, is screened for email addresses, phone, identity and account numbers before it is sent and again when read back (S7.4), and is purged before the script ends.

## What was verified, and where

| Check | Where | Result |
|---|---|---|
| Migration applied; every function body identical to the file (MD5 of each `prosrc`) | temporary hosted project `mk-review-store-temp` (`zuqegvsfhzgcydyivnqv`), PostgreSQL 17.11 | identical, 10 of 10 |
| Security model as deployed: the eight functions executable by `service_role` only, security definer, empty search path; RLS on all five tables with no policies; no table privilege and no schema usage for `anon`, `authenticated` or `service_role` | same, catalogue query as the owner | as designed |
| Owner-level suite `scripts/readiness-review-database-sql-tests.sql` (sequence, immutability, all-or-nothing creation, fictional only, report runs, access by role, retention) | same, as the owner; and local (S7.3) | 42 of 42 on both (the first hosted record said 41 of 41; it listed 42 rows, all ok) |
| The integration suite, local backend | embedded Postgres 17.5 | 22 of 22, twice; access mode 3 of 3 |
| The integration suite, hosted backend, without the secret key | the temporary project over its API | H.1, H.2 and S3.1 pass (every function refused with `42501` for the public key; table routes refused with `PGRST106` and `PGRST205`); 18 tests blocked; S7.3 not applicable through the API |
| Fail-closed refusals of the hosted mode | real runs | no mode, missing settings, a public key as the secret, the shared project: each refused with exit code 2 before any network call |
| Inventory of the hosted project | as the owner | sessions, links, actions, runs, users, public tables and storage objects all 0; one ruleset row |
| Security advisor | same | one INFO lint, RLS on with no policies, which is the intended deny-all design |
| Report input contract | contract tests | C-23 pass; 23 of 23 |

## Not yet verified

- **The hosted integration suite with the secret key (18 tests, including S3.2 for the signed-in role).** The session has no secret key for the temporary project; the Supabase connection exposes only public keys, and granting the public role access for a test was refused by the session's permission checks and not worked around. The steps are in `scripts/lib/readiness-review-test-backends.mjs` (printed by any hosted run without the key): create a secret key for `zuqegvsfhzgcydyivnqv`, save it in a file readable only by its owner, run with `MK_REVIEW_TEST_BACKEND=hosted` and the settings above, then delete the key.
- **True parallel transactions.** On the embedded database calls run one after another. S2.3 decides the same contest by the same row lock and constraints, but parallel connections are exercised only by the hosted run.
- **The browser journeys on the database store.** They need a server bound to a hosted project with the secret key.
- **Backups, point-in-time recovery and retention periods.** None was configured or tested; the organisation is on the free plan. Retention periods are MK's decision.
- **Performance at scale.** Loading returns the whole log; a session has a few hundred actions at most, which is small.

## Known limits that remain by design

- **The store checks shape and sequence, not meaning.** It refuses malformed, out-of-order, repeated or non-fictional records, but it does not re-run the review rules. A caller holding the secret key can append an action the service would refuse, such as a reviewer conclusion on a control never asked (S6.2). Replay applies it, and the report input marks it as made against no answer (`forVersion: null`, not current) and keeps it out of gaps, findings and tasks. The service, which validates every action, is the only writer; the key stays on the server.
- **The ruleset key is computed by the application.** The database refuses a different ruleset under a key it already holds, but it cannot recompute the canonical digest, so the first writer of a key is trusted. Only the secret key can write.
- **Rulesets are never deleted.** Purge removes sessions, links, logs and runs; each test run on the hosted project leaves the ruleset it used, which holds only the contract, engine, bank and coverage identifiers.

## Release status

B1 (durable persistence) is implemented and verified on an isolated project at the database level. Hosted use still depends on B2 (staging isolation), B3 (authenticated access), a service key held only by the server, and MK's backup and retention decisions. The migration must not be applied to the shared project until B2 is resolved.

## The temporary project

`mk-review-store-temp` (`zuqegvsfhzgcydyivnqv`, eu-west-1, free plan) was created on 11 November 2026 for this work with the owner's consent, because branching needs a paid plan. It holds the store migration and nothing else: every test session was purged, and one test ruleset row (key `aaaa…`) remains because rulesets are never deleted. It is to be deleted when MK no longer needs it.

## Applying it to a new isolated project

1. Create the project and confirm it is not `iszihmmbgsfefawqmnwo`.
2. Apply `supabase/migrations/20261111100000_readiness_review_store.sql`.
3. Run `scripts/readiness-review-database-sql-tests.sql` as the owner: all 42 rows must be `ok`.
4. Add the project's reference to the pinned value in `scripts/lib/readiness-review-test-backends.mjs` only if MK authorises it as a test project, then run `scripts/readiness-review-database-tests.mjs` with `MK_REVIEW_TEST_BACKEND=hosted`, the public key and the secret key: the verdict must be `PASS` with nothing blocked.
