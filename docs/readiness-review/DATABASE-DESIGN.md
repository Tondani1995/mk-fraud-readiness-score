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
| `MK_REVIEW_TEST_BACKEND=hosted` | The authorised temporary project `zuqegvsfhzgcydyivnqv` only, through the existing RPC interface (`DatabaseReviewStore` over PostgREST) with a short-lived secret key | `scripts/readiness-review-hosted-tests.sh`, which reads the secret key and the publishable key from a private folder outside the repository (default `~/.config/mk-review`) |

**Hosted configuration fails closed** (`scripts/lib/readiness-review-test-backends.mjs`). Before any test it refuses: a missing mode or setting; any project other than `zuqegvsfhzgcydyivnqv`, pinned in code, including the shared preview and production project; an address that is not `https://zuqegvsfhzgcydyivnqv.supabase.co`; a secret key given in an environment variable rather than a file; a key file inside the repository, owned by another user or readable by others; a public key in the secret key setting; a key issued for another project; a legacy service_role key that is expired or lives longer than 24 hours (create a dedicated secret key and delete it after the run instead); and the same value for both keys. Over the network it then requires that every answer comes from the authorised project (the gateway's `sb-project-ref` header), that the public key is refused by the store (`42501`), that the secret key is accepted and can execute the store functions, and that the interface lists all eight. A refusal stops the run with exit code 2. Without the secret key, the public-key checks run and every other test is reported as blocked, with exit code 3 and the configuration steps; a blocked test is never reported as a pass.

**Cleanup is guaranteed and reported separately.** Every scenario runs inside one finalisation path. However the run ends (all tests done, a test failing, the harness failing, or SIGINT or SIGTERM), the cleanup step purges every session this run created, removes every temporary user, and then checks in a separate pass that each session, each of its role links and each user is gone. A session is purged only if the stored record carries this run's own creation time, label, first action and respondent link. A record where none of these match (unowned) or only some do (ambiguous) is never purged: it is raised as a cleanup exception that needs investigation, the run ends with exit code 5, and the cleanup step confirms the record is still there and unchanged. The deterministic fixture is never deleted to make room: it is created if absent, reused only if the stored record is exactly the fixture, and otherwise the test fails and the record is raised as a cleanup exception. The cleanup result is printed and written next to the test results and never changes them. `MK_REVIEW_TEST_INJECT=fail:<id>`, `crash:<id>` or `signal:<id>` injects a failure after a test has created its records, to show that cleanup still runs; `foreign:<id>` and `ambiguous:<id>` (local backend only, so that nothing is left on a hosted project) plant a record of another run under an id this run believes it used, to show that it is raised and not deleted.

| Exit code | Meaning |
|---|---|
| 0 | Every executed test passed, none is blocked, cleanup verified |
| 1 | A test or the harness failed (cleanup verified) |
| 2 | Configuration refused; nothing ran |
| 3 | Tests blocked for want of the secret key (cleanup verified) |
| 4 | Cleanup could not be verified: records or users may remain, whatever the tests did |
| 5 | Cleanup exception: a record this run cannot show it created was found and left untouched; investigate before the next run |
| 129, 130, 143 | Interrupted by SIGHUP, SIGINT or SIGTERM, after cleanup |

**Limits of cleanup after forced termination.** The cleanup step runs on normal completion, a failing test, a harness error and SIGHUP, SIGINT or SIGTERM. It cannot run if the process is killed outright (SIGKILL, `kill -9`, an out-of-memory kill), if Node itself crashes, on power loss or sleep that drops the connection, or if the machine or container is reclaimed. A second interrupt while cleanup is running is ignored so that cleanup can finish; forcing the process to stop at that point leaves whatever was not yet removed. If the network fails during cleanup, each call is retried once and the run then ends with exit code 4. In any of these cases, records and temporary users may remain on the hosted project, and the API cannot list them, because there is deliberately no listing function. To find and remove them, as the project owner (SQL editor or management connection):

```sql
-- Test sessions: every one is fictional and labelled "Fictional …"; compare stored_at with the time of the interrupted run.
select session_id, organisation_label, created_at_iso, action_count, stored_at
from readiness_review.sessions where fictional and organisation_label like 'Fictional %' order by stored_at;
-- Temporary users of the denial test.
select id, email, created_at from auth.users where email like 'mk-review-test-%@example.invalid';
-- After confirming each session belongs to the interrupted run:
select public.review_purge_session('<session_id>');
```

Temporary users are removed in the dashboard (Authentication, Users) or with the admin API. The harness does not remove leftovers of an earlier run itself, because it cannot show they are its own.

**Denial counts only with a recognised refusal.** A store function is denied only with `42501`. A table route is denied only with `406 PGRST106` (schema not exposed), `404 PGRST205` (not in an exposed schema) or `401`/`403 42501` on the hosted API, and `42501` locally. A server fault, a malformed request, a network failure or an unexpected code fails the test, because it proves nothing about access (H.3 checks these rules).

**Output is redacted.** Every result detail, error and cleanup report passes through `redactText` before it is printed or written: keys, tokens, bearer values, key and password parameters, email addresses, the temporary user's credentials and the fictional role links are replaced (H.3).

For the signed-in role the hosted mode creates a temporary fictional user (`mk-review-test-…@example.invalid`) with the secret key, signs it in with the public key, and removes it in the cleanup step. Nothing is granted to any role for testing.

| Scenario | Tests |
|---|---|
| Harness | H.1 store configuration fails closed; H.2 test configuration fails closed (25 cases, 26 where a file of another user can be made); H.3 redaction and the denial rules |
| 1 Creation, retrieval, ordered appends, corrections | S1.1 round trip identical to the file harness; S1.2 ordered appends; S1.3 provenance through the store: three corrections, the last back to the first value, and an owner answer replacing "I don't know"; S1.4 links by hash; S1.5 provenance of a 1.2.0 record stored and read through the historical reader, of a log prefix, and of a log with a missing and a stray entry |
| 2 Concurrency, stale saves, retries, ambiguous responses | S2.1 stale and repeated saves; S2.2 lost responses at the store; S2.3 24 concurrent starts and 12 concurrent saves; S2.4 retries through the service after a lost or unconfirmed save; S2.5 the service end to end on the store it opens itself, with a write from another process |
| 3 Denial of unauthorised roles | S3.1 the public role (needs only the public key); S3.2 public and signed-in roles against a stored session, and no table route even with the secret key |
| 4 The complete report input | S4.1 a stored session with owner answers, evidence and conclusions: all 902 controls, states kept distinct |
| 5 Determinism and lineage | S5.1 a fixed fictional session gives the same input digest on every load, replay and backend (`cb2180f5…`); S5.2 report runs recorded exactly, rebuilt from the stored prefix, invalid runs refused |
| 6 No unsupported conclusions | S6.1 gaps are reported practice only, conclusions only from recorded reviews; S6.2 a reviewer record written straight to the store for an unasked control |
| 7 Immutability, purge, errors | S7.1 changes refused through the interface; S7.2 explicit, complete purge; S7.3 the owner-level SQL suite (local here; hosted through the management connection); S7.4 every stored record read back and screened for personal data |

Every record is fictional and labelled so, and is screened for email addresses, phone, identity and account numbers before it is sent and again when read back (S7.4).

## What was verified, and where

| Check | Where | Result |
|---|---|---|
| Migration applied; every function body identical to the file (MD5 of each `prosrc`) | temporary hosted project `mk-review-store-temp` (`zuqegvsfhzgcydyivnqv`), PostgreSQL 17.11 | identical, 10 of 10 |
| Security model as deployed: the eight functions executable by `service_role` only, security definer, empty search path; RLS on all five tables with no policies; no table privilege and no schema usage for `anon`, `authenticated` or `service_role` | same, catalogue query as the owner | as designed |
| Owner-level suite `scripts/readiness-review-database-sql-tests.sql` | same, as the owner; and local (S7.3) | 42 of 42 on both (the first hosted record said 41 of 41; it listed 42 rows, all ok) |
| The integration suite, local backend | embedded Postgres 17.5 | 24 of 24, twice, cleanup verified (44 sessions, 281 links); scenario 3 only: 3 of 3 |
| Cleanup under failure, local backend | injected failure in S3.2, harness crash after S3.2, SIGTERM during S4.1 | exit 1, 1 and 143; cleanup verified in each (44, 35 and 36 sessions confirmed gone) |
| Cleanup exception, local backend | a record of another run planted under an id this run believes it used, with no identifying field matching (unowned) and with some matching (ambiguous) | exit 5 in both; the record raised for investigation, not purged, confirmed unchanged; every record of the run itself removed and verified |
| The integration suite, hosted backend, without the secret key | the temporary project over its API | 4 pass (H.1, H.2, H.3, S3.1: every function refused with `42501` for the public key; table routes refused with `406 PGRST106` and `404 PGRST205`), 19 blocked, 1 not applicable (S7.3); cleanup verified with nothing created |
| Fail-closed refusals of the hosted mode | real runs | no mode, missing settings, a key in an environment variable, a public key as the secret, the shared project, a key folder inside the repository, a secret key the project does not accept (HTTP 401): each exit code 2, nothing run |
| Inventory of the hosted project | as the owner | sessions, links, actions, runs, users, public tables and storage objects all 0; one ruleset row |
| Security advisor | same | one INFO lint, RLS on with no policies, which is the intended deny-all design |
| Report input contract | contract tests | C-23 pass; 23 of 23 |

## Not yet verified

- **The hosted integration suite with the secret key (19 tests, including S3.2 for the signed-in role).** No secret key for the temporary project has been made available; the Supabase connection exposes only public keys, and granting the public role access for a test was refused by the session's permission checks and not worked around. The steps are printed by any hosted run without the key: create a dedicated secret key for `zuqegvsfhzgcydyivnqv`, place it and the publishable key in `~/.config/mk-review` with `chmod 600`, run `scripts/readiness-review-hosted-tests.sh`, then delete the key.
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
4. Change the pinned reference in `scripts/lib/readiness-review-test-backends.mjs` only if MK authorises the new project for testing, then run `scripts/readiness-review-hosted-tests.sh` with a dedicated secret key: the verdict must be `PASS` with nothing blocked, exit code 0, and the cleanup verified.
