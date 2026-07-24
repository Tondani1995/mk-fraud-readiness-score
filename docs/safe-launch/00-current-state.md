# MK Fraud Readiness — Current-State Report

**Prepared:** 2026-07-24
**Baseline commits verified:** `main` = `fdf4d55b10b08a7fea05000feb6970860f3bb694` (confirmed exact match); approved feature base = `feace689ce7d3b1ecabd288e91006d4ac56df271` (confirmed, exists as a merge commit — `main` currently does **not** include this or PR #37/#39's content).
**PR #37 status (verified via `gh pr view 37`):** OPEN, unmerged, titled *"Essential Report V2: engine repair (Part A) + commercial evidence-model rebuild (Part B) — DO NOT MERGE without commercial review."* PR #39 (Essential Report V7 hardening) was merged into PR #37's branch via `feace689...`. The PR body's own status note states production AI remains disabled and this PR's merge into `main` is **not authorised**. This document does not change that.
**Production Supabase project verified:** `jvjxlphdyzerrhwcgkup` (region eu-west-1, ACTIVE_HEALTHY). All database access performed for this report was read-only aggregate/schema queries — no customer PII (names, emails, assessment answers, payment references) was pulled into this document or any tool output.
**Scope note:** All findings below are re-verified against the live repository and production database as of today. Where they differ from the numbers or claims in the originating brief, the difference is called out explicitly rather than silently reconciled — per the brief's own instruction ("implement against the real current state without silently discarding the verified concerns").

---

## 1. Repository architecture

- Single Next.js 14 app (`mk-fraud-platform`, `package.json`), App Router, path prefix `/score/*` for all product routes (`src/app/score/...`).
- Node 24 (`.nvmrc`, `package.json engines`). Package manager: npm (package-lock.json; no yarn/pnpm lock at repo root).
- Supabase (`@supabase/supabase-js 2.109.0`) is the sole datastore — Postgres + Storage + Auth.
- PDF rendering: Puppeteer (`puppeteer-core`) + `@sparticuz/chromium` (serverless Chromium), invoked synchronously from `src/lib/reports/render-pdf.ts`.
- AI SDK (`ai` npm package, v6) present for the dormant Phase 14 narrative generator (`src/lib/reports/automation/ai-sdk-generator.ts`) — not used by the live paid flow.
- Vercel Workflow DevKit (`workflow` npm package) is integrated via `next.config.mjs` (`withWorkflow`) and used by a durable workflow definition at `src/workflows/premium-report-fulfilment.ts` — part of the dormant Phase 14 subsystem (see §12).
- No email SDK dependency; the one real provider integration (Resend) is implemented by hand over `fetch` (`src/lib/reports/email/resend-transport.ts`), and is wired only into the dormant Phase 14 path, not the live R5,000 flow.
- `git branch -a` on the real remote shows **~35 branches** spanning phases 7–14, multiple "v1"/"v2" consolidation attempts, and several hotfix branches — evidence of a long, iterative, partially-parallel development history that this programme must reconcile rather than assume is a clean slate.

## 2. Runtime framework and versions

| Component | Version | Source |
|---|---|---|
| Next.js | ^14.2.13 | package.json |
| React / React DOM | ^18.3.1 | package.json |
| @supabase/supabase-js | 2.109.0 | package.json |
| puppeteer-core | 24.34.0 | package.json |
| @sparticuz/chromium | 143.0.4 | package.json |
| ai (Vercel AI SDK) | 6.0.83 | package.json |
| workflow (Vercel Workflow DevKit) | 4.6.0 | package.json |
| zod | 4.1.8 | package.json |
| Node | 24.x | .nvmrc, package.json engines |

No test framework (jest/vitest/mocha/playwright) is installed — see §13.

## 3. Vercel project and environment structure

- `vercel.json` contains only `{"crons": []}` — **no Vercel Cron jobs are configured**, despite code (`src/app/score/api/internal/phase14-storage-cleanup/route.ts`) expecting an external scheduler to call it with a `CRON_SECRET`.
- `next.config.mjs` wraps the app with `withWorkflow` (Vercel Workflow DevKit), adds a rewrite for `/score/.well-known/workflow/:path*`, and bundles the Chromium binary specifically for the report-generation route via `experimental.outputFileTracingIncludes`.
- Full Vercel project/team inventory (production URL, preview aliasing, env var *values*, domain config) was not pulled in this pass — the Vercel MCP tool requires a team ID I have not yet resolved. This is an open item for Release A/D setup, not a blocker for this document.

## 4. Supabase schema, migrations, RPCs, RLS (production project `jvjxlphdyzerrhwcgkup`)

**58 tables**, all with RLS enabled. Tables directly relevant to this programme:

- Orders/payments: `orders`, `order_events`, `payment_sessions`, `payment_automation_records`, `payment_transition_events`, `payment_unmatched_events`, `payment_proofs`, `eft_settings`.
- Reports: `reports`, `report_generation_runs`, `report_fulfilments`, `report_events`, `report_ai_attempts`, `report_generation_claims`, `report_templates`, `report_content_blocks`, `manual_report_generation_attempts`, `manual_report_delivery_attempts`.
- Delivery/notification: `email_events`, `email_provider_events`, `email_templates`, `report_delivery_authorizations` (comment: *"Durable delivery outbox. Claiming then marking dispatch_started is the irreversible provider-dispatch boundary; later business changes cannot unsend an accepted request."*), `report_delivery_finalizations`, `report_delivery_remediations`, `customer_contact_verifications`.
- Phase 14 governance/infrastructure: `phase14_security_gates`, `phase14_feature_policies`, `phase14_ai_route_policies`, `phase14_worker_capabilities`, `phase14_storage_cleanup_queue`, `phase14_provider_attestations`, `phase14_provider_attestation_consumptions`, `phase14_operational_alerts`, `phase14_workflow_start_outbox`.
- Admin/audit: `admin_profiles`, `audit_logs`, `assessment_tokens`, `data_requests`.

**Migrations:** 31 applied to production (per `list_migrations`), local repo has **34 files** (three ahead: `0032`, `0033`, `0034`, plus a `checkpoint_e_phase1_ai_attempt_binding.sql`). Numbering has gaps at `0008` and `0018`–`0022`, indicating squashed/renumbered history. The two structurally significant applied migrations are:
- `0017_phase14_canonical_disabled_foundation.sql` — the large migration that builds the entire Phase 14 governance/outbox substrate, **explicitly seeded as inert** (see §4a).
- `0024_phase23_payment_automation.sql` — adds `record_payment_transition` RPC, the authoritative SQL-level payment state machine.

### 4a. Finding: the Phase 14 security gate is now "satisfied" in production, with a thin paper trail

`phase14_security_gates` (single row, `gate_key = 'phase14-premium-report'`) was seeded by migration `0017` as `status = 'unsatisfied'`, `satisfied_version = 0`, with the migration's own preceding comment stating: *"This migration is intentionally inert: the database security gate starts below the required version. No report generation, download, delivery, reconciliation, webhook mutation, or AI-backed publication can proceed until an AAL2 platform administrator records the required gate version in a separately authorised step."*

The gate is changed only via `set_phase14_security_gate_version(p_satisfied_version, p_reason)`, a `security definer` RPC that requires an authenticated `platform_admin` at AAL2 (MFA) and a non-empty `p_reason`, and logs to `audit_logs`. Full audit trail for this gate (`audit_logs` where `entity_table = 'phase14_security_gates'`), all by the same `platform_admin` (`admin_profiles.id = f4f7e2f8-dc72-41b6-8ebb-240869ee00aa`, role `platform_admin`, status `active`):

| Timestamp (UTC) | Actor | Result | Reason text |
|---|---|---|---|
| 2026-07-19 08:15:44 | admin | `satisfied_version=0`, stayed **unsatisfied** | "Phase 14 security and correctness remediation completed, independently reviewed, merged, deployed and approved for staged production activation on 19 July 2026." |
| 2026-07-19 08:24:17 | system | `authority_epoch` advanced to 2, status flips to **satisfied**, `satisfied_version=1` | (system-generated) |
| 2026-07-19 08:24:17 | admin | **satisfied**, `satisfied_version=1` | "yes do it" |
| 2026-07-19 10:34:55 | admin | **satisfied**, `satisfied_version=1` (re-confirmed) | "yes" |

**Read on this, without speculation beyond the evidence:** this was a legitimate, authenticated, AAL2-gated, audit-logged action by an active `platform_admin` — not a bypass, injection, or code exploit. The gate's consistency constraint (`status = 'satisfied' requires satisfied_version >= required_version and satisfied_at not null`) holds. But the justification text degrades from a substantive first sentence to "yes do it" / "yes", which does not meet the standard of care the brief requires for governance actions on a paid customer's data path (cf. brief §8.3's requirement that operational audit notes be meaningful, ≥5 characters, with inline validation). **This is flagged for the authorised MK operator's review, per your instruction to investigate only and not modify it.**

Downstream of the gate, `phase14_feature_policies` (9 rows, all `required_gate_version=1`, `approved_gate_version=1`) shows **every policy currently `enabled = true`**: `ai_narrative`, `automatic_email`, `automatic_fulfilment`, `manual_delivery`, `manual_download`, `manual_generation`, `provider_webhook_ingestion`, `recipient_override`, `storage_cleanup`. Reason text on these rows is similarly thin: `"Enable"` (6 of 9) or `"do it"` (2 of 9).

**However — and this materially bounds the risk** — the runtime evidence tables that any real Phase 14 execution would populate are all empty in production: `report_generation_runs` = 0 rows, `report_ai_attempts` = 0 rows, `email_provider_events` = 0 rows, `payment_automation_records` = 0 rows. Combined with the code-level finding (§9 below) that the live R5,000 Essential Report admin flow calls `phase1-manual-fulfilment.ts` / `phase1-manual-delivery.ts` — a separate code path that does **not** consult `phase14_feature_policies` at all, and whose delivery function has no live-provider branch — **no AI-generated content or automated customer email has actually been produced or sent against any real order**, despite the policies being armed.

**Open item — resolved:** `grep -rn "workflow-start" src/` finds exactly one reference outside the module's own definition file: none. `src/lib/reports/automation/workflow-start.ts` (the only file that imports `@/workflows/premium-report-fulfilment`) has **zero callers anywhere in `src/`**. The Phase 14 workflow is not just feature-flagged off — it is not wired to any route, button, or trigger in the current codebase. The armed gate/policies are therefore latent with no reachable code path today, not merely low-volume.

### 4b. Relevant RLS pattern

RLS is enabled on every table. `phase14_security_gates` and similar governance tables are locked down with `revoke all ... from public, anon, authenticated` plus a narrow `grant select` to `authenticated` gated by `current_admin_role() in (...)`. Mutations go exclusively through `security definer` RPCs rather than direct table grants — this is a sound pattern and should be the template for any new Release A/B admin-recovery actions, not a parallel mechanism.

## 5. Order lifecycle (verified in code, not just types)

Two status vocabularies coexist:
- `src/lib/types/domain.ts` — `OrderStatus` (`created | awaiting_payment | proof_uploaded | under_review | verified | rejected | cancelled | refunded`) — largely vestigial, not what's actually persisted.
- `src/lib/orders/manual-eft-orders.ts` — `ManualOrderStatus` (`draft | awaiting_payment | payment_received | cancelled | expired`), the type actually used, with a `normaliseStatus()` shim mapping legacy values (`created`→`draft`, `verified`→`payment_received`).
- A third model, `src/lib/payments/types.ts` `PaymentState` enum (`PAYMENT_PENDING | PAYMENT_PROCESSING | PAID | PAYMENT_FAILED | PAYMENT_REVIEW_REQUIRED | CANCELLED | REFUNDED`), backs the payment-automation-capable path.

**Verified production order counts (fresh, 2026-07-24):** 18 `payment_received`, 3 `awaiting_payment` — the 18 figure matches the brief's baseline exactly.

Two parallel admin transition implementations exist:
1. Legacy: `updateAdminOrderStatus()` (`manual-eft-orders.ts`) — direct table writes, no payment-automation dependency.
2. Automation-capable: `confirmManualPayment()` → `processVerifiedPayment()` (`src/lib/payments/payment-service.ts`) → SQL RPC `record_payment_transition` (authoritative state machine, defined in `0024_phase23_payment_automation.sql`).

The route `src/app/score/admin/orders/[orderReference]/status/route.ts` branches between the two based on `getPaymentAutomationCapability()`. **This dual-path design is itself a durability risk** — it means the "authoritative" state machine can be silently bypassed by the legacy path depending on a capability flag, which the current admin UX (per the brief's own §8.4 requirement) does not clearly surface.

## 6. Payment lifecycle and the coupling to PDF generation

Confirmed exactly as the brief asserts, with implementation detail:

- `processVerifiedPayment()` (`payment-service.ts`) calls `record_payment_transition` (line ~49), then on `state === 'PAID'`, **synchronously awaits** `triggerPaidOrderFulfilment()` (`src/lib/payments/fulfilment.ts`) inside the same HTTP request.
- `triggerPaidOrderFulfilment` calls `generateManualPhase1Report()` (`src/lib/reports/phase1-manual-fulfilment.ts`), which itself synchronously renders the PDF (Puppeteer, 30s timeout), uploads to Supabase Storage, re-downloads to verify checksum, and calls `complete_manual_report_generation` — **all inside the admin's single "confirm payment" POST**, with no queue/worker hop.
- **Idempotency is already per-attempt, not per-order** — contrary to the brief's assumption. `crypto.randomUUID()` is the default idempotency key on the confirm-payment route unless the caller explicitly resupplies the same value; actual dedup enforcement lives in the `record_payment_transition` SQL RPC keyed on whatever value it receives. This means: (a) the "replace the static per-order key" instruction in the brief's §6.4 is **already partially done** at the route layer, and (b) the real gap is client-side — the admin UI must reliably resend the *same* key on retry, which was not confirmed to be implemented in this pass.
- Payment eligibility gate requires `order.status in ['awaiting_payment', 'payment_received']` and a note ≥5 characters (`payment-service.ts`) — the 5-character audit-note requirement from brief §8.3 already exists for payment confirmation; it does not yet exist for the Phase 14 gate action (§4a above).

## 7. Report-generation states and storage/integrity checks

- `reports.status` values seen in production: `generated` (15), `superseded` (8). **`NOT_STORED` is not a database value** — it is a UI-only placeholder default (`src/app/score/admin/orders/[orderReference]/page.tsx`) shown when no report row exists yet for an order. The real storage-integrity field is `reports.storage_status`, with **production values: `NOT_STORED` (15), `VERIFIED` (8)** — note this differs from the brief's cited baseline of "13 NOT_STORED / 2 VERIFIED"; the numbers have moved since that earlier review (more manual generation attempts have run: `manual_report_generation_attempts` now has 15 rows).
- Integrity checks that do exist and run today: SHA-256 checksum computed at render time, re-verified on upload (re-download + compare), `assertValidPdf()` requires ≥1000 bytes and a `%PDF` magic-byte header, and checksum is **re-verified again on every admin download/preview and delivery attempt** (`phase1-report-access.ts`, `phase1-manual-delivery.ts`).
- On any downstream failure after upload, the orphaned storage object is deleted synchronously — there is no orphan-cleanup queue needed for this specific failure mode (though `phase14_storage_cleanup_queue` exists for the dormant Phase 14 path).
- A second, more elaborate "Phase 14" report engine (`premium-report-service.ts`, `automation/processor.ts`, `download-verification.ts`) exists with its own storage-cleanup queue and durable workflow, but per its own code comment its download function *"is not currently wired to any route"* — dormant, matching §4a.

## 8. Notification and delivery abstractions

**No real customer-facing email exists in the live paid flow — confirmed at the code level, not just inferred from the DB:**

- Order-created notifications (`internal-notifications.ts`, `phase1-order-notifications.ts`) write `email_events` rows with `status: 'queued'`, `provider_mode: 'disabled'`, `provider_send_attempted: false` — DB log entries only, never dispatched to any provider.
- Report-delivery ("send email" to customer): `phase1-manual-delivery.ts` → `providerMode()` returns `'disabled'` unless `PHASE1_DELIVERY_MODE === 'double'` (a **test double**, explicitly commented *"No real email was sent"*). There is no live-provider branch in this function at all.
- A working Resend integration **does exist in code** (`src/lib/reports/email/resend-transport.ts`, webhook handler at `src/app/score/api/webhooks/resend/route.ts`) but is reachable only from the dormant Phase 14 automation path, which the live R5,000 admin "send email" route does not call.
- **Net effect: today, no MK customer who has paid receives any real email at any stage of the journey.** This matches and confirms the brief's defect #5 exactly.

## 9. Admin authentication and role checks

- Session: `getAdminSession()` (`src/lib/auth/admin-route.ts`) reads a cookie, validates via Supabase `auth.getUser()`, loads `admin_profiles` (service-role client, `status = 'active'` filter) for role.
- Capability helpers: `canManagePlatform` (`platform_admin` only), `canReviewAssessments`, `canManageFinance` (`platform_admin`/`finance_admin`).
- Roles: `platform_admin | reviewer | approver | finance_admin | read_only_admin`.
- **No global `middleware.ts`** — auth is enforced per-route via explicit `getAdminSession()`/`requireAdmin()` calls, not centrally. This is a real gap: any new admin route added without remembering the explicit check would be unprotected at the app layer (RLS is the backstop, per §4b).
- MFA is implemented (`src/lib/auth/mfa.ts` + enroll/verify/factors/unenroll routes) and is what "AAL2" refers to throughout the Phase 14 governance RPCs.
- Currently only **one** `admin_profiles` row exists in production (`platform_admin`, active) — meaning today there is a single human with platform-admin authority, the same person who satisfied the Phase 14 gate.

## 10. Customer report-access design

**Does not exist today.** `src/app/score/report/request/[assessmentRef]/page.tsx` is a static page stating a paid report won't be generated/released until payment is confirmed — it contains no download link. The only signed-URL mechanism anywhere in the codebase (`createSecurePhase1ReportAccess()`, `phase1-report-access.ts`) is **admin-only**, requires an admin session, and issues a 60-second Supabase signed URL for admin download/preview. There is no token-based, expiring, customer-facing access route, no `AssessmentTokenType` value for report retrieval (the existing `report_request` token type is for the *pre-payment request* flow, not report delivery). This confirms brief defect #4 exactly and is the largest single gap standing between "PDF exists in storage" and "customer receives it."

## 11. Existing queues, cron jobs, or background workers

- **No Vercel Cron configured** (`vercel.json` crons is empty array) despite code expecting one (`CRON_SECRET`-protected internal route for storage cleanup).
- Vercel Workflow DevKit is integrated and a durable workflow (`src/workflows/premium-report-fulfilment.ts`) exists, but is part of the dormant Phase 14 path (§4a).
- A genuine SQL-based durable queue already exists: `phase14_storage_cleanup_queue` with lease/claim RPCs, polled via `src/app/score/api/internal/phase14-storage-cleanup/route.ts`. **This is the reuse candidate the brief's §6.2 instructs to look for** ("Do not create a second competing job system if one already exists") — Release B should evaluate extending this rather than building fresh, though it is currently scoped to storage cleanup, not general fulfilment.
- No Supabase Edge Functions exist in this repo.

## 12. Browser and integration test coverage

**No jest/vitest/mocha/playwright is configured anywhere in the repo** — not in `package.json` devDependencies, no config files found. "Testing" is ~73 custom Node scripts under `scripts/*.mjs` (plus some `.sh`/`.sql`), invoked via npm scripts named by phase (e.g. `phase9:test-orders`, `phase14:test-email-delivery`, `phase14:test-webhook-adversarial`, `phase11:test-security`). CI workflows exist for migration replay, release safety, security scans, and live UAT (`.github/workflows/*.yml`). **None of these were executed in this pass** (per the brief's own instruction to inventory before running) — running them and separating pre-existing baseline failures from anything introduced by this programme is the first concrete task of Release A/B implementation, not of this document.

## 13. Environment variables (names only — no values read or recorded)

Supabase/DB: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET_REPORTS`.
Email: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MK_REPORT_EMAIL_FROM`, `MK_REPORT_EMAIL_REPLY_TO`, `MK_INTERNAL_LEADS_EMAIL`, `MK_INTERNAL_NOTIFICATIONS_EMAIL`.
Payment: `PAYMENT_PROVIDER_MODE`, `STITCH_WEBHOOK_SECRET`.
PDF/Chromium: `PDF_RENDER_TIMEOUT_MS`, `PUPPETEER_EXECUTABLE_PATH`, `CHROME_EXECUTABLE`, `LD_LIBRARY_PATH`.
Phase 1/14 test & security: `PHASE1_DELIVERY_MODE`, `PHASE1_DELIVERY_DOUBLE_RESULT`, `PHASE1_TEST_FORCE_PDF_FAILURE`, `PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET`, `PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET`, `PHASE14_STORAGE_CLEANUP_CAPABILITY_ID`, `PHASE14_WORKER_ATTESTATION_KEY_ID`, `PHASE14_WORKER_ATTESTATION_SECRET`, `MK_REPORT_AI_MODEL`.
Cron/deploy: `CRON_SECRET`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `MK_BUILD_PHASE`, `MK_RELEASE_CHANNEL`.
Other: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `JWT_SECRET`, `GA_PROPERTY_ID`/`GA_SERVICE_ACCOUNT_*`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`.

## 14. Current provider modes

- Email: `disabled` in the live path (Resend exists in code, wired only to the dormant Phase 14 path). No evidence any live send has occurred (`email_provider_events` = 0 rows in production).
- Payment: manual EFT + admin confirmation is the only live route. `STITCH_WEBHOOK_SECRET` exists as an env var name but Stitch integration is out of initial launch scope per the brief and no evidence of active use was found.
- AI: Phase 14 `ai_narrative` policy is DB-enabled (§4a) but the live flow does not call it; `report_ai_attempts` = 0 rows.

## 15. Release and rollback process

Not yet inventoried in this pass — no `docs/` release-process documentation was found in the repo at the checked-out commit, and Vercel project-level deployment/rollback configuration was not pulled (Vercel MCP access needs a resolved team ID). This is carried forward as an explicit task for Release D, not resolved here.

## 16. Gaps between the verified brief baseline and the actual repository (summary)

| Brief claim | Actual finding |
|---|---|
| "Real customer report delivery is not implemented" | Confirmed true for the live flow. |
| "Dependable real admin and customer order notifications are not implemented" | Confirmed true. |
| "Current payment path is too tightly coupled to PDF generation" | Confirmed true, with exact code locations identified (§6). |
| "Replace the existing static per-order payment idempotency key" | **Partially stale** — the route already generates a fresh UUID per attempt by default; the real remaining gap is client-side retry key stability, not a static server-side key. |
| 18 paid orders, 13 `NOT_STORED` / 2 `VERIFIED` reports | 18 `payment_received` confirmed exact match. Storage status is now **15 `NOT_STORED` / 8 `VERIFIED`** — numbers have moved since the brief's snapshot (more manual generations have run since). |
| "Zero payment-automation records; zero report-generation attempts triggered by payment_confirmation" | Confirmed still zero. |
| Brief's defect list implies the durable-fulfilment/outbox/notification system must be built from scratch | **Materially incomplete** — a substantial, deliberately-gated "Phase 14" system already exists (outbox tables, Resend integration, durable workflow, fault-injection test scripts) covering much of Release B/C's scope. It is currently dormant for the live flow, but the security gate guarding it was satisfied in production five days ago with thin justification text (§4a) and all nine feature policies are armed. This must be audited (per your instruction) before any Release B/C code is written, to decide reuse-vs-rebuild and to resolve the gate/policy governance gap. |

---

*This document is Release A's mandated first deliverable (brief §4). It does not authorise any production write, any live customer communication, or any merge to `main`. No customer PII was read, logged, or reproduced in producing it.*
