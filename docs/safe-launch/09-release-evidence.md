# Safe-Launch Evidence Pack

This document is a running record for the safe-launch remediation programme. It is updated at
the end of each work cycle, not written once at the end. Entries use:

- `PASS — verified by...`
- `FAIL — evidence...`
- `BLOCKED — dependency...`
- `NOT IN SCOPE — reason...`

Statements like "appears fixed" or "should work" are not used without a verified result attached.

---

## Resource register

Every metered or persistent resource created during this programme, with cost basis, owner, and
cleanup status. Updated at the end of every work cycle per the controller's cost-hygiene
instruction. "Owner" is the human on whose behalf the resource was created (this session acted on
their instruction, not autonomously).

| # | Resource | Type | Purpose | Cost basis | Owner | Created | Status | Deleted |
|---|---|---|---|---|---|---|---|---|
| 1 | Supabase branch `release-a-backlog-reconciliation` (project ref `cezyphvyommcxarbclfs`, parent `jvjxlphdyzerrhwcgkup`) | Cloud, metered | Test the Release A migration on an isolated schema-only copy of production (no production data) | $0.01344/hour, confirmed via `get_cost`/`confirm_cost` before creation | Tondani (this session's user) | 2026-07-24T10:50:52Z | **Deleted** — provisioning failed (`MIGRATIONS_FAILED`, see `10-migration-discrepancy-investigation.md`); branch was unusable and cost was stopped immediately | 2026-07-24, same session, minutes after creation |
| 2 | Local Supabase/Postgres stack, Docker project `mk-repo` (ports 55321–55329, shifted from the CLI defaults to avoid colliding with a pre-existing, unrelated 8-day-old local stack named `repo` that this work did not create and did not touch) | Local, free | Full local replay of every migration + 11 live functional SQL checks against `classify_backlog_order()`/`backlog_reconciliation_queue()` | None (local Docker only) | Tondani | 2026-07-24 | **Stopped** (`supabase stop`); containers removed | 2026-07-24, same session |
| 3 | Docker volumes `supabase_db_mk-repo`, `supabase_edge_runtime_mk-repo`, `supabase_storage_mk-repo` | Local, free | Backing storage for resource #2 | None | Tondani | 2026-07-24 | **Removed** (`docker volume rm`) after the test transaction was rolled back and its results (11 PASS lines) were recorded in this pack | 2026-07-24, same session |
| 4 | GitHub draft PRs #40, #41 | Free (GitHub) | Reviewable diffs for the discovery doc and Release A tooling | None | Tondani | 2026-07-24 | **Active**, both draft, both `DO NOT MERGE` | N/A — intentionally kept open for review |
| 5 | Homebrew `node@26` + partial `supabase` formula install | Local, free, but caused an **unintended global change** | Attempted global Supabase CLI install; superseded by `npx supabase` (no persistent install needed) | None | Tondani's machine | 2026-07-24 | **Reverted** — `node@26` was unlinked and `node@24` relinked as default (matching this repo's `.nvmrc`/`engines` requirement); orphaned Homebrew dependency kegs removed via `brew uninstall supabase` (cellar cleanup) | 2026-07-24, same session, immediately on discovery |
| 6 | Local Supabase/Postgres stack, Docker project `mk-repo` (same ports as #2 — reused, not a second instance) | Local, free | Release B: full local replay of all 32 migrations (31 prior + the new Release B one) + 24 live functional SQL checks against the payment-transaction/worker/quality-review RPCs | None (local Docker only) | Tondani | 2026-07-24 | **Stopped** (`supabase stop`); containers removed | 2026-07-24, same session |
| 7 | Docker volumes `supabase_db_mk-repo`, `supabase_edge_runtime_mk-repo`, `supabase_storage_mk-repo` (recreated by resource #6 after #3 was removed) | Local, free | Backing storage for resource #6 | None | Tondani | 2026-07-24 | **Removed** (`docker volume rm`) after the test transaction was rolled back and its 24 PASS results were recorded in this pack | 2026-07-24, same session |
| 8 | GitHub draft PR #42 | Free (GitHub) | Reviewable diff for the Release B audit, design, and implementation | None | Tondani | 2026-07-24 | **Active**, draft, `DO NOT MERGE`, stacked on PR #41 | N/A — intentionally kept open for review |
| 9 | Local Supabase/Postgres stack, Docker project `mk-repo` (ports 55321–55329, reused across five separate `supabase start`/`supabase stop` cycles across the Release C work cycle and its closure cycle — not five simultaneous instances) | Local, free | (a) DB/core-service layer: full replay of all 35 migrations + 20 live SQL checks; (b) real-send notification wiring: 26 live checks against `recordPhase1OrderNotifications()`/`recordPaymentConfirmedNotification()` in both `disabled` and `test`-with-no-key modes; (c) admin delivery/token recovery: 22 live checks including a real authenticated `platform_admin` session (not just service-role bypass); (d) provider webhook re-verification: 12 live checks against the real HMAC/attestation crypto and `ingest_phase14_provider_webhook()`; (e) closure cycle: full replay of all 35 migrations + 43 live checks (missing-recipient, permanent/transient bounce, complaint, event ordering) + RLS/grant spot-check | None (local Docker only) | Tondani | 2026-07-24 | **Stopped** (`supabase stop`) after each cycle; containers removed each time | 2026-07-24, same session, after each of the five cycles |
| 10 | Docker volumes `supabase_db_mk-repo`, `supabase_edge_runtime_mk-repo`, `supabase_storage_mk-repo` (recreated by resource #9 after each prior removal) | Local, free | Backing storage for resource #9 | None | Tondani | 2026-07-24 | **Removed** (`docker volume rm`) after each cycle's results were recorded in this pack | 2026-07-24, same session, after each of the five cycles |
| 11 | GitHub draft PR #43 | Free (GitHub) | Reviewable diff for the Release C audit, design, and implementation | None | Tondani | 2026-07-24 | **Active**, draft, `DO NOT MERGE`, stacked on PR #42 | N/A — intentionally kept open for review |

**Accidental global machine change — documented per instruction.** Installing the Supabase CLI's
node dependency via Homebrew unlinked this machine's `node@24` and linked `node@26.5.0` instead,
and the `supabase` formula itself failed to install cleanly (`No such file or directory` on the
bottle's `dist/supabase.js`). This was caught, `node@24` was relinked as the active version, and
the broken partial install was removed. `npx supabase@latest` was used for the remainder of the
work — no further global installs were made. Local Supabase/Postgres testing going forward should
continue to prefer `npx supabase@latest <command>` over a global/Homebrew install.

**Pre-existing resource explicitly not touched:** a local Docker Supabase stack, project `repo`
(containers `supabase_db_repo`, `supabase_kong_repo`, etc.), had been running for 8 days prior to
this session, in a Documents-folder clone this work did not create. It was not stopped, deleted,
or altered — this work's local stack used different ports specifically to avoid needing to touch
it.

**Local-CLI-only environment gotcha, discovered and resolved this Release C cycle (not a
production issue):** a fresh `supabase init` on a current Supabase CLI version (2.109.1) defaults
`api.auto_expose_new_tables` to unset — the new cloud default, which does *not* grant `service_role`
base table privileges (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) on tables created by migrations. The
production project predates this CLI default change and was never affected. A fresh local replay,
however, silently failed every `service_role`-authenticated table read/write (`permission denied
for table orders`, confirmed via a direct REST call) until `auto_expose_new_tables = true` was set
in the local-only, gitignored `supabase/config.toml` and the stack was reset. Recorded here so a
future session doesn't waste time re-diagnosing the same local-only symptom.

---

## Release A evidence

| Requirement | Implementation | Commit(s) | Test | Result | Preview | Evidence |
|---|---|---|---|---|---|---|
| Current-state discovery report (brief §4) | `docs/safe-launch/00-current-state.md` | `70c0141` | Manual verification of every cited fact against live `gh`/Supabase MCP output | `PASS — verified by direct gh pr view 37 / Supabase list_tables,list_migrations,execute_sql calls, all cited in the doc` | PR #40 (Vercel: Ready) | This document's own citations |
| Backlog reconciliation migration (table, RLS, 2 RPCs) | `supabase/migrations/20260724150000_release_a_backlog_reconciliation.sql` | `b1080f3` | (a) `npm run typecheck`; (b) full local `supabase start` replay of all 31 production migrations + this one; (c) GitHub Actions "Supabase Migration Replay" workflow | `PASS — (a) tsc --noEmit exit 0, no output; (b) all migrations applied with only benign idempotency NOTICEs, stack reached healthy; (c) CI runs 30087606900 (release-a branch) and 30087604815 (docs/safe-launch-discovery branch) both succeeded, ~4m38s/4m39s` | PR #41 (Vercel: building/ready) | `10-migration-discrepancy-investigation.md` §"What was checked and did NOT reproduce the error" |
| `classify_backlog_order()` — role/session/note-length enforcement | Same migration | `b1080f3` | Live SQL test against local Postgres: unauthenticated call, wrong-role (`reviewer`) call, sub-5-char note, all with synthetic fixture data | `PASS — verified by direct psql execution; unauthenticated call raised backlog_reconciliation_no_session, reviewer call raised backlog_reconciliation_role_forbidden, short note raised backlog_reconciliation_note_too_short` | — | Live test run, this work cycle (test script not committed — synthetic-fixture SQL, one-off verification, results recorded here) |
| `classify_backlog_order()` — upsert-not-duplicate, always-audited | Same migration | `b1080f3` | Two classify calls on the same order, same live test | `PASS — verified by direct psql execution; exactly 1 row in backlog_reconciliation_records, exactly 2 rows in audit_logs (one with before_json = null, one with the prior state), record reflects the latest classification` | — | Same live test run |
| `backlog_reconciliation_queue()` — role-gated, non-PII | Same migration | `b1080f3` | Same live test: `reviewer` read access; return-signature check for PII field names | `PASS — verified by direct psql execution; reviewer could read the queue and see the test order; function's return signature contains no customer_name/customer_email/organisation_name columns` | — | Same live test run |
| RLS enforcement on `backlog_reconciliation_records` | Same migration | `b1080f3` | `anon` role direct table access, same live test | `PASS — verified by direct psql execution; anon role returned zero rows / no privilege` | — | Same live test run |
| Admin UI + classify/export routes | `src/app/score/admin/backlog-reconciliation/page.tsx`, `src/app/score/api/admin/backlog-reconciliation/route.ts`, `.../export/route.ts` | `b1080f3` | `npm run typecheck`; static source assertions (`scripts/release-a-backlog-reconciliation-tests.mjs`) confirming role checks run before the mutating/reading call in each route | `PASS — typecheck exit 0; node scripts/release-a-backlog-reconciliation-tests.mjs exit 0, all assertions ok` | PR #41 | Script output, this work cycle |
| CSV export — non-PII field set | `.../export/route.ts` | `b1080f3` | Static assertion of the fixed `CSV_COLUMNS` list against a PII-field-name blocklist/allowlist | `PASS — see script output` | — | Script output |
| CSV export — spreadsheet formula-injection hardening | `src/lib/backlog-reconciliation/csv-safety.ts` (new, shared module) | `aefefd5` | Real functional test (not source assertion) calling the actual `csvEscape()` against: `=SUM(1,1)`, `+cmd`, `-1+2`, `@IMPORT`, leading-space-hidden formula, leading-tab-hidden formula, plain text, self-quoted text, comma-containing text, embedded line break, embedded double quotes, `null`, `undefined`, a number | `PASS — 14/14 assertions passed against the real function's return value, see scripts/release-a-backlog-reconciliation-tests.mjs section 9c output` | PR #41 | Script output, this work cycle |
| Backlog reconciliation runbook | `docs/safe-launch/01-backlog-reconciliation-runbook.md` | `b1080f3` | Manual review (under 600 words, as required) | `PASS — 582 words` | — | — |
| Migration applied to a Supabase Cloud environment | — | — | — | `BLOCKED — no Supabase Cloud environment has executed this migration. The one preview-branch attempt failed for reasons still under investigation (10-migration-discrepancy-investigation.md) and unrelated to the migration's own content, which replays cleanly locally and in CI. Deferred to the single integrated release-candidate cloud branch planned after Releases A-D, per current instructions.` | — | — |
| Production backlog reconciled | — | — | — | `NOT IN SCOPE for this work cycle — tooling exists and is verified; using it against the real 18 payment_received orders requires the authorised MK operator, not an automated action.` | — | — |

---

## Release B evidence

| Requirement | Implementation | Commit(s) | Test | Result | Preview | Evidence |
|---|---|---|---|---|---|---|
| Release B0 existing-infrastructure audit (20 questions, infrastructure map) | `docs/safe-launch/11-release-b-existing-infrastructure-audit.md` | `f18f0df` | Independent spot-check of the 5 most consequential/surprising claims against production schema before trusting the audit | `PASS — 5/5 spot-checks confirmed exactly as claimed (partial-unique constraints, dual-parent report_ai_attempts binding, live call from the manual path into Phase 14 feature flags, empty vercel.json crons, absence of maxDuration)` | PR #42 | This document's own citations |
| Minimum-change design | `docs/safe-launch/12-durable-fulfilment-design.md` | `f18f0df` | Manual review against the audit's own evidence | `PASS — design decision (extend manual_report_generation_attempts, not a new table) is directly traceable to the audit's answers to Q1-Q3/Q7/Q9/Q20` | PR #42 | — |
| Durable-fulfilment migration (lease/heartbeat/backoff/quality-review columns, 4 additive status values, 9 new RPCs) | `supabase/migrations/20260724160000_release_b_durable_fulfilment.sql` | `0474b0a` | (a) `npm run typecheck`; (b) full local `supabase start` replay of all 32 migrations; (c) manual diff of the two `create or replace`-redefined functions (`record_payment_transition`, `claim_payment_report_generation`) against their original `0024` bodies, confirming no migration between 0024 and now had already touched them | `PASS — (a) tsc --noEmit exit 0; (b) all 32 migrations applied, only benign idempotency NOTICEs; (c) confirmed byte-for-byte faithful reproduction of the 0024 originals with only the documented additive changes` | PR #42 | This document's own citations |
| Payment transaction boundary: `record_payment_transition()` queues the job atomically | Same migration + `src/lib/payments/payment-service.ts` | `0474b0a` | Live SQL: PAID confirmation queues exactly 1 job; a retried confirmation (same idempotency key) is recognised as a duplicate and does not create a second job | `PASS — verified by direct psql execution against a local replay; both assertions passed` | — | Live test run, this work cycle (test script not committed — synthetic-fixture SQL, one-off verification, results recorded here, mirroring the Release A entries above) |
| Worker claim exclusivity | Same migration (`claim_next_fulfilment_job`, `for update skip locked`) | `0474b0a` | Live SQL: worker-a claims the queued job; a competing worker-b claim immediately after returns nothing | `PASS — verified by direct psql execution` | — | Same live test run |
| Lease ownership enforcement | Same migration (`fail_fulfilment_job`) | `0474b0a` | Live SQL: a caller that does not hold the lease is rejected (`fulfilment_lease_not_held`) | `PASS — verified by direct psql execution` | — | Same live test run |
| Bounded retry with exponential backoff | Same migration | `0474b0a` | Live SQL: 1st failure -> `RETRY_SCHEDULED` with a future `next_attempt_at`, lease released; 5th failure (`retry_count` reaching `max_attempts`=5) -> `MANUAL_REVIEW_REQUIRED` | `PASS — verified by direct psql execution for both boundary cases` | — | Same live test run |
| Admin retry rejects an ineligible state (not a silent no-op) | Same migration (`retry_fulfilment_job`) | `0474b0a` | Live SQL: calling retry on a `REPORT_QUEUED` row raises `fulfilment_retry_invalid_state`; calling it on the real `MANUAL_REVIEW_REQUIRED` row, as `platform_admin`, succeeds and resets `retry_count` to 0 | `PASS — verified by direct psql execution for both cases` | — | Same live test run |
| Expired-lease recovery, scoped correctly | Same migration (`recover_expired_fulfilment_leases`) | `0474b0a` | Live SQL: a `REPORT_GENERATING` row with a past `lease_expires_at` is recovered to `RETRY_SCHEDULED`; a row with a future `lease_expires_at` is left untouched by the same sweep | `PASS — verified by direct psql execution for both cases` | — | Same live test run |
| Quality review: precondition, role gating, linked regeneration | Same migration (`submit_for_quality_review`, `approve_quality_review`, `reject_quality_review`) | `0474b0a` | Live SQL: submit rejects a non-`REPORT_READY` row and accepts a `REPORT_READY` one; `finance_admin` is forbidden from approving; `approver` approval moves the row to `DELIVERY_QUEUED` with reviewer identity recorded; rejection creates exactly 1 new attempt row linked via `regenerated_from_attempt_id` | `PASS — verified by direct psql execution for all five assertions` | — | Same live test run |
| RLS and worker-RPC privilege restriction | Same migration | `0474b0a` | Live SQL: `anon` role cannot read `manual_report_generation_attempts` directly; `authenticated` role has no execute privilege on `claim_next_fulfilment_job` (service_role only) | `PASS — verified by direct psql execution for both cases` | — | Same live test run |
| Worker route (Bearer-token auth, reuses existing generation function, no PII in logs) | `src/app/score/api/internal/fulfilment-worker/route.ts` | `0474b0a` | `npm run typecheck`; static source assertions (`scripts/release-b-durable-fulfilment-tests.mjs`) confirming the auth check, the call to the existing unmodified `generateManualPhase1Report()`, and the absence of `customer_email`/`customer_name` references | `PASS — typecheck exit 0; node scripts/release-b-durable-fulfilment-tests.mjs exit 0, all assertions ok` | PR #42 | Script output, this work cycle |
| Admin recovery/quality-review routes and UI | `src/lib/fulfilment/fulfilment-service.ts`, `src/app/score/api/admin/orders/[orderReference]/fulfilment/{approve,reject,retry,recover}/route.ts`, `src/components/admin/FulfilmentReviewPanel.tsx`, extends `src/app/score/admin/orders/[orderReference]/page.tsx` | `0474b0a` | `npm run typecheck`; static source assertions confirming each route's role check runs before its service-layer call | `PASS — see script output` | PR #42 | Script output |
| `vercel.json` cron entry — deployment compatibility | `vercel.json` | `0474b0a`, schedule corrected `a4c5b2f` | Real Vercel deployment attempt on PR #42 | `PASS — preview deployment builds successfully using a temporary once-daily Hobby-compatible cron expression.` | PR #42 | Vercel deployment failure comment on the `*/5 * * * *` attempt, then success on `0 3 * * *`, both this work cycle |
| Production worker frequency vs. current plan | `docs/safe-launch/12-durable-fulfilment-design.md` ("Vercel plan launch gate") | — | Real deployment failure evidence + Vercel plan-tier confirmation | `BLOCKED — the current Vercel plan cannot run the certified production worker frequency (one-to-two-minute interval). Confirmed Hobby tier by a real deployment rejection of */5 * * * *, not inferred from code.` | — | Same deployment failure evidence |
| Cron execution in preview | — | — | — | `NOT VERIFIED — Vercel cron execution does not occur in preview deployments and therefore has not been exercised by the preview. A successful preview build is not evidence the worker has ever been invoked by cron.` | — | — |
| Production readiness of the worker-trigger path as a whole | — | — | — | `REQUIRED BEFORE PRODUCTION — authorised upgrade to a commercially suitable Vercel plan, a production schedule update to the certified interval, an authenticated cron invocation test against a real production deployment, and measured worker runtime (docs/safe-launch/12-durable-fulfilment-design.md, "Measuring worker runtime") against the selected function's duration limit.` | — | — |
| Worker-schedule certification script | `scripts/release-b-worker-schedule-gate.mjs`, `npm run release-b:certify-worker-schedule` | (this commit) | Ran manually against both the temporary schedule (must fail) and a synthetic certified schedule in an isolated directory (must pass) | `PASS — correctly fails with a clear message against 0 3 * * * (temporary schedule), correctly passes against a */2 * * * * synthetic example. Deliberately NOT wired into CI/preview builds while the project remains on Hobby — intended for manual use during the integrated release-candidate/production-certification cycle, per its own header comment. Does not and cannot infer the Vercel account plan from code.` | — | This work cycle |
| Runbook | `docs/safe-launch/13-durable-fulfilment-runbook.md` | `0474b0a` | Manual review | `PASS` | — | — |
| Regression: Release A tests still pass | `scripts/release-a-backlog-reconciliation-tests.mjs` | — | Re-run after Release B changes | `PASS — all assertions ok, unaffected by Release B` | — | This work cycle |
| Regression: `phase23-payment-assessment-tests.mjs` updated for the intentional architectural change | Same test file | `0474b0a` | Re-run after updating one assertion (payment-service.ts no longer calls the synchronous fulfilment trigger, by design) | `PASS — narrowly-scoped, justified update; all other assertions in the file unchanged and passing` | — | This work cycle |
| Migration applied to a Supabase Cloud environment | — | — | — | `BLOCKED — no Supabase Cloud environment has executed this migration, per explicit controller instruction not to create another preview branch this cycle. Deferred to the single integrated release-candidate cloud branch planned after Releases A-D.` | — | — |
| Real email delivery from `DELIVERY_QUEUED` | — | — | — | `NOT IN SCOPE for Release B — Release B's job is to create the durable handoff point into DELIVERY_QUEUED; Release C implements real delivery, per the brief.` | — | — |
| AI narrative generation activation | — | — | — | `NOT IN SCOPE for Release B — report_ai_attempts/ai_narrative feature-flag activation is untouched; Release B's worker calls the same generateManualPhase1Report() the live path already calls, which independently checks that flag (still off).` | — | — |

**Note on an in-session incident, not a resource:** during this work cycle, a background implementation agent was terminated by the account's monthly spend limit partway through drafting the migration file. This is not itself a created/cleaned-up resource, so it has no row above — recorded here for completeness. The partial work it left on disk (uncommitted) was independently reviewed, verified against production schema, and completed directly rather than re-delegated, after the user raised the account's spend limit.

### Current testing conclusion (Release B, this cycle)

| Item | Status |
|---|---|
| Branch relationship (PR #42 base/head, GitHub mergeability) | `PASS` |
| GitHub mergeability | `PASS` |
| `npm run typecheck` | `PASS` |
| Migration replay | `PASS` — locally (Docker) and in GitHub CI |
| Release B SQL behaviour (24 live checks) | `PASS` — locally |
| Preview deployment | `PASS` |
| Scheduled cloud invocation (cron actually firing) | `NOT TESTED` — impossible in preview, requires production |
| Cloud migration execution | `NOT TESTED` — no Supabase Cloud environment has applied this migration |
| Production worker frequency | `BLOCKED` — by current Vercel plan (Hobby) |
| Production runtime duration | `NOT CERTIFIED` — deferred to the integrated release-candidate cycle |
| Paid customer journey | `NOT READY` |

---

## Release C evidence

| Requirement | Implementation | Commit(s) | Test | Result | Preview | Evidence |
|---|---|---|---|---|---|---|
| Release C0 existing-delivery audit (25 questions, 5 spot-verified claims) | `docs/safe-launch/14-release-c-existing-delivery-audit.md` | `c8f098c` | Independent spot-check of the 5 most consequential claims against production schema | `PASS — headline finding (a complete, dormant Resend integration already exists in the Phase14 chain, reachable only via startPremiumReportWorkflow() with zero callers) and the second finding (reports.status='released' is set only by the dormant chain -- a customer-access route on the existing eligibility gate would reject every request, forever, silently) both confirmed against live schema` | PR #43 | This document's own citations |
| Minimum-change design | `docs/safe-launch/15-email-and-secure-delivery-design.md` | `c8f098c` | Manual review against the audit's own evidence | `PASS — decision to write new Release-C-scoped RPCs rather than reuse the Phase14 RPCs is directly traceable to the audit's findings about the dormant chain's coupling to a different generation pipeline and the Release A-flagged security-gate governance trail` | PR #43 | — |
| Email/secure-delivery migration (12 new/redefined RPCs, 1 new table `customer_report_access_tokens`) | `supabase/migrations/20260724170000_release_c_email_secure_delivery.sql` | `f9898e4` | (a) `npm run typecheck`; (b) full local `supabase start` replay of all 35 migrations | `PASS — (a) tsc --noEmit exit 0; (b) all 35 migrations applied, only benign idempotency NOTICEs` | PR #43 | This document's own citations |
| Atomic approve→release→authorize (`approve_quality_review()` redefined again to close the `reports.status='released'` gap) | Same migration | `f9898e4` | Live SQL: approving a quality review in one transaction releases the report and creates the delivery authorization | `PASS — verified by direct psql execution against a local replay` | — | Live test run, this work cycle (synthetic-fixture SQL, one-off verification, results recorded here) |
| Delivery worker claim exclusivity, lease validation, bounded retry with backoff | Same migration (`claim_next_delivery`, `mark_delivery_dispatch_started`, `finalize_delivery`, `fail_delivery`) | `f9898e4` | Live SQL: claim exclusivity between two workers; wrong lease token rejected, correct one accepted; 2-attempt backoff cap tested to `failed_terminal` | `PASS — verified by direct psql execution for all cases` | — | Same live test run |
| Admin retry rejects an ineligible state (not a silent no-op) | Same migration (`retry_delivery`) | `f9898e4` | Live SQL (this cycle, admin UI verification pass): retry on a `failed_terminal` row succeeds and resets `retry_count`; an immediate second retry on the now-`queued` row raises `delivery_retry_invalid_state` | `PASS — verified by direct psql/RPC execution` | — | Live test run, this work cycle |
| Token issuance, revoke-on-reissue, hash lookup + tamper resistance | Same migration (`issue_customer_report_access_token`, `reissue_customer_report_access_token`, `revoke_customer_report_access_token`) | `f9898e4` | Live SQL: exactly 1 active token enforced after reissue; revoking an already-revoked token is rejected, not a silent no-op; token lookup is by hash only, raw token never persisted | `PASS — verified by direct psql/RPC execution for all cases` | — | Same live test run |
| RLS and service_role-only RPC restriction | Same migration | `f9898e4` | Live SQL: `anon` sees nothing on `report_delivery_authorizations`/`customer_report_access_tokens`; `authenticated` role is rejected by the worker RPCs (`claim_next_delivery` etc., service_role only) | `PASS — verified by direct psql execution for both cases` | — | Same live test run |
| Three real bugs found and fixed during live verification (missing NOT NULL `report_id`, `ON CONFLICT` predicate mismatch on a partial unique index, 4 `audit_logs` writes blocked by the Phase14 authoritative-mutation guard) | Same migration | `f9898e4` | Each found by the live SQL runs above failing, then re-run clean after the fix | `PASS — all three confirmed fixed by re-running the failing case; none were left undiscovered` | — | Same live test run |
| Provider-mode abstraction (`disabled`/`test`/`live`), the sole call site for the real Resend transport | `src/lib/notifications/email-provider.ts` | `f9898e4` | `npm run typecheck`; static assertion that no other file imports `sendReportEmailWithResend` directly | `PASS — see script output` | PR #43 | `scripts/release-c-email-secure-delivery-tests.mjs` output, this work cycle |
| Real-send wiring: order-confirmation, admin new-order alert, payment-confirmed (previously DB-only "queued" rows; report-ready was already wired) | `src/lib/notifications/phase1-order-notifications.ts`, `src/lib/payments/payment-service.ts` | `405251f` | (a) `npm run typecheck`; (b) 26 live checks against a fresh local replay: `disabled`-mode default behaviour matches current production (`recorded_disabled`, `provider_mode='disabled'`), dedupe idempotency holds on a re-call, `test`-mode with no `RESEND_API_KEY` configured correctly attempts a real send and fails gracefully (`send_failed`, `provider_mode='external'`, error message names the missing key) without ever throwing into the caller | `PASS — (a) tsc --noEmit exit 0; (b) all 26 checks passed` | PR #43 | Live test run, this work cycle (synthetic-fixture data, service-role client via a real `@supabase/supabase-js` connection, not mocked) |
| Message templates — no assessment content, no storage paths, no permanent URLs | `src/lib/notifications/message-templates.ts` | `f9898e4` | Static assertion: no storage-path/bucket fields, no score/maturity/risk fields referenced in any builder | `PASS — see script output` | PR #43 | Script output |
| Secure customer-access route — token possession is the access control, checksum re-verified, no admin session, never returns the raw storage path | `src/lib/reports/customer-report-access.ts`, `src/app/score/report/access/[token]/route.ts` | `f9898e4` | `npm run typecheck`; static assertion (no `requireAdmin`, checksum re-verification present) | `PASS — see script output` | PR #43 | Script output |
| Delivery worker route — second claim phase, one route not a second worker platform | `src/app/score/api/internal/fulfilment-worker/route.ts` (extended) | `f9898e4` | Static assertion: same route calls both `claim_next_fulfilment_job` and `claim_next_delivery` | `PASS — see script output` | PR #43 | Script output |
| Admin delivery/token recovery — retry/revoke/reissue role-gated matching each RPC's own internal check, reissue actually sends the email (nothing else dispatches the `report_ready_reissue` row the RPC creates) | `src/lib/reports/delivery-recovery-service.ts`, `src/components/admin/DeliveryAccessPanel.tsx`, 3 new admin routes under `.../delivery/`, extends the order-detail page | `d635dda` | (a) `npm run typecheck`; (b) 22 live checks against a fresh local replay **with a real authenticated `platform_admin` session** (not service-role bypass — `auth.uid()` resolves inside the security-definer RPCs): anonymous caller rejected, invalid-state rejection on a second retry (not silent no-op), revoke-then-revoke-again rejected, revoke-on-reissue leaves exactly 1 active token, reissue's send-then-persist glue verified end to end in `disabled` mode | `PASS — (a) tsc --noEmit exit 0; (b) all 22 checks passed` | PR #43 | Live test run, this work cycle (real GoTrue auth user created via the admin API, signed in for a real access token, torn down with the rest of the local stack — not mocked) |
| Static test script | `scripts/release-c-email-secure-delivery-tests.mjs`, `npm run release-c:test-email-secure-delivery` | (this commit) | Ran manually; every assertion passed on the first clean run after one label fix | `PASS — node scripts/release-c-email-secure-delivery-tests.mjs exit 0, all assertions ok` | — | Script output, this work cycle |
| **Known gap, found and since fixed (see "Release C closure cycle evidence" below):** admin dashboard delivery-state/queue classification read only `manual_report_delivery_attempts` (Release B's table); the real delivery worker writes `report_delivery_authorizations` instead | `src/lib/reports/phase1-operations.ts` (`getPhase1OrderOperations`, `annotateOrdersWithPhase1State`) | `f642f09` | Read the source; confirmed the queue-bucket logic (`ready_not_delivered`/`delivery_pending`/`delivered`/`delivery_failed`) never referenced `report_delivery_authorizations` | `FIXED — annotateOrdersWithPhase1State() now sources report_delivery_authorizations; see the closure-cycle table below for the fix and its own live-verified bounce/complaint follow-on fix` | — | This document |
| Provider webhook re-verification against the new schema | `src/app/score/api/webhooks/resend/route.ts` (unchanged by design) | — | Live test against a fresh local replay: a fixture `email_events`/`report_delivery_authorizations` row set to exactly the state `finalize_delivery()` leaves behind (`provider='resend'`, `provider_message_id` set), then a real signed webhook event (real HMAC signature via `verifyResendWebhook()`, real database attestation via `createProviderWebhookDatabaseAttestation()`, real `ingest_phase14_provider_webhook()`/`apply_email_provider_event_atomic()` RPC calls — nothing mocked) | `PASS — 12/12 checks: a genuine 'email.delivered' event correlates and moves the row to delivered; an unknown provider_message_id is correctly reported ignored/unknown_message rather than silently matching; a byte-identical replay of the same event id is correctly reported a duplicate and not reapplied; a tampered signature is rejected before ever reaching the database. Confirms the design doc's "reasoned through" claim empirically.` | — | Live test run, this work cycle |
| **Finding, not a bug (status-vocabulary note):** `apply_email_provider_event_atomic()`'s staleness/ordering rank check only recognises the older lowercase Phase14 status vocabulary (`queued`/`sending`/`sent`/`delivered`/...); Release C's `mark_delivery_dispatch_started()`/`finalize_delivery()` write a different, uppercase vocabulary (`PROVIDER_REQUEST_STARTED`/`PROVIDER_ACCEPTED`). Any `email_events` row still in a Release-C-only status therefore ranks as 0 (lowest) until its first webhook event arrives. In the current flow this is harmless — the first webhook received always has a higher rank than 0 and always correctly applies, exactly the behaviour the live test above confirmed — but it means the ordering protection would not correctly reject a genuinely out-of-order *first* event if one were ever possible. Not fixed (would mean touching the shared Phase14 rank logic for a case that isn't actually reachable today); recorded here for whoever next touches that function. | `src/lib/reports/email/resend-webhook.ts` reasoning + `supabase/migrations/0031_phase14_delivery_event_recency_precision_fix.sql` | — | Source review during the webhook re-verification above | `NOTED — not actively broken in the current flow, not fixed` | — | This work cycle |
| Domain authentication (SPF/DKIM/DMARC) | `docs/safe-launch/17-domain-authentication.md` (new) | — | — | `NOT CONFIGURED — documented this cycle (required records, verification process, standing external-resource approval gate), but actual DNS configuration requires the MK owner's registrar/DNS access, which this work does not have. .env.example also corrected this cycle: it previously defined an unreferenced MK_ADMIN_EMAIL/MK_FROM_EMAIL pair (audit Q15's own finding, flagged in the design doc as something "this release replaces" but never actually done in the DB-layer commit) instead of the 10 env vars the code actually reads.` | — | `17-domain-authentication.md`; `.env.example` diff |
| Bounce/complaint handling | `report_delivery_remediations` (reused, unchanged) | — | — | `NOT EXERCISED by any live test this release — reused table, no new code path added to it` | — | — |
| External email provider connection | — | — | — | `BLOCKED — decision gate, not a technical blocker. Whether RESEND_API_KEY in .env.example corresponds to a real, funded account is unknown and not assumed either way, per brief §17. MK_EMAIL_PROVIDER_MODE defaults to disabled; no external provider is connected.` | — | — |
| Migration applied to a Supabase Cloud environment | — | — | — | `BLOCKED — no Supabase Cloud environment has executed this migration, per the same deferral as Releases A/B. Deferred to the single integrated release-candidate cloud branch planned after Releases A-D.` | — | — |

## Release C closure cycle evidence

Controller-directed closure cycle: three operational gaps found in Release C's own end-of-cycle
review (missing-recipient handling, bounce/complaint handling, a status-vocabulary inconsistency),
plus a fourth item — unifying the admin delivery-state/queue display — implemented independently
in a parallel session against this same branch, then reviewed and integrated here (see the "Item
1" rows below, including a follow-on bounce/complaint-visibility fix found during that review).

| Requirement | Implementation | Commit(s) | Test | Result | Preview | Evidence |
|---|---|---|---|---|---|---|
| Closure migration (missing-recipient exception + correction RPC, bounce/complaint owned exceptions + resend suppression, status-vocabulary rank fix) | `supabase/migrations/20260724180000_release_c_closure_delivery_exceptions.sql` | `fd96a8c` | (a) `npm run typecheck`; (b) full local `supabase start` replay of all 35 migrations; (c) RLS/grant spot-check | `PASS — (a) tsc --noEmit exit 0; (b) all 35 migrations applied, only benign idempotency NOTICEs; (c) no anon/public execute grant on the new/changed RPCs, exactly one reissue_customer_report_access_token overload exists post-drop-and-recreate (no orphaned duplicate)` | PR #43 | This document's own citations |
| Missing-recipient handling end to end (approve with no email → visible order_events exception + RPC-flagged return value → correction RPC → delivery queued → report NOT regenerated → old audit trail preserved) | Same migration + `src/lib/notifications/phase1-order-notifications.ts` (`recordDeliveryRecipientRequiredAlert`), `src/lib/fulfilment/fulfilment-service.ts`, new admin route + `DeliveryAccessPanel.tsx` banner | `fd96a8c` | 12 live checks against a fresh local replay, real `platform_admin` auth session: invalid email rejected, correction succeeds, report version unchanged, `orders.customer_email` updated, order_events transitions from required→corrected, a second correction attempt on an already-queued delivery is rejected (not silent no-op) | `PASS` — all 12 passed | PR #43 | Live test run, this work cycle (synthetic-fixture data) |
| Internal MK alert fires once, deduped (no alert loop) | `recordDeliveryRecipientRequiredAlert()` | `fd96a8c` | Called directly (bypassing the RPC path, since the TS wrapper reads Next's request-scoped cookies): first call creates the alert, second call for the same order returns `reused: true` | `PASS — verified both the create and the dedupe-on-repeat behaviour directly against the real function, not mocked` | — | Live test run, this work cycle |
| Permanent bounce: owned exception created, resend blocked by default, override works and is audited, replay does not duplicate the exception | Same migration (`apply_email_provider_event_atomic`, `reissue_customer_report_access_token`) | `fd96a8c` | 9 live checks: real signed webhook event → `bounced` status, `delivery_bounced` order_events entry, `phase14_operational_alerts` row, reissue blocked with `access_token_reissue_blocked_prior_bounced`, reissue succeeds with `p_override_suppression=true`, byte-identical event replay reported a duplicate, exactly 1 order_events entry after the replay | `PASS` — all 9 passed | PR #43 | Live test run, this work cycle |
| Transient/temporary bounce: stays retry-eligible, no owned exception, no resend block | Same migration + `src/app/score/api/webhooks/resend/route.ts` (bounce-type classification) | `fd96a8c` | 4 live checks: a webhook event with `data.bounce.type=Transient` maps to `delivery_delayed` (not `bounced`), no `delivery_bounced` order_events entry created, reissue succeeds without an override | `PASS` — all 4 passed | PR #43 | Live test run, this work cycle |
| Complaint: owned exception created (critical severity), resend blocked by default, override works, replay idempotent | Same migration | `fd96a8c` | 8 live checks: real signed `email.complained` event → `complained` status, `delivery_complaint` order_events entry, critical-severity alert, reissue blocked with `access_token_reissue_blocked_prior_complained`, reissue succeeds with override, byte-identical replay reported a duplicate, exactly 1 order_events entry after the replay | `PASS` — all 8 passed | PR #43 | Live test run, this work cycle |
| Event ordering / status-vocabulary rank fix: delivered→complaint stays complaint, later lower-rank events never regress, unknown message ids handled safely, replay dedup holds across multiple state transitions | Same migration | `fd96a8c` | 10 live checks against a single row starting in `PROVIDER_ACCEPTED` (the exact status this fix addresses): `delivered` applies over the unrecognised-before-the-fix status, a stale `sent` event does not regress `delivered`, a later `complained` event applies over `delivered`, a later `delivered` event does not regress `complained`, an unknown provider_message_id is safely ignored, and the very first event id is still correctly deduplicated several transitions later | `PASS` — all 10 passed | PR #43 | Live test run, this work cycle |
| Extended static test script | `scripts/release-c-email-secure-delivery-tests.mjs` (sections 13-17, `npm run release-c:test-email-secure-delivery`) | `fd96a8c` | Ran manually | `PASS — node scripts/release-c-email-secure-delivery-tests.mjs exit 0, all assertions ok` | — | Script output, this work cycle |
| Regression: Release A tests still pass | `scripts/release-a-backlog-reconciliation-tests.mjs` | — | Re-run after the closure changes | `PASS — all assertions ok, unaffected` | — | This work cycle |
| Regression: Release B tests — one assertion corrected, not silently left failing | `scripts/release-b-durable-fulfilment-tests.mjs` | `fd96a8c` | Its blanket "worker route never references customer_name/customer_email" assertion predated Release C's own delivery phase in that same file (added in `f9898e4`, before this closure cycle), which legitimately reads `customer_name` to personalise the report-ready email body — not a log line or HTTP response, the actual PII-leak surface the assertion was meant to protect. Narrowed to check specifically inside `console.*()`/`NextResponse.json()` calls | `PASS — the narrowed assertion is a more accurate test of the same underlying principle, not a weakened one; re-ran clean` | — | This work cycle |
| Regression: Release C's own test script | `scripts/release-c-email-secure-delivery-tests.mjs` | `fd96a8c` | Re-run after the closure changes | `PASS — all assertions ok` | — | This work cycle |
| Full local migration replay (35 migrations) | — | — | `supabase db reset` | `PASS — clean replay, only benign idempotency NOTICEs` | — | This work cycle |
| GitHub CI on the final integrated head (`8f309f2` = closure cycle + postcss fix + item 1 + the list/detail bounce-visibility follow-on fix, all rebased/merged together, one linear history) | — | `8f309f2` | `gh run list --branch release-c/email-secure-delivery`, polled to completion | `PASS — all 6 required workflows green: Supabase Migration Replay, Phase 1 Release Safety, Phase 2-3 Release Safety, V1 Verification, V7 Report Hardening, Security Scans` | — | This work cycle |
| **Found, flagged, then fixed:** "Security Scans" / dependency-audit gate failed on a new `postcss` advisory (`GHSA-r28c-9q8g-f849`, high severity, no documented exception) | — | — | Confirmed unrelated to this cycle's changes: the identical workflow passed on this same branch 2.5 hours earlier (run `30110696252`), and `git diff` between that commit and this one touches zero dependency files (`package.json`/`package-lock.json` unchanged) — the npm advisory database itself changed between runs, not this repo's dependency tree | `FLAGGED, then FIXED (see next row) — the npm advisory database change was confirmed real and repo-wide, not a false positive` | — | GitHub Actions run `30121124740` |
| PostCSS advisory remediation (`GHSA-r28c-9q8g-f849`, high, `<=8.5.17`) | Affected `node_modules/postcss` (direct devDependency, resolved `8.5.17`) and `node_modules/next/node_modules/postcss` (copy vendored inside `next@14.2.13`, pinned exactly `8.4.31`). `package.json`: bumped the top-level `postcss` devDependency `^8.4.47` → `^8.5.23` and added `"overrides": { "postcss": "^8.5.23" }` to force Next's internally-pinned nested copy onto the same patched version (same v8 major, semver-compatible, not a Next/Node/React upgrade — outside the `no-go-boundary.md` restriction). Also removed the two now-stale `postcss` exception entries (`GHSA-qx2v-qp2m-jg93`, `GHSA-6g55-p6wh-862q`) from `security/dependency-audit-exceptions.json` — the version bump fixes their underlying advisories too, so the exceptions became dead documentation rather than being left in place | `a573cd0` | (a) `npm audit --omit=dev --json` before/after — postcss entry present with all 3 advisories before, absent entirely after (only 1 resolved postcss location, both instances deduped to `8.5.23`); (b) `node scripts/phase14-dependency-audit-gate.mjs` against the post-fix audit output; (c) `npm run typecheck`; (d) `next build` (full production build, exercises the Tailwind/PostCSS pipeline both instances were part of); (e) GitHub Actions run on the pushed commit | `PASS — (a) postcss fully absent from the production-only audit, only the pre-existing/still-necessary `next` major-upgrade exception remains (21 findings suppressed, unchanged); (b) gate script exit 0, 0 blocking; (c) tsc --noEmit exit 0; (d) next build exit 0, no output-affecting regression; (e) Security Scans workflow run `30122823214` — all 3 jobs (M11 dependency audit, M12 secret scanning, L3 CodeQL) pass on head `a573cd0`, confirmed via `gh run view`` | PR #43 | GitHub Actions run `30122823214`; local `npm audit`/gate-script/build/typecheck output, this work cycle |
| Doc updates | `14-release-c-existing-delivery-audit.md` (addendum), `15-email-and-secure-delivery-design.md` (closure cycle addendum), `16-email-and-secure-delivery-runbook.md` (recipient correction, bounce, complaint, legacy-vs-Release-C, no-direct-SQL sections) | `(this commit)` | Manual review | `PASS` | — | — |
| Resource cleanup | Same local Docker/Supabase project `mk-repo`, ports 55321-55329, one additional `supabase start`/`supabase stop` cycle for this closure work | — | `docker volume ls`/`docker ps` after teardown | `PASS — containers stopped, volumes removed, pre-existing unrelated repo project untouched` | — | This work cycle |
| Item 1 (unified admin delivery-state display) | `src/lib/reports/phase1-operations.ts` (`annotateOrdersWithPhase1State`) | `f642f09` | Landed from the parallel session, reviewed before integration: confirmed the diff only touches delivery-state/queue-classification logic, correctly sources `report_delivery_authorizations` (not the legacy table) for the admin orders list/queue page, and deliberately leaves `getPhase1OrderOperations` (order-detail page) reading `manual_report_delivery_attempts` unchanged after auditing its one real remaining consumer (a distinct, still-live legacy/provider-double delivery action, not real customer delivery) — verified this reasoning independently, not just accepted the commit message. Verified via `npm run typecheck`, all three static suites, and `npm run build`, all clean, after rebasing onto the concurrently-landed postcss fix (no file overlap, no conflicts). | `PASS` — landed, reviewed, integrated | PR #43 | This work cycle |
| **Found during integration review, fixed, not left as a silent gap:** item 1's landed fix reads only `report_delivery_authorizations.status`, which a bounce/complaint webhook never updates (only the linked `email_events.status` changes) — so a bounced/complained order would have kept showing as `delivered` in the queue forever. Reproduced live before fixing (a synthetic `finalized` authorization showed `delivered`; flipping the linked `email_events.status` to `bounced` changed nothing until the fix). Fixed additively in the same function: the query now embeds `email_events(status)` via the existing FK, and a bounce/complaint on that linked row overrides the queue-classification `deliveryState` regardless of the authorization's own status. | Same file, extending `f642f09`'s own pattern | `(this commit)` | 3 live checks: clean `finalized` row shows `delivered`; same row with `email_events.status='bounced'` shows `bounced`/`delivery_failed`/`immediate_attention` (not `delivered`); same with `complained` | `PASS` — bounce and complaint now correctly override the queue display, reproduced failing before the fix and passing after | — | This work cycle |
| **Found during integration review, fixed:** the order-detail page's own "Real delivery & customer access" card (`getOrderDeliveryState()` in `delivery-recovery-service.ts`, built earlier this closure cycle) had the same gap as item 1's original bug — it read `report_delivery_authorizations.status` directly with no bounce/complaint override, so after fixing the queue-list view a bounced order would show `delivery_failed` on the orders list but still `finalized` on its own detail page. Fixed identically (same email_events(status) embed, same override logic) so list and detail-page delivery truth agree, matching the acceptance requirement explicitly. | `src/lib/reports/delivery-recovery-service.ts` (`getOrderDeliveryState`, `mapAuthorization`) | `(this commit)` | Live check: same fixture order set directly to a bounced state, `annotateOrdersWithPhase1State()` and `getOrderDeliveryState()` called side by side | `PASS — both report deliveryState/status = 'bounced' for the same order; confirmed to disagree before the fix (detail still showed 'finalized'), agree after` | — | This work cycle |
| **Correction:** the "item 1 ... fixed on both the orders list and the order-detail page" claim two rows above was accurate for `getOrderDeliveryState()`'s own return values (the "Real delivery & customer access" card), but not for the order-detail page as a whole — its separate, higher-up "Fulfilment status" primary summary (`SnapshotValue label="Delivery state"`) still read `operations.latestDelivery?.status` (`manual_report_delivery_attempts`, the legacy table) as of `94d2d89`, and was passed unchanged into `FulfilmentActions`. A delivered order could therefore still show "Real delivery: delivered" in one card and "Fulfilment status: not delivered" a few lines above it on the same page — exactly the contradictory-information failure mode the acceptance brief named. Not caught by this cycle's own live checks because they called `annotateOrdersWithPhase1State()`/`getOrderDeliveryState()` directly, not the page component itself. | `src/app/score/admin/orders/[orderReference]/page.tsx` | — | Read the page source directly (not just its data-layer dependencies) | `FAIL at 94d2d89 — not yet fixed. See the next row for the fix, from a different work session against this same branch.` | — | This document |
| Order-detail primary-summary delivery-truth unification (the fix for the gap above): `getOrderDeliveryState()` now also returns `currentDeliveryStatus`/`currentDeliveryBucket` — the latest authorization's already bounce/complaint-resolved status (`mapAuthorization`, per `8f309f2`) classified via a new `classifyDeliveryBucket()` exported from `phase1-operations.ts`, the exact same classification `annotateOrdersWithPhase1State` uses for the admin orders list. The page's primary summary now shows this authoritative value under "Customer delivery status (Release C)". The legacy manual/provider-double action is kept (not removed) — `FulfilmentActions` still receives the unchanged `legacyDeliveryState` and its button still works — but is now explicitly captioned as not reflecting real Release C delivery, and the legacy delivery-history section is retitled "Legacy manual delivery history". Reconciled with `8f309f2` rather than reimplementing its already-tested bounce/complaint logic: reused its query/override logic in both files byte-for-byte, adding only two additive exports and one new pure function to `phase1-operations.ts`, and two derived fields plus one import to `delivery-recovery-service.ts`. | `src/lib/reports/phase1-operations.ts`, `src/lib/reports/delivery-recovery-service.ts`, `src/app/score/admin/orders/[orderReference]/page.tsx`, `scripts/release-c-order-detail-delivery-truth-tests.mjs` (new) | `f9e1ade`, `2e4207e`, `dbd8705` | (a) New functional-coverage script, 21 checks: 14 static source assertions (legacy controls still wired, legacy/real delivery clearly labelled separately, both call sites use the same exported classifier) + 7 live-Postgres scenarios against a full 35-migration replay (finalized→delivered and pending→delivery_pending identical in both views; a bounced or complained delivery remains a visible exception — raw status preserved, e.g. `bounced`/`complained`, never generically relabelled — in both views; a contradictory legacy `manual_report_delivery_attempts` row never overrides the real, finalized status; a legacy-only order still shows its legacy history while correctly classifying as `not_ready` for real delivery; 6 fixture orders partition cleanly across buckets with zero double-counting); (b) `scripts/release-c-email-secure-delivery-tests.mjs` re-run, unmodified, still passing; (c) GitHub CI, polled to completion across 3 pushes | `PASS on the 3rd push (dbd8705) — all 6 required workflows green. **Not a clean first pass:** `f9e1ade` failed CI's typecheck job (`CardHeader` doesn't accept an `id` prop — this session's local sandbox intermittently blocks on file reads during CPU/IO-heavy operations, including `tsc`, so a live local typecheck could not be obtained before pushing; recorded as a local-environment issue, not investigated further per standing instruction, and relied on CI as the authoritative check instead); fixed in `2e4207e`, which then failed `next build`'s `react/no-unescaped-entities` lint rule on two literal quote/apostrophe characters in new caption text (a second, separate CI gate the same local flakiness couldn't have caught either way); fixed in `dbd8705`, which passed clean. All three fixes were fast, targeted, single-cause corrections, not blind retries.` | PR #43 | GitHub Actions runs on `f9e1ade`/`2e4207e`/`dbd8705`; local script output, this work cycle |
| **Correction:** the claim two rows above ("all 6 required workflows... green on the final integrated head (`8f309f2`)") was accurate for that commit, but is not the current state -- every commit after it is a new final head that must independently satisfy the required checks, and none of the ones after `8f309f2` had been polled to completion before being described as final. The order-detail delivery-truth unification work (`f9e1ade`, then two CI-caught-and-fixed follow-ups `2e4207e`/`dbd8705`) and the evidence-pack update (`230248f`, docs-only) landed on top. `230248f` -- despite touching only a markdown file -- surfaced a real, independently-reproduced Security Scans failure: npm's advisory database added 11 new blocking Critical/High findings (dependency-audit gate, job M11) between the CI run on `dbd8705` and the one on `230248f`, all tracing to a single advisory in the `workflow` package's own dependency tree, pre-existing and unrelated to any change in this cycle. Not declared unrelated-and-ignored; investigated and fixed -- see the next row. | `package.json` (`workflow` dependency), `package-lock.json` | `230248f` (finding), `cf0e3f5` (fix) | Read the actual GitHub Actions failure log (`gh run view --log-failed`), not just the pass/fail summary | `FOUND at 230248f -- Security Scans failing, 0/6 required workflows confirmed on that head at time of writing. Fixed at cf0e3f5, see next row.` | — | GitHub Actions run on `230248f`; this document |
| Dependency-audit remediation: `GHSA-mh99-v99m-4gvg` (`brace-expansion`, DoS via unbounded expansion length causing an out-of-memory crash, high severity, `<=5.0.7`) | Root-caused, not just patched blind: every one of the 11 blocking findings (`@oclif/core`, `@oclif/plugin-help`, `@swc/cli`, `@workflow/cli`, `@workflow/nest`, `brace-expansion`, `ejs`, `filelist`, `jake`, `minimatch`, `workflow`) is the single transitive chain `brace-expansion -> minimatch -> {filelist, @swc/cli} -> {jake, @workflow/nest} -> {ejs, @swc/cli} -> {@oclif/core, @workflow/cli}` pulled in by `workflow` (a direct dependency, imported in `src/workflows/premium-report-fulfilment.ts`, not just build tooling). Checked whether a patch/minor `workflow` bump fixes it first (remediation order steps 1-2): `workflow` 4.6.1/4.6.2 both exist and were checked -- no, because `@workflow/nest`'s own `package.json` declares `"@swc/cli": ">=0.4.0"` as a peer dependency in both the current and candidate versions, an unbounded range unaffected by a workflow patch bump, so a parent-package bump alone doesn't move the vulnerable resolution. Fixed via remediation order step 3 (narrow npm override, demonstrated compatible): added `"brace-expansion": "^5.0.8"` to `package.json`'s existing `overrides` block (same established pattern as the prior `postcss` override, `a573cd0`) -- brace-expansion is a single-function glob-brace-expansion utility with no application-facing API surface in this codebase. `npm ls brace-expansion --all` after the override confirms all 6 previously-divergent installed copies (spanning two majors, `2.1.2` and `5.0.7`) now dedupe to the single patched `5.0.8`. Did not use `npm audit fix --force`, did not perform an uncontrolled major upgrade of `workflow` itself, did not suppress the workflow, and no exception was added to `security/dependency-audit-exceptions.json` (an exception was not needed once the actual fix was found) | `package.json`, `package-lock.json` | `cf0e3f5` | (a) `npm install` clean (10 packages removed, 2 changed); (b) `npm audit --omit=dev --json` + `node scripts/phase14-dependency-audit-gate.mjs`: 0 blocking Critical/High (down from 11), only the pre-existing, already-documented `next` exceptions remain, untouched; (c) `npm run typecheck`; (d) `npm run build` (full production build); (e) all three release static suites (`release-a`/`release-b`/`release-c`) re-run unmodified; (f) full local migration replay (35 migrations) and all 21 order-detail delivery-truth checks re-run, confirming this dependency-only change has no code-level side effects; (g) GitHub Actions, all 6 required workflows, polled to completion on this exact commit | `PASS -- (a)-(f) all clean locally; (g) Supabase Migration Replay, Phase 1 Release Safety, Phase 2-3 Release Safety, V1 Verification, V7 Report Hardening, Security Scans all conclusion:success on head cf0e3f5, confirmed via gh run list filtered to that exact SHA, not inferred from an earlier commit` | PR #43 | GitHub Actions runs on `cf0e3f5`; local script/command output, this work cycle |
| **The true current final head, all 6 required workflows independently confirmed green on this exact SHA:** `cf0e3f5` | — | `cf0e3f5` | `gh run list --branch release-c/email-secure-delivery --json headSha,status,conclusion,workflowName`, filtered to `headSha == cf0e3f5`, polled until every one of the 6 required workflow runs for that SHA showed `status:completed` | `PASS -- Supabase Migration Replay, Phase 1 Release Safety, Phase 2-3 Release Safety, V1 Verification, V7 Report Hardening, Security Scans: 6/6 conclusion:success on cf0e3f5` | — | GitHub Actions, this work cycle |
| Controlled live Resend verification (real API auth, real domain acceptance, real webhook round-trip against a Preview deployment) | — | — | Re-investigated this cycle (owner-attested facts -- a configured Resend account, `mkfraud.co.za` domain authentication, Vercel environment setup, sender addresses, and the webhook -- are treated as given, not re-questioned): checked for a way to independently operate on that configuration -- Vercel MCP tools available in this session (`get_project`/`list_projects`/`get_deployment`/`list_deployments`/`get_deployment_build_logs`/`get_runtime_logs`/`get_runtime_errors`/`get_web_analytics`) are read-only; there is no tool in this session's Vercel MCP surface that reads or writes environment variables; no Resend MCP tool of any kind is available in this session; no `vercel` CLI binary exists on this machine (`which vercel` -> not found). Originally (prior cycle) confirmed via `list_teams`/`list_projects`/`get_project`/`list_deployments` that the linked Vercel project (`mk-fraud-platform`, team `Tondani's projects`) exists, `mkfraud.co.za`/`www.mkfraud.co.za` are attached domains, and every push to this branch already auto-deploys a live Preview via Vercel's GitHub integration (discovered as a side effect of this investigation, not something separately triggered) | `BLOCKED — not a false pass or fail. Three concrete, confirmed gaps, not caution: (1) no available tool reads or writes Vercel environment variables, so MK_EMAIL_PROVIDER_MODE cannot be set to test for Preview; (2) which Supabase project backs Preview is unverifiable without that same access, and this programme's standing production-read-only rule cannot be honoured on a guess; (3) no authenticated admin session exists against the live Preview app to trigger the order/payment/quality-review flow. None of these are worked around by improvising — doing so risked either touching production data or an uncontrolled action on a real paid account. Deferred to the MK owner via a written, step-by-step runbook instead.` | — | `docs/safe-launch/18-controlled-resend-preview-verification.md`, `scripts/release-c-live-webhook-probe.mjs` |

### Current testing conclusion (Release C, this cycle)

| Item | Status |
|---|---|
| Branch relationship (PR #43 base/head) | `PASS` |
| `npm run typecheck` | `PASS` |
| Migration replay (35 migrations) | `PASS` — locally |
| Release C DB/core-service SQL behaviour (20 live checks) | `PASS` — locally |
| Real-send notification wiring (26 live checks) | `PASS` — locally |
| Admin delivery/token recovery (22 live checks, real auth session) | `PASS` — locally |
| Provider webhook re-verification (12 live checks, real crypto) | `PASS` — locally |
| Closure cycle: missing-recipient, bounce, complaint, ordering (43 live checks total) | `PASS` — locally |
| Static test scripts (Release A, B, C) | `PASS` — all three, B's assertion corrected not weakened |
| GitHub CI — all 6 required workflows on the true current final head (`cf0e3f5`) | `PASS` — Supabase Migration Replay, Phase 1 Release Safety, Phase 2-3 Release Safety, V1 Verification, V7 Report Hardening, Security Scans all `conclusion:success`, filtered and polled to completion for this exact SHA via `gh run list`. (Was green on `8f309f2`'s ancestor `dbd8705`, but `230248f` -- a docs-only commit -- surfaced a new Security Scans failure via npm's advisory database; see the dependency-audit row below. A later commit's CI status is never inferred from an earlier one's.) |
| Dependency-audit finding and fix (`GHSA-mh99-v99m-4gvg`, `brace-expansion` DoS, found at `230248f`, fixed at `cf0e3f5`) | `PASS` — root-caused to a single advisory across 11 packages in the `workflow` dependency's own tree; patch/minor `workflow` bumps don't fix it (verified, not assumed); fixed via a narrow `overrides` entry, same pattern as the prior `postcss` fix; full local verification (typecheck, build, all 3 release suites, migration replay, audit gate) plus CI all clean |
| PostCSS advisory (`GHSA-r28c-9q8g-f849`) | `PASS` — fixed via an `overrides`-forced version bump to `8.5.23`, not an exception. Present on Release C (`release-c/email-secure-delivery`) only as of this cycle — not yet propagated to Release B, Release A, or `main`; propagation through the stacked release chain is deliberately deferred to integration |
| Admin dashboard delivery-state display (item 1) | `PASS` — landed, reviewed, integrated; bounce/complaint-visibility fixed on the orders list and `getOrderDeliveryState()`'s own return values; the order-detail page's separate primary-summary contradiction (found after the row above was first written — see the "Correction" row) fixed and CI-confirmed as of `dbd8705`. List and order-detail-page delivery truth now agree everywhere on the page, not just in the "Real delivery" card |
| Controlled live Resend verification (real send against Preview) | `BLOCKED` — tooling/access gap (Vercel env vars, Preview's DB identity, admin session), not a false pass. Owner-executed runbook written instead: `18-controlled-resend-preview-verification.md` — this is the one remaining item before real customer email can be certified |
| Cloud migration execution | `NOT TESTED` — no Supabase Cloud environment has applied this migration |
| Domain authentication (SPF/DKIM/DMARC) | `NOT CONFIGURED` — documented this cycle, DNS access required |
| External provider connection | `BLOCKED` — owner decision gate, not attempted |
| Runbook | `PASS` — `16-email-and-secure-delivery-runbook.md`, extended this cycle |
| Paid customer journey | `NOT READY` |

**Production status: `NOT READY FOR PRODUCTION`.**
All landed-work acceptance criteria for this cycle are met on the true final head (`cf0e3f5`):
the unified admin delivery-state fix is integrated with its own list/detail-agreement gap fixed,
the newly-found dependency security advisory is remediated (not suppressed), all regression tests
pass, and all 6 required GitHub workflows are confirmed green on that exact commit (not inferred
from an earlier one). That satisfies the implementation gate, but not the production gate: no
controlled Resend send was performed this cycle (see the row above -- genuinely blocked at the
tooling level, not attempted around), so external-provider delivery remains unverified end to end.
Per this program's completion gate, `IMPLEMENTATION COMPLETE — EXTERNAL PROVIDER CERTIFIED IN
PREVIEW` may only be used once a controlled send is actually confirmed (provider IDs persisted, a
signed delivered webhook received, controlled mailbox receipt confirmed, Preview returned to
disabled) -- none of that happened this cycle. Domain authentication (SPF/DKIM/DMARC), the
external-provider connection decision gate, and the deferred Supabase Cloud migration execution
also remain open, owner-actionable items, per the owner-attested configuration facts above. No
external provider send, DNS configuration, or production deployment is claimed as complete
anywhere in this document. This status must never be read as production authorisation.

### Controlled Resend send cycle (commits `5fa9653`, `7b1dfa7`) -- two real sends, webhook root-caused and fixed at the tooling level

With `MK_EMAIL_PROVIDER_MODE=test` confirmed active on a genuinely redeployed Preview (deployment
timestamp independently checked against the redeploy time, not assumed), two real controlled sends
were made against the live Resend account: `customer_order_confirmation` and
`admin_new_order_notification` for synthetic order `MKORD-2026-960J4HDD`. Independently observed
(read-only DB query, `email_events` table): both rows show `provider_mode=external`,
`status=sent`, a real persisted `provider_message_id`, and a populated `sent_at`. Owner-attested:
real mailbox receipt of the admin alert at `admin@mkfraud.co.za` (screenshot provided), matching
the order reference exactly. The admin-alert recipient bug from the prior cycle's first attempt
(fell back to the customer address) is confirmed fixed -- the recipient is now correctly
`admin@mkfraud.co.za`.

Independently observed: no signed webhook ever arrived for either message, despite confirmed real
delivery. Root-caused via read-only queries, not assumed: `PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET`
/ `PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET` have never existed in Vercel, and the paired Supabase
secrets (`provider_webhook_db_hmac` / `provider_lookup_db_hmac`) were never written via
`set_phase14_runtime_secret` -- `phase14_private.runtime_secrets` and the append-only
`email_provider_events` table were both confirmed empty. No tool available in any session up to
this point could write a Supabase secret or a Vercel env var, so this had no path to self-heal.

Fixed at the tooling/capability level this cycle (see commit `5fa9653` for the full technical
account): a new admin-only secret-provisioning control (`/score/admin/phase14-activation`,
"Runtime secret provisioning" card) calls the existing `set_phase14_runtime_secret` RPC --
`platform_admin` + AAL2 gated, never bypassing the RPC or touching `phase14_private.runtime_secrets`
directly. Verified end-to-end against a disposable local Postgres with all 37 migrations replayed
(`scripts/release-c-runtime-secret-provisioning-tests.mjs`): `ingest_phase14_provider_webhook` fails
closed with `phase14_attestation_secret_unprovisioned` before the secret exists, and succeeds --
creating exactly one attestation, applying the verified state to the correlated `email_events` row
-- after, with a byte-identical replay proven idempotent.

### Correction: this was capability, not a path to provisioning -- the live cloud schema is not on Release C (or A/B) yet

A controller-verified finding, independently reconfirmed by this cycle's own read-only audit against
`jvjxlphdyzerrhwcgkup` (full detail: `19-release-c-cloud-schema-reconciliation.md`), corrects the
paragraph above: it is not accurate to say "the two secret values still need to be generated and
submitted by the owner via the new UI" as if that were the only remaining step. The live migration
ledger stops at `20260721150808`, before Release A's own first migration -- **Releases A, B, and C
are all unapplied to the live database**, not only Release C's three migrations. Confirmed via
`pg_proc`/`information_schema` introspection: the deployed runtime-secret-provisioning route calls
`set_phase14_runtime_secret` with a `p_reason` parameter that does not exist on the live 2-argument
function, `customer_report_access_tokens` doesn't exist, `approve_quality_review` and every new
Release C delivery/webhook RPC don't exist under any signature, and `record_payment_transition`'s
live function body is confirmed (via `pg_get_functiondef`, not inferred) to be the pre-Release-B
version with no fulfilment-job queuing. **Owner secret entry must not be attempted until the cloud
schema is reconciled** -- the deployed route would fail against the live schema regardless. See
`19-release-c-cloud-schema-reconciliation.md` for the full per-migration comparison and a decision
memo on how to close this gap (an isolated Supabase branch, deferring to an integrated
release-candidate migration, or applying to shared `main` now -- assessed, not recommended, given
the 18 existing `payment_received` orders and the unconfirmed compatibility with whatever code
Production currently runs).

Real Resend acceptance, delivery, and one owner-confirmed mailbox receipt remain valid evidence for
messages 1 and 2 (§0 of that document explains why -- they don't depend on any unapplied migration).
Signed webhook ingestion and messages 3 and 4 remain uncertified, and cannot become certified under
the current cloud schema no matter how the runtime secrets are handled.

### Controller decision: Option B approved -- Release C accepted as `CODE IMPLEMENTATION COMPLETE — CLOUD CERTIFICATION DEFERRED`

The controller reviewed `19-release-c-cloud-schema-reconciliation.md`'s three-option memo and
approved **Option B**: defer all Supabase Cloud migration execution and full cloud certification
until Releases A-D are integrated into one release-candidate branch. Option A (isolated Supabase
branch) is deferred, not pursued now. Option C (apply pending migrations to shared `main` now) is
not authorised. No migration was applied, no Supabase branch was created, and no change was made to
`main` in the course of this decision.

**Retained as valid evidence:** customer order-confirmation sent through Resend; admin new-order
notification sent through Resend; real provider message IDs persisted for both;
`provider_mode=external` confirmed for both; the admin-alert recipient bug fixed; real mailbox
receipt independently confirmed for the admin alert; the Preview protection bypass proven to reach
the webhook route; webhook signature verification advanced far enough to correctly identify the
missing-secret / missing-attestation cloud-schema dependency.

**Retained as uncertified:** successful HTTP 200 webhook ingestion; a persisted provider
attestation; the payment-confirmed email; the report-ready email; quality-review approval; secure
customer report-access token issuance; token revocation and reissue; bounce/complaint handling
against the cloud schema; durable fulfilment against the shared cloud database.

Release D is authorised to proceed as code-only work under the same constraint -- see
`20-release-d-scope-and-existing-infrastructure-audit.md`. Production status remains `NOT READY FOR
PRODUCTION`; this is the accepted, documented state of this cycle, not an open defect.

**Preview environment rollback (owner action, in progress):** per the controller's decision, the
owner is setting `MK_EMAIL_PROVIDER_MODE=disabled`, redeploying `release-c/email-secure-delivery`,
and temporarily disabling (not deleting, not rotating the signing secret for) the Resend webhook
targeting this Preview. As of this entry, no new Preview deployment beyond the branch's normal
auto-deploy-on-push has appeared (checked read-only via the Vercel API). This section will be
updated with the rollback's independent verification once the owner confirms the change is made.

---

## Release D evidence

Scope: `20-release-d-scope-and-existing-infrastructure-audit.md`. Controller's D0 approval amended
the originally-proposed read-only alerts surface to require an actionable, audited lifecycle — see
that document's §5 for the full record of the amendment. PR #44, base `release-c/email-secure-delivery`
(stacked, same constraint chain as #41/#42/#43): **explicitly cloud-uncertified**, nothing applied to
`jvjxlphdyzerrhwcgkup` or any Supabase project.

**What was built:**
- `/score/admin/operational-alerts` — server-side filtered/paginated admin list, read-gated to the
  four existing table-select roles (`platform_admin`, `reviewer`, `approver`, `read_only_admin`).
  Detail rendering goes through an explicit per-category safe-field allow-list
  (`src/lib/reports/operational-alerts.ts`); raw `detail_json` is never rendered.
- `transition_phase14_operational_alert` — one new SECURITY DEFINER RPC (migration
  `20260725150000_release_d_operational_alert_lifecycle.sql`), the sole authoritative path for the
  open/acknowledged/resolved lifecycle. Mutation restricted to `platform_admin`/`reviewer`; requires
  a non-empty reason; uses the existing `phase14_require_actor` AAL2 gate; writes one `audit_logs`
  entry per transition (alert key, previous/new status, reason — never `detail_json`); reopening
  clears both acknowledgement and resolution metadata.
- Cloud-capability detection via PostgREST OpenAPI introspection
  (`checkOperationalAlertLifecycleCapability`) — fails closed against the current shared cloud schema
  (no raw PostgREST error surfaced, no direct-table-update fallback, no temporary cloud RPC, no
  synthetic alert inserted anywhere near the shared database).
- Nav entry with an open-critical-alert count badge (`AdminShell.tsx`), backed by a small partial
  index, silently omitted on any query failure.
- `21-go-live-checklist.md`, `22-release-and-rollback-runbook.md`, `23-vercel-operational-inventory.md`.
- `vercel.json` — deliberately unchanged. Per the controller's explicit instruction, no "prepared but
  inert" cron entry was added; the target cadence/plan dependency is recorded as an owner decision in
  the checklist and inventory docs only.

**Local verification — PASS, verified this cycle:**
- `scripts/release-d-operational-alerts-tests.mjs` — the required 18-case suite: 13 executed live
  against disposable local Postgres with all 37 accumulated A-D migrations replayed (including a real
  alert created through Release C's own `apply_email_provider_event_atomic` bounce/complaint path,
  read back and rendered through the real, non-reimplemented presentation mapper — not a synthetic
  fixture); 2 covered by static source assertions; 1 by pure-function tests against fixture OpenAPI
  documents; 1 (`all prior Release A/B/C tests remain green`) deferred by design to the pre-existing
  separate npm scripts, run alongside this one this cycle. Full run: "All Release D operational-alerts
  checks passed."
- `npm run typecheck` — PASS, no errors.
- `npm run build` — PASS, production build succeeds; `/score/admin/operational-alerts` and
  `/score/api/admin/operational-alerts/[alertId]/transition` both compile as expected dynamic routes.
- Dependency audit gate (`npm audit --omit=dev --json` → `phase14-dependency-audit-gate.mjs`) — PASS,
  0 unsuppressed Critical/High findings; the 21 suppressed findings are the same pre-existing,
  documented `next` exceptions carried from every prior release, nothing new introduced.
- `release-a:test-backlog-reconciliation`, `release-b:test-durable-fulfilment`,
  `release-c:test-email-secure-delivery`, `release-c:test-runtime-secret-provisioning`, and the
  order-detail delivery-truth suite — all PASS, unchanged, re-run this cycle alongside Release D's own
  suite (item 18 of the required test list).
- Complete migration replay — PASS, confirmed both by every embedded-postgres suite above booting
  against all 37 migrations (including `20260725150000`) and independently by the
  "Supabase Migration Replay" GitHub workflow on the final head below.

**CI — PASS, all 6 required workflows green on the exact final head `dff69d2` (not an earlier
commit):** V1 Verification (×2, push + pull_request triggers), Security Scans, Phase 1 Release
Safety, Phase 2-3 Release Safety, Supabase Migration Replay, V7 Report Hardening. One intermediate
head (`bdc6f05`) carried two CodeQL findings (unused variables `gateRow` in the test script and
`pendingTarget` in `OperationalAlertActions`, neither a security or correctness issue — both were
dead reads/writes); both were removed in `dff69d2`, re-verified locally (typecheck + the Release D
suite), and CodeQL's own re-scan on `dff69d2` shows both findings resolved.

**Explicitly not claimed:** no cloud migration applied; no live PostgREST capability-detection test
against a real Supabase project (proven only via fixture-based pure-function tests and the documented
fail-closed design, per the controller's explicit prohibition on touching the shared database or
creating a temporary cloud RPC); no Production or account-level change of any kind.

### Controller correction cycle: operational-queue correctness defects (not cosmetic)

Controller review of head `503f383` found one material queue-ordering defect and two related
filter-correctness defects in `/score/admin/operational-alerts`. **These are recorded as operational
correctness defects, not cosmetic refinements** — each one would have produced wrong information to
an operator triaging alerts, not just an imperfect display:

1. **Global critical-first ordering was applied after pagination, not before.** The list query
   ordered by `created_at desc`, applied `.range()`, and only then re-sorted the already-paginated
   25-row page critical-before-warning in application code. An older critical alert more than 25
   rows back in `created_at desc` order could be hidden on page 2 or later, behind newer warnings —
   the operator's "what needs attention right now" view could silently omit the most urgent open
   item. **Fix:** severity/created_at ordering moved into the database query itself, before
   `.range()`, via a new shared function (`buildOperationalAlertListQuery`,
   `src/lib/reports/operational-alerts.ts`) used by the real page; the in-memory re-sort was removed
   entirely. A new index (`phase14_operational_alerts_severity_created_idx` on
   `(severity, created_at desc)`) supports the true default (no-status-filter) query shape; the
   pre-existing open-critical partial index was not removed.
2. **The "to" date filter used an inclusive `lte` on a bare `YYYY-MM-DD` value**, which compares
   against midnight UTC on the selected day and silently excludes every event later that same day —
   an operator filtering "up to today" would see today's alerts vanish. **Fix:** a new
   `normalizeOperationalAlertDateRange` function computes an inclusive start bound for "from" and an
   *exclusive* start-of-next-day bound for "to" (`.lt()`, not `.lte()`); invalid date values are
   dropped before ever reaching a query (never a raw database error) and surface a controlled notice
   banner instead.
3. **Each status-count query reused the list's own status filter, then appended its own** — when an
   operator selected `resolved` in the list, the open/acknowledged count queries received both
   `.eq('status','resolved')` (from the shared filter helper) and their own `.eq('status','open')` /
   `.eq('status','acknowledged')`, an impossible AND that silently zeroed both badges. **Fix:** filters
   split into `applyOperationalAlertNonStatusFilters` (severity/category/date only, shared by the list
   and all three counts) and `applyOperationalAlertListFilters` (adds the list's own status filter on
   top); each count query now applies exactly one status condition. Count-query errors are also now
   rendered as an explicit "unavailable" marker (`formatOperationalAlertCount`) rather than a silent 0.

**Proof, not just the fix:** all three corrected functions are exported from
`src/lib/reports/operational-alerts.ts` and used verbatim by the real page — the same functions are
exercised in `scripts/release-d-operational-alerts-tests.mjs` via a recording query-builder mock
(proving the real call sequence: both `order()` calls happen before `range()`; the status
count-filter helper never issues a `status` condition) and via three new live-Postgres scenarios
(19–21) against real rows: 25 newer warning alerts plus 1 older critical alert prove the critical
alert lands on page 1 with no duplicate rows on page 2; an alert at `23:59:59.999` on the selected
final day and one at `00:00:00.000` the next day prove the date bound is correctly inclusive/exclusive;
three alerts in open/acknowledged/resolved under a shared category filter prove all three counts stay
accurate regardless of which status is selected in the list. Full suite: 134 assertions, all passing.

**CI on the correction's own exact final head `b8d0b17` (not `503f383`, per the controller's explicit
instruction not to reuse the earlier result):** all 6 required workflows green — V1 Verification (×2,
push + pull_request), V7 Report Hardening (×2), Security Scans, Supabase Migration Replay, Phase 1
Release Safety, Phase 2-3 Release Safety. No new CodeQL findings; no open review threads. A follow-up
docs-only commit (`03310eb`) recording that result was independently re-confirmed on its own exact
head, not assumed to inherit `b8d0b17`'s status.

### Controller hardening pass: determinism, strict calendar validation, and operational timezone

Controller re-review of head `03310eb` confirmed the three original defects fixed, and required one
final narrow hardening pass before acceptance — again functional correctness, not cosmetic:

1. **Pagination was not fully deterministic when alerts shared both severity and created_at.**
   `severity asc, created_at desc` alone does not uniquely order rows with identical values on both
   columns; Postgres does not guarantee a stable tie order across repeated executions without an
   explicit tie-breaker. **Fix:** `id asc` added as a third, final ordering column in
   `buildOperationalAlertListQuery`, applied in the database before `.range()`, same as the other
   two. Both supporting indexes (`phase14_operational_alerts_severity_created_idx`,
   `phase14_operational_alerts_list_idx`) extended to include `id asc` as their final column,
   matching the query's own `ORDER BY` exactly. The open-critical partial index is untouched.
2. **Date validation relied on `Date.parse`/the `Date` constructor alone**, which silently rolls
   impossible calendar dates over into a nearby valid one (e.g. February 31 becomes March 3) rather
   than rejecting them. **Fix:** `parseStrictCalendarDate` parses the year/month/day components,
   constructs the intended UTC date, and round-trips it — the input is accepted only if the
   constructed date's year/month/day match exactly what was typed. Rejects month 00/13+, day 00, Feb
   31, Apr 31, Feb 29 on a non-leap year, and anything not shaped like YYYY-MM-DD; a real leap day
   (2024-02-29) is still accepted, proving the validator isn't simply rejecting all Feb 29 values.
   Also added: when both dates are individually valid but "from" is chronologically after "to", both
   bounds are dropped (`rangeOrderInvalid`) and a controlled "from date must not be after to date"
   notice is shown instead of sending a contradictory range to the database; entered values remain in
   the form for correction (the form already binds to the raw, unnormalized query-string values).
3. **Date bounds were computed as UTC calendar days, not the South African operational calendar.**
   This platform serves South African MK operators; a date-picker value of "2026-07-20" is a SAST
   (Africa/Johannesburg) calendar day, not a UTC one. **Fix:** `sastCalendarDayStartUtc`, backed by a
   named `SOUTH_AFRICA_OPERATIONAL_UTC_OFFSET_MS` constant (SAST is a fixed UTC+02:00 offset
   year-round — South Africa does not observe DST), converts each SAST calendar day boundary to its
   correct UTC instant. For 2026-07-20 SAST: inclusive start `2026-07-19T22:00:00.000Z`, exclusive end
   `2026-07-20T22:00:00.000Z` — exactly the bounds the controller specified.

**Proof:** all three fixes are exercised in `scripts/release-d-operational-alerts-tests.mjs` — a new
live-Postgres scenario (19b) inserts 30 alerts sharing identical severity and created_at, proving
page 1/page 2 never overlap, the concatenated paginated order exactly matches the full unpaginated
`ORDER BY` result, and repeated execution of the identical query returns an identical order; the
query-builder-mock tests were extended to prove the real `id` `order()` call happens third, after
severity/created_at and before `range()`, and that repeated calls with identical inputs produce an
identical call sequence; pure-function tests prove each of the calendar-rejection cases (Feb 31, Apr
31, Feb 29 2025, month 00/13, day 00, malformed strings) is rejected while a real leap day is
accepted, and that from-after-to is flagged distinctly from a single invalid value; a rewritten live
Scenario 20 inserts alerts at the four exact boundary instants the controller specified
(`2026-07-19T21:59:59.999Z` outside, `2026-07-19T22:00:00.000Z` inside, `2026-07-20T21:59:59.999Z`
inside, `2026-07-20T22:00:00.000Z` outside) and proves the real query includes/excludes each
correctly. Full suite: 167 assertions, all passing.

**Status: `CODE IMPLEMENTATION COMPLETE — CLOUD CERTIFICATION DEFERRED`.** Production status remains
`NOT READY FOR PRODUCTION`, matching every prior release this cycle (Option B, same constraint as
Release C's own accepted status above). Release D remains not yet controller-accepted pending this
hardening pass's own review.

---

## RC Revision 4 migration-reconciliation evidence

The RC reconciliation now separates four categories that must not be conflated:

1. **Exact applied-history archives:** `supabase/applied-history/0009_methodology_copy_polish.cloud.sql`
   preserves the exact ten cloud-ledger statements and fingerprint; it is audit history only and is
   not executed by migration tooling.
2. **Canonical active replay migrations:** the active `0009` replay repair uses the deterministic
   Production `MFRS-V1.1` UUID, while `20260709033522_phase10_v2_report_template_seed.sql` is restored
   verbatim from the cloud ledger. The exact historical `0009` SQL remains separate.
3. **Retired never-applied consolidated migrations:**
   `supabase/retired-migrations/0011_phase10_pdf_report_engine_additions.sql` preserves the local
   consolidated SQL but is explicitly outside canonical replay and must never be executed.
4. **Seven genuinely pending migrations:** `20260722143000`, `20260724150000`, `20260724160000`,
   `20260724170000`, `20260724180000`, `20260725090000`, and `20260725150000`, in that order.

The Revision 3 blocker history is retained in docs 24 and 25. The controller-selected repair does
not recreate `phase10_premium_pdf_report_engine`: current application code does not consume it and
Production does not contain it. Production's absence of an active `mk_validated` report template is
an existing limitation, not a seed to invent during RC preparation.

The new empty-database replay is green: all 41 active migrations applied, deterministic 0009 clone
and final canonical-state assertions passed, and the Release A–D integration assertions passed.
Current status remains **RC PREPARATION: IN PROGRESS** until all six established workflows are green
on the exact final head. **RC MIGRATION/DEPLOYMENT: NO-GO;
CLOUD CERTIFICATION: NO-GO; PUBLIC LAUNCH: NO-GO; DO NOT MERGE.** No cloud, Vercel, Resend, worker,
customer-data, or Production action occurred.

## Cross-references

- Current-state findings: `00-current-state.md`
- Backlog reconciliation runbook: `01-backlog-reconciliation-runbook.md`
- Migration discrepancy investigation: `10-migration-discrepancy-investigation.md`
- PR #40: `docs(safe-launch): current-state discovery report`, base `feat/essential-report-v2-commercial-rebuild`
- PR #41: `feat(release-a): paid-order backlog reconciliation tooling`, base `docs/safe-launch-discovery` (stacked)
- PR #42: `feat(release-b): durable payment-to-fulfilment orchestration`, base `release-a/backlog-reconciliation` (stacked)
- Release B0 audit: `11-release-b-existing-infrastructure-audit.md`
- Release B design: `12-durable-fulfilment-design.md`
- Release B runbook: `13-durable-fulfilment-runbook.md`
- PR #43: `feat(release-c): real transactional email and secure customer report delivery`, base `release-b/durable-fulfilment` (stacked)
- Release C0 audit: `14-release-c-existing-delivery-audit.md`
- Release C design: `15-email-and-secure-delivery-design.md`
- Release C runbook: `16-email-and-secure-delivery-runbook.md`
- Release C domain-authentication requirements: `17-domain-authentication.md`
- Release C controlled Resend Preview verification (owner-executed): `18-controlled-resend-preview-verification.md`
- Release C cloud-schema reconciliation and controller decision: `19-release-c-cloud-schema-reconciliation.md`
- PR #44: `feat(release-d): operational-alerts admin surface with audited lifecycle`, base
  `release-c/email-secure-delivery` (stacked)
- Release D0 scope and existing-infrastructure audit: `20-release-d-scope-and-existing-infrastructure-audit.md`
- Go-live checklist: `21-go-live-checklist.md`
- Release and rollback runbook: `22-release-and-rollback-runbook.md`
- Vercel operational inventory: `23-vercel-operational-inventory.md`
- Release C cloud-schema reconciliation audit + release decision memo: `19-release-c-cloud-schema-reconciliation.md`

---

## RC1 readiness cycle — controller accepted preparation, Production still NO-GO

**Status:** RC PREPARATION: CODE COMPLETE — CONTROLLER ACCEPTED at exact head
`19a2d139c702ce6a2cbf767253af62244dec75dc`. RC1 OPERATIONAL READINESS: IN PROGRESS.
RC MIGRATION/DEPLOYMENT, CLOUD CERTIFICATION and PUBLIC LAUNCH remain **NO-GO**; PR #45 remains
open, draft and **DO NOT MERGE**.

The accepted preparation included the full six-workflow green battery at that exact head:

- V1 Verification — run 1456
- V7 Report Hardening — run 163
- Supabase Migration Replay — run 300
- Phase 1 Release Safety — run 148
- Phase 2-3 Release Safety — run 136
- Security Scans — run 197

The Production database and cloud migration ledger remain unchanged. No Production migration,
ledger write, Supabase branch, Vercel change, Resend enablement, worker trigger, cloud order or
merge occurred as part of RC preparation.

The RC1 readiness artifacts are now defined, but their gates remain unresolved until owner/controller
evidence exists:

- `27-rc1-production-change-runbook.md`
- `28-rc1-operational-freeze-and-canary-plan.md`
- `29-manual-fulfilment-operating-model.md`
- `30-rc1-abort-and-forward-repair-matrix.md`
- `31-rc1-go-evidence-requirements.md`
- `scripts/rc1-production-preflight.sql`
- `scripts/rc1-production-postflight.sql`
- `26-existing-order-action-register.md` (anonymised defaults only)

The supplemental owner decision records a **CONDITIONAL PASS** for the Supabase backup gate:
Supabase organisation owner and restoration authority are **Tondani Netili**; permission to initiate
restoration is confirmed; scheduled physical backups are active; PITR is disabled; and PITR/compute
upgrade is not approved. The conditional gate still requires, at the eventual cutover, the latest
scheduled physical backup as fallback, a fresh logical database backup after freeze activation and
successful final preflight immediately before the first migration, and a restricted safeguard of
critical Supabase Storage objects including `generated-reports` and `payment-proofs`.
No logical backup, Storage copy or restoration has been performed, and PITR must not be enabled.
The active `mk_validated` template limitation remains a documented Production limitation and is not
invented or filled during RC preparation.


---

## RC1A controller review correction

**RC PREPARATION: CODE COMPLETE — CONTROLLER ACCEPTED**

**RC1 DECISION-PACKAGE STRUCTURE: ACCEPTED**

**RC1 OPERATIONAL READINESS: CORRECTIONS REQUIRED**

**RC MIGRATION/DEPLOYMENT: NO-GO**  
**CLOUD CERTIFICATION: NO-GO**  
**PUBLIC LAUNCH: NO-GO**

The prior package structure is retained, but it must not be described as operational-readiness
accepted. This correction cycle hardens the read-only preflight/postflight assertions, adds the
machine-readable manifest and disposable runtime defect tests, corrects the provider-certification
sequence, and returns the technical-freeze capability as a design for controller approval only.
No migration, cloud ledger, Production, Vercel, Resend, worker, customer-data or merge action is
performed. The backup gate is conditionally passed on the supplied owner decision, but the cutover
backup evidence and execution sequence remain outstanding alongside absence cover, 18-order
external actions and the final worker/manual operating-model decision.

### Supplemental owner decision — RC1 backup gate

- Supabase organisation owner: **Tondani Netili**.
- Restoration authority: **Tondani Netili**; permission to initiate restoration confirmed.
- Scheduled physical backups: **active**.
- PITR: **disabled**; PITR and compute upgrade are **not approved**.
- Backup gate: **CONDITIONAL PASS**.
- Required eventual safeguards: latest scheduled physical backup as fallback; fresh logical backup
  after freeze activation and successful final preflight, immediately before migration 1; and a
  restricted safeguard of critical Storage objects, including `generated-reports` and
  `payment-proofs`.
- Not performed: logical backup creation, Storage copy, restoration, PITR enablement, compute
  upgrade, add-on purchase or any cloud/Production action.

---

## RC1B correction evidence

**Status:** RC1B SECURITY AND HARNESS CORRECTION: **ACCEPTED**; RC1B TECHNICAL-FREEZE DESIGN:
**ACCEPTED IN PRINCIPLE**; RC1C CORRECTION: **IN PROGRESS**; RC1 OPERATIONAL READINESS,
RC MIGRATION/DEPLOYMENT, CLOUD CERTIFICATION and PUBLIC LAUNCH: **NO-GO**; **DO NOT MERGE**.

The RC1B head `c46fee69164e8746bf0cd6fbf164b3c25fc461a3` is only partially accepted and
must not be described as controller-accepted overall.

### Security Scans run 199 classification

The redacted `secret-scan-evidence` artifact from exact run 199 was inspected without printing or
retaining the detected value:

- Rule ID: `generic-api-key`.
- File: `scripts/rc1-prepostflight-disposable-tests.mjs`.
- Commit: `fa2b57c133baccf3069b0a2e280b50ecb7e1e613`.
- Finding fingerprint:
  `fa2b57c133baccf3069b0a2e280b50ecb7e1e613:scripts/rc1-prepostflight-disposable-tests.mjs:generic-api-key:199`.
- Classification: **false positive**. The matched source is a fixed synthetic `request_key` used
  only to delete a disposable embedded-Postgres fixture row. It is not used for authentication,
  authorisation, signing, encryption, a provider call or any external connection.
- Suppression scope: only the exact finding fingerprint above is added to `.gitleaksignore`; no
  path, rule or regex suppression is added.

### Migration-0006 harness root cause and repair

The exact failure was PostgreSQL `42P01` at `0006_phase6_scoring_guards.sql`:
`public.score_question_traces` did not exist when the migration created its unique index.

The RC1 harness had diverged from the proven RC0 compatibility bootstrap in two ways: it omitted the
local `supabase_admin` compatibility role, and it read each migration file separately for execution
and ledger recording instead of executing and recording the same SQL bytes. The repair reuses the
RC0 compatibility role and single-read replay pattern. Migration 0006 is not bypassed, weakened,
manually marked applied or supplied arbitrary pass-through rows.

The required `npm run rc1:test-prepostflight` command is a mandatory step in the Supabase Migration
Replay workflow. The harness binds only to disposable embedded Postgres on `127.0.0.1`, removes
cloud connection variables from its `psql` child environment and cannot select an external database.

### Confirmed backup owner decision

- Supabase organisation owner and restoration authority: **Tondani Netili**.
- Scheduled physical backups: active; latest evidenced backup:
  **2026-07-27 01:03:57 UTC**.
- PITR: disabled; PITR/compute upgrade: not approved.
- Backup gate: **CONDITIONAL PASS**.
- Future cutover still requires the technical freeze, successful final preflight, a fresh logical
  backup immediately before migration 1 with timestamp/checksum, and restricted safeguards for
  `generated-reports` and `payment-proofs` with aggregate object counts/size totals. Protected
  recovery artifacts remain outside git.

No PITR, compute, add-on, logical-backup, Storage-copy, restoration, cloud or Production action was
performed during RC1B.

### Disposable replay outcome

`npm run rc1:test-prepostflight` completed successfully in an isolated loopback database:

- all 34 baseline migrations replayed in exact order, including migrations 0006 and 0026;
- the current-boundary preflight passed and every required preflight defect emitted `STOP`;
- all seven cutover migrations applied in exact order;
- postflight passed its ledger, schema, index, 29-RPC, grant, RLS, protected-state, duplicate,
  no-change and worker-lease checks;
- every required postflight defect emitted `STOP`; and
- the two protected paid-order/report records retained their full approved-state fingerprint.

The successful replay verifies the original accepted grant contracts after the RC1C migration
payload restoration: `record_premium_report_generation_run(...)` remains authenticated-admin
executable with PUBLIC/anon denied, while direct execution of
`apply_email_provider_event_atomic(...)` remains denied to PUBLIC, anon, authenticated and
service_role; the service-role webhook path uses the separately granted ingestion RPC. No customer
data or external database was used.

---

## RC1C correction evidence

### Live-compatible email-event baseline

The Production boundary has 75 historical `email_events`: `queued=71`,
`recorded_disabled=2`, and `sent=2`; `email_provider_events=0`. Preflight no longer treats historical
email events as forbidden activity. It compares the complete non-PII status-count JSON and its
deterministic SHA-256 fingerprint
`76d196fb622eba89ec2c556ea8f65b8a183eee086e722fb43e2d94fa774e6fd2`.
The total remains part of the broader 14-count baseline. Recipients, provider IDs, order IDs and
message IDs are never emitted.

The disposable harness seeds the realistic 71/2/2 history and proves baseline PASS. It separately
proves `email_status_baseline_result|STOP` when one queued event is added, one sent event is added, or
one event changes status without changing the total. It proves
`provider_database_activity_result|STOP` when one provider event is added.

### RC1A-to-RC1B migration payload audit and decision

Before RC1C source changes, the exact two-file diff was inspected:

- `20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql`: RC1B added
  `record_premium_report_generation_run(uuid,uuid,jsonb)` to the adjacent service-role
  revoke/grant lists. Those two changed list entries altered the established authenticated grant
  inherited from migration 0017 and were added to satisfy the RC1B postflight harness expectation;
  they were not required for Production correctness.
- `20260724180000_release_c_closure_delivery_exceptions.sql`: RC1B inserted a seven-line explicit
  revoke/grant block for `apply_email_provider_event_atomic(...)`. The same-signature
  `CREATE OR REPLACE FUNCTION` preserves migration 0017's final no-direct-execute ACL; the service
  role enters through `ingest_phase14_provider_webhook(...)`. The added direct service-role grant
  therefore expanded the accepted ACL only to satisfy the RC1B harness expectation and was not
  required for Production correctness.

Checksum evidence:

| Migration | RC1A `fa2b57c` SHA-256 | RC1B `c46fee6` SHA-256 | RC1C decision |
|---|---|---|---|
| `20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql` | `d546f6ac3f6743eebbb48b19815b6b2a3ea9926592fe1ca3cade025d7f46ce25` | `1929a53fc216c94d9e93012b589bcea5f622bfa46e8971923d502479c795572d` | Restore exact RC1A bytes and checksum. |
| `20260724180000_release_c_closure_delivery_exceptions.sql` | `0c0843897136b046d01c135297fd90911b95bcfd6d2f44490c49aaf153f56533` | `514348bc09ddfe9fcb96683c8c377a31918a2991aeb54c7f49935d1903b830f3` | Restore exact RC1A bytes and checksum. |

No other accepted migration file is changed.

### Guarded live-boundary dry evaluation

`npm run rc1:dry-evaluate-live-boundary` validates all controller-approved aggregate variables before
connection, requires `RC1_CONNECTION_MODE=read-only`, injects libpq
`default_transaction_read_only=on`, and compares the target descriptor fingerprint before invoking
`psql`. It emits only `PASS`, `STOP` or `NOT_DATABASE_VISIBLE` result lines and suppresses connection
errors and credentials. The harness tests the procedure only against loopback disposable Postgres,
including every missing-variable refusal, non-read-only refusal, target mismatch refusal and a full
PASS evaluation. It is not executed against Production in RC1C.

---

## RC1E control-plane correction evidence

**Current status:** RC1C CORRECTION: **CONTROLLER ACCEPTED** at
`5b518d16f42436c608f2c6fb4422482d6b72444d`.

- RC1D APPLICATION FREEZE AND ROUTE FOUNDATION: **ACCEPTED**
- RC1D OLD-SCHEMA, REPLAY AND CHECKSUM EVIDENCE: **ACCEPTED**
- RC1D CANARY STRICT-STOP DECISION: **ACCEPTED**
- RC1D BOOTSTRAP AND CONTROL PLANE: **CORRECTIONS REQUIRED**
- RC1E CONTROL-PLANE CORRECTION: **CODE COMPLETE — CONTROLLER REVIEW REQUIRED**
- RC1 OPERATIONAL READINESS: **NO-GO**

RC MIGRATION/DEPLOYMENT: **NO-GO**; CLOUD CERTIFICATION: **NO-GO**; PUBLIC LAUNCH:
**NO-GO**; **DO NOT MERGE**.

RC1E is a code-only correction. No Production preflight, migration, cloud-ledger change, Supabase
branch, Vercel change, Resend change, worker invocation, backup, Storage copy, restoration, customer
data access or merge occurred.

### Accepted migration integrity

`npm run rc1:verify-accepted-migrations` fixes and verifies the SHA-256 of every accepted behaviour
migration in local verification and all six established GitHub workflows:

| Version | SHA-256 |
|---|---|
| `20260722143000` | `d546f6ac3f6743eebbb48b19815b6b2a3ea9926592fe1ca3cade025d7f46ce25` |
| `20260724150000` | `4a1c7c88a7f70fb2f50776b140bb26d022aacbbdd41eb46ba160e6a237dc432e` |
| `20260724160000` | `f3d37600a461e646007312c07640a1d49c513385094e98ab633795302c667046` |
| `20260724170000` | `e320ea500bfcfb3b51166cbe957549ddb8189e53a33f6e1d4cd67845e1e18809` |
| `20260724180000` | `0c0843897136b046d01c135297fd90911b95bcfd6d2f44490c49aaf153f56533` |
| `20260725090000` | `a0eca9a5426955ea1526362940174b0463f7536131cf74fae938c7bfa105923d` |
| `20260725150000` | `efc3a4317d23316036cd09a7a1b300675cbdad1a6f5c7b798a7957dd092bf6d1` |

No accepted behaviour migration payload is changed.

### Freeze-bootstrap and enforcement manifest

`supabase/migrations/20260722120000_rc1_operational_freeze_bootstrap.sql` has SHA-256
`68696811bf71e21a957d961a48d277f93980d0f83b3463d2d495708a15854006`. It applies in one
transaction and creates:

- `rc1_operation_freeze_state`, initially `FROZEN` at epoch 1, and
  `rc1_operation_freeze_audit`, plus the inaccessible one-use
  `rc1_certification_secret_write_tokens` capability table;
- 12 controlled `SECURITY DEFINER` functions, including status, fail-closed surface enforcement,
  AAL2 platform-admin activation/release, the frozen certification-secret provisioner,
  direct-state-write protection, relation guard installation and future recognized-relation
  installation;
- 40 authoritative relation-guard triggers, including report/enquiry request state, legacy manual
  delivery, Storage and private runtime-secret state; and
- one DDL event trigger that adds guards to recognized future relations.

The state tables use RLS plus forced RLS and expose no direct mutation grant. `service_role` and
older direct-DML paths do not bypass the relation guards. Unknown surfaces fail closed. Release
requires AAL2, active platform-admin authority, reason, exact epoch, nonzero SHA-256 evidence and no
active canary record. Postflight pins every object and trigger fingerprint.

RELEASED state is now explicit and fail closed: all release timestamps and fingerprints are
non-null, all fingerprints have the exact lowercase SHA-256 shape, release evidence is not all
zeroes, and both canary fields are absent. Runtime tests first prove 11 malformed writes are rejected
by constraints, then deliberately remove the exact constraints/NOT NULL controls in disposable
PostgreSQL and prove status plus operation-open enforcement stop for missing row, null/malformed/
zero release fields, inconsistent timestamps, canary mismatch, invalid/missing state and zero/null
epoch. The transaction rollback restores the exact constraints.

The dedicated frozen path is
`rc1_provision_certification_runtime_secret(text,text,text,bigint)` via
`POST /score/api/admin/rc1-certification/runtime-secret`. It is authenticated-only and internally
requires active `platform_admin`, AAL2, exact frozen epoch, meaningful reason, no canary, one of two
approved keys, a value of at least 32 characters and values distinct across the two keys. A
transaction-bound token is consumed by the exact `phase14_private.runtime_secrets` INSERT/UPDATE;
the marker alone, `service_role`, another key/relation or the existing
`set_phase14_runtime_secret` cannot use it. Responses and RC1 audit rows contain fingerprints only.

Supported control routes are `GET /score/api/admin/rc1-freeze/status`, `POST .../activate` and
`POST .../release`. They require an authenticated AAL2 platform admin and call only their dedicated
safe RPC. The release route requires explicit application mode `released`, exact epoch, meaningful
reason and nonzero evidence; the database remains frozen until that call succeeds.

### Application and compatibility proof

One typed gate with canonical surface vocabulary interprets
`MK_RC1_OPERATION_FREEZE_MODE`. Missing, invalid or frozen input stops before database-client or
mutation-service creation. Released input also requires a valid released database status; timeout,
RPC absence, malformed response and application/database disagreement all freeze.

Executable tests invoke all 34 authoritative mutation route exports with database credentials absent.
Public/admin mutations return HTTP 423, provider callbacks return HTTP 503 with `Retry-After`, and
worker routes return without a claim. Health and build-info remain available, and frozen responses
contain no customer identifiers.

The old-schema compatibility suite replays the exact 34-migration Production boundary in disposable
loopback PostgreSQL. With application mode frozen, health/read-only diagnostics work, the
not-yet-created freeze-status RPC is not required, all mutation probes stop before database access
and aggregate counts for orders, assessments, reports, events, emails, Storage objects, attempts,
payments and AI attempts remain unchanged.

### Replay and STOP evidence

The disposable RC1 harness:

- replays the exact 34-migration boundary;
- verifies bootstrap absence and explicit frozen application mode at preflight;
- applies the bootstrap first and proves its initial frozen state and AAL2 control rules;
- applies all seven accepted behaviour migrations without editing their payloads;
- proves exactly 42 ledger rows, eight exact new versions and newest version `20260725150000`;
- verifies the bootstrap object/trigger manifest plus all existing schema, grant, RLS, protected
  order, email-history and no-business-change evidence; and
- proves STOP for a missing freeze row, unexpected released state, unsafe grant, missing or disabled
  trigger, service-role bypass, unknown-surface allowance, application/database disagreement and an
  unlisted ninth migration, in addition to the previously accepted defect set.

### Canary decision

No canary bypass is implemented. The current flow spans independent pooled database requests,
Storage and provider side effects, so a ticket cannot be consumed transactionally across the whole
workflow without replacing major workflow components. A superficial header, GUC, environment,
global-state or service-role bypass is rejected. `33-rc1-canary-transaction-design.md` records the
safest options. CLOUD CERTIFICATION remains **NO-GO**.

### Retired-migration housekeeping reconciliation

`supabase/retired-migrations/0011_phase10_pdf_report_engine_additions.sql` is already correct: it has
one retirement header at the top and ends at `commit;`. It is unchanged in RC1E.

### RC1D exact-head security-scan correction

The first RC1D Security Scans run reported three `generic-api-key` findings in the machine-readable
preflight manifest. Each reported value is an MD5 fingerprint of a database trigger definition used
for exact postflight comparison. None is a credential, authentication material, customer data, or an
external-connection value. The three findings were reviewed at their reported commit and line, and
only their exact gitleaks fingerprints were added to `.gitleaksignore`. Dependency audit and CodeQL
were already green in that run. A new exact-head Security Scans result is required; the failed run is
not reclassified as green.

The first replacement exact-head replay set then exposed a separate disposable-harness defect:
three legacy route-integration jobs started the final application without the exact released mode,
so the gate correctly returned frozen responses. The full 42-migration replay already uses the real
AAL2 release RPC and now passes the released application mode to its webhook server. The two
historical 0016-to-0025 compatibility workflows use a loopback-only, non-migration database fixture
with a restricted, read-only released status solely while running their pre-existing mutation
suites. Those workflows pin and assert the exact loopback database URL; the fixture separately
requires explicit local-CI confirmation, database name `postgres`, an exact expected `0016`, `0023`
or `0025` historical ledger boundary, and absence of the real bootstrap table, RPC and ledger entry.
It is not a Production bypass and does not weaken the final old-34-schema frozen proof. New
exact-head results are required; the failed runs remain failed.

## RC1 near-real-time automatic post-payment fulfilment correction

**Accepted technical base:** `6550c05fe866a1880f4fe6e21b8ef2baa43301a8`.

**Implementation commit:** `ff3a0aefa2abfec2dbcda2d5626eb9f0a5a3c109`, direct parent exactly
the accepted technical base.

**Status:** RC1 TECHNICAL BASE: **ACCEPTED**; RC1 NEAR-REAL-TIME CORE FLOW:
**SUBSTANTIVE REVIEW PASSED**; RC1 IMMEDIATE-DISPATCH FAILURE ALERTING:
**CONTROLLER REVIEW REQUIRED**; RC1 OPERATIONAL READINESS, RC MIGRATION/DEPLOYMENT, CLOUD
CERTIFICATION and PUBLIC LAUNCH: **NO-GO**; **DO NOT MERGE**.

The final owner operating decision is now manual independent payment verification, automatic
near-real-time downstream generation/release/delivery, and manual exception management. Marking an
order paid is the last routine human approval. The once-daily Hobby-compatible Vercel cron remains
enabled as delayed recovery; no cadence, plan, provider, cloud or Production setting changed.

### Implementation evidence

| Evidence | Result |
|---|---|
| Additive migration | `20260728120000_rc1_near_real_time_automatic_fulfilment.sql`; SHA-256 `f98bb7f5187da6f2f06de88d8e69f34877e8e9c3274967e6a8989624cb630668`; no accepted migration changed |
| Immediate dispatch | Manual non-duplicate PAID confirmation returns the exact new attempt ID; `waitUntil()` invokes the existing worker using only the strictly validated exact `VERCEL_URL` deployment origin, that technical ID and a correlation UUID; no request-derived URL can reach the server-side fetch; dispatch failure preserves payment and queue state |
| Dispatch-failure alert | Every closed failure category attempts one `immediate_dispatch` operational-alert upsert and one deduplicated safe notification to `admin@mkfraud.co.za`; alert/provider failure is swallowed after safe evidence and cannot affect payment or queue state |
| Exact claims | Service-role-only row-locking RPCs claim only the supplied eligible attempt and returned delivery authorisation; scheduled GET retains the accepted global claim RPCs |
| Automatic release | Worker-owned completed attempt must pass verified payment, locked score, exact relationships, current-report uniqueness, commercial-quality evidence, verified private Storage, entitlement, recipient and suppression checks |
| Shared delivery | Immediate and scheduled paths use one claim/token/message/provider/finalisation/retry/reconciliation implementation |
| Exceptions | No customer send on a failed gate; safe deduplicated evidence and `admin@mkfraud.co.za` notification; provider-accepted/finalisation-uncertain state requires reconciliation before resend |
| Duplicate prevention | Synthetic replay proves one attempt, report, email event, authorisation, token and provider send; duplicate payment/invocation creates no second object |
| Freeze protection | Both immediate POST and scheduled GET stop at the RC1 worker freeze gate; underlying worker RPCs also require the operation to be open; a post-payment freeze race preserves PAID plus `REPORT_QUEUED` and permits no dispatch evidence, alert, report, authorisation, token or email mutation until authorised release |
| Protected orders | The synthetic 18-order 2/13/3 fixture and protected fingerprint remain byte-for-byte unchanged through pre/postflight |

### Local verification

- Dedicated near-real-time and dispatch-alert suite: **PASS, 35/35**.
- Full disposable replay: **PASS, 43 migrations**, nine exact cutover versions, newest
  `20260728120000`.
- Accepted behaviour migration protection: **PASS**, all seven accepted payload checksums and the
  freeze-bootstrap checksum unchanged.
- Old-34-schema frozen compatibility, application-freeze routes and control-plane routes:
  **PASS**.
- Release B durable-fulfilment and Release C secure-delivery compatibility: **PASS**, with their
  source checks following the new shared delivery module.
- Release C runtime-secret and Release D operational-alert full local database replays:
  **PASS**.
- Lint, TypeScript and production build: **PASS**.
- Dependency audit gate: **PASS**, zero unsuppressed Critical/High findings.
- Local full-history gitleaks binary: unavailable; Security Scans remains an exact-head CI
  requirement.
- V7 Checkpoint F local PDF rendering completed, but its pre-existing near-empty-page visual
  heuristic reported four candidate pages. No report-generation/rendering source was changed by
  this correction; the authoritative exact-head V7 workflow result is still required and is not
  presumed green.
- The legacy worker-schedule certification gate correctly remains red against the intentionally
  retained daily Hobby cron. This is expected under the owner decision: immediate dispatch is the
  primary processor, while cron is delayed recovery.

### Synthetic timing evidence

The disposable harness passes the certification SLOs under normal local synthetic conditions:
dispatch start under 10 seconds, report ready under 2 minutes, provider acceptance and delivered
record under 3 minutes, and terminal/manual-review alert under 1 minute. These are certification
targets, not customer promises. Real provider/Production timing remains untested and unauthorised.

All six established GitHub workflows must complete successfully on the exact final documentation
head before controller acceptance. Earlier-head evidence is not transferable.
