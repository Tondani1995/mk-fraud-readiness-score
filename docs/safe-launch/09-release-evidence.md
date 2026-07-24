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
| 9 | Local Supabase/Postgres stack, Docker project `mk-repo` (ports 55321–55329, reused across three separate `supabase start`/`supabase stop` cycles this Release C work cycle — not three simultaneous instances) | Local, free | (a) DB/core-service layer: full replay of all 35 migrations + 20 live SQL checks; (b) real-send notification wiring: 26 live checks against `recordPhase1OrderNotifications()`/`recordPaymentConfirmedNotification()` in both `disabled` and `test`-with-no-key modes; (c) admin delivery/token recovery: 22 live checks including a real authenticated `platform_admin` session (not just service-role bypass) | None (local Docker only) | Tondani | 2026-07-24 | **Stopped** (`supabase stop`) after each cycle; containers removed each time | 2026-07-24, same session, after each of the three cycles |
| 10 | Docker volumes `supabase_db_mk-repo`, `supabase_edge_runtime_mk-repo`, `supabase_storage_mk-repo` (recreated by resource #9 after each prior removal) | Local, free | Backing storage for resource #9 | None | Tondani | 2026-07-24 | **Removed** (`docker volume rm`) after each cycle's results were recorded in this pack | 2026-07-24, same session, after each of the three cycles |
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
| **Known gap, found not fixed:** admin dashboard delivery-state/queue classification reads only `manual_report_delivery_attempts` (Release B's table); the real delivery worker writes `report_delivery_authorizations` instead | `src/lib/reports/phase1-operations.ts` (`getPhase1OrderOperations`, `annotateOrdersWithPhase1State`) | — | Read the source; confirmed the queue-bucket logic (`ready_not_delivered`/`delivery_pending`/`delivered`/`delivery_failed`) never references `report_delivery_authorizations` | `FAIL — not yet fixed. Once real (test/live mode) delivery is turned on, every actually-delivered order will still show as permanently undelivered in the admin queue view. Flagged as a separate follow-up task (spawned this cycle), out of scope for "wire the admin RPCs" specifically -- fixing it means rewriting the queue-classification logic itself.` | — | This document |
| Provider webhook re-verification against the new schema | `src/app/score/api/phase14/provider-webhook/route.ts` (unchanged by design) | — | Reasoned through in the design doc (keys off `provider_event_id`/`email_event_id`, populated identically by the new RPCs) | `NOT INDEPENDENTLY RE-TESTED end-to-end this cycle — reasoning documented, not a live webhook replay` | — | `docs/safe-launch/15-email-and-secure-delivery-design.md`, "Provider webhook processing" |
| Domain authentication (SPF/DKIM/DMARC) | — | — | — | `NOT DOCUMENTED YET for Release C` | — | — |
| Bounce/complaint handling | `report_delivery_remediations` (reused, unchanged) | — | — | `NOT EXERCISED by any live test this release — reused table, no new code path added to it` | — | — |
| External email provider connection | — | — | — | `BLOCKED — decision gate, not a technical blocker. Whether RESEND_API_KEY in .env.example corresponds to a real, funded account is unknown and not assumed either way, per brief §17. MK_EMAIL_PROVIDER_MODE defaults to disabled; no external provider is connected.` | — | — |
| Migration applied to a Supabase Cloud environment | — | — | — | `BLOCKED — no Supabase Cloud environment has executed this migration, per the same deferral as Releases A/B. Deferred to the single integrated release-candidate cloud branch planned after Releases A-D.` | — | — |

### Current testing conclusion (Release C, this cycle)

| Item | Status |
|---|---|
| Branch relationship (PR #43 base/head) | `PASS` |
| `npm run typecheck` | `PASS` |
| Migration replay (35 migrations) | `PASS` — locally |
| Release C DB/core-service SQL behaviour (20 live checks) | `PASS` — locally |
| Real-send notification wiring (26 live checks) | `PASS` — locally |
| Admin delivery/token recovery (22 live checks, real auth session) | `PASS` — locally |
| Static test script | `PASS` |
| Admin dashboard delivery-state display | `FAIL` — known gap, not yet fixed (see table above) |
| Cloud migration execution | `NOT TESTED` — no Supabase Cloud environment has applied this migration |
| Domain authentication (SPF/DKIM/DMARC) | `NOT DOCUMENTED` |
| External provider connection | `BLOCKED` — owner decision gate, not attempted |
| Runbook | `NOT WRITTEN YET` |
| Paid customer journey | `NOT READY` |

**Production status: `NOT READY FOR PRODUCTION`.**

---

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
- Release C runbook: `16-email-and-secure-delivery-runbook.md` — **not yet written**
