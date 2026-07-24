# Release B0 — Existing Infrastructure Audit

**Purpose:** determine what already exists before writing any Release B code, so no duplicate or
unnecessary durable-job system gets built. Performed on branch `release-b/durable-fulfilment`
(no implementation commits yet at the time of this audit — confirmed via
`git log release-a/backlog-reconciliation..release-b/durable-fulfilment` returning empty).

**Method:** an Explore-agent pass answering 20 specific questions with file:line citations,
followed by independent spot-verification of the five most consequential/surprising claims
(the partial-unique constraints, the dual-parent `report_ai_attempts` binding, the live call
from the manual path into Phase 14 feature flags, and the empty `vercel.json` crons/absence of
`maxDuration`). All five spot-checks confirmed exactly as claimed.

## Headline finding

The discovery report's claim that Phase 14 automation "has zero callers in `src/`" is **still
true for the workflow/delivery machinery** (`workflow-start.ts`, `premium-report-fulfilment.ts`,
`automation/processor.ts`, `report_generation_claims`, `report_delivery_authorizations`,
`phase14_workflow_start_outbox`, `phase14_storage_cleanup_queue` — all genuinely unreachable),
but is **no longer accurate as a blanket statement**. One specific slice of the Phase 14 schema —
`phase14_security_gates`, `phase14_feature_policies`, `phase14_ai_route_policies`, and
`report_ai_attempts` — is already read and written by the live manual payment/fulfilment path
today (`phase1-manual-fulfilment.ts:220,347` calls `getPremiumReportAutomationFlags()`; the
manual path claims/settles `report_ai_attempts` rows via
`claim_manual_report_ai_attempt`/`settle_manual_report_ai_attempt`). It is dormant only because
the `ai_narrative` feature flag is off, not because the code path is unreachable. A prior
production incident (`20260721150808...sql`, `0033...sql`) was caused by exactly this
overlap — a Phase 14 authoritative-mutation guard trigger blocked the manual path's own RPC
until it was fixed. **The two "systems" are not cleanly separable.** Release B must account for
this, not just wire around a fully-inert Phase 14.

## Part 1 — Infrastructure map

| Component | Location | Current purpose | Called by | State persisted where | Idempotent? | Recoverable? | Reusable for Release B? | Decision |
|---|---|---|---|---|---|---|---|---|
| Live payment→fulfilment path | `payment-service.ts:21-89`, `fulfilment.ts:5-39`, `phase1-manual-fulfilment.ts:205-552` | The real R5,000 order flow: verify payment → RPC commit → synchronous, awaited PDF generation in the same HTTP request | `webhooks/stitch/route.ts:32`, `admin/orders/[orderReference]/status/route.ts:32` | `orders`, `payment_automation_records`, `manual_report_generation_attempts`, `reports` | Partially (idempotency keys on payment + `request_key` on generation) | No — one shot, no queue, no retry scheduling | Yes — this is what gets wrapped | `extend` |
| `manual_report_generation_attempts` | `0023...sql:42-73`, extended by `0024`, `0033`, `20260722143000` | Attempt log + single-flight guard for the manual/live path | `claim_manual_report_generation`, `claim_payment_report_generation` RPCs | Own table | Yes (unique `request_key`; partial-unique one-active-per-order) | Partially — has `retry_count`, no `next_attempt_at`/backoff, no lease/heartbeat | Yes — closest thing to a real job row today | `extend` |
| `report_generation_claims` (Phase 14) | `0017...sql:281-298`, `909-963` | Claim/lease table for premium report generation, keyed `(assessment_id, report_type)` | Only Phase14 RPCs | Own table | Yes | Yes — `lease_expires_at`, `state`, `last_heartbeat_at`, `recovery_count` | No live caller anywhere in `src/` | `retain but do not use` |
| `report_delivery_authorizations` | `0017...sql:1022-1059`, `0027`, `0028` | Delivery outbox with lease + status state machine | Only Phase14 code | Own table | Yes | Yes | No live caller | `retain but do not use` |
| `report_delivery_finalizations` / `report_delivery_remediations` | `0017...sql:1061-1074`, `3112-3123` | Terminal delivery record / bounce-retry authorization | Only Phase14 code | Own table | Yes / N/A | N/A | No live caller | `retain but do not use` |
| `phase14_storage_cleanup_queue` | `0017...sql:2844-2919` | Best-in-repo retry/backoff/dead-letter pattern (`next_attempt_at`, exponential backoff, `dead_letter`) | Route exists (`internal/phase14-storage-cleanup/route.ts`) but not in `vercel.json` crons | Own table | Yes | Yes | Route unreachable (no cron entry, capability env var absent) | `retain but do not use` (pattern worth copying) |
| `phase14_worker_capabilities` | `0017...sql:2417-2462` | Hashed-secret worker capability/lease tokens | Only Phase14 code | Own table | Yes | Yes | No live caller | `retain but do not use` |
| `phase14_workflow_start_outbox` | `0017...sql:7043-7083` | Outbox to start the Vercel Workflow run | `automation/workflow-start.ts` only — which itself has zero importers | Own table | Yes | Yes | Confirmed unreachable | `retain but do not use` |
| `phase14_operational_alerts` | `0017...sql:909-926` | Deduplicated ops alert sink | Phase14 cleanup/delivery RPCs | Own table | Yes | N/A | Only reachable via the unreachable cleanup route | `retain but do not use` |
| Vercel Workflow DevKit integration | `src/workflows/premium-report-fulfilment.ts`, `package.json` (`workflow@4.6.0`) | Full durable-workflow implementation (generate → validate → deliver) | `automation/workflow-start.ts` — zero importers | N/A | Presumably (framework-level) | Presumably (framework-level) | Fully built, never wired to a route | `retain but do not use` |
| `report_generation_runs` | `0017...sql:68-100` | Per-attempt record for the Phase14 fulfilment path, requires a `report_fulfilments` row nothing live creates | `premium-report-service-core.ts`, `automation/processor.ts` | Own table | Yes | N/A | No live caller | `retain but do not use` |
| `report_ai_attempts` | `0017...sql:305-341`, extended `0029`,`0030`,`20260722143000:1-265` | AI-generation attempt ledger, capped attempts, cost/timeout ceilings | **Both** paths — dormant Phase14 stack **and** the live manual path (verified) | Own table | Yes (two unique constraints) | Partially — has uncertain/reconciliation states, no auto retry-at | **Already live-reachable, gated by a feature flag, not code-unreachable** | `extend` |
| Admin order-detail retry/regenerate UI | `admin/orders/[orderReference]/page.tsx`, `components/admin/FulfilmentActions.tsx:33-52` | Buttons that call `generate-report` synchronously and block on the response | Admin browsers | `manual_report_generation_attempts` | Yes (idempotency key per click) | Manual only | Needs rework: blocking-fetch → submit-then-poll | `repair` |
| `phase14_security_gates` / `phase14_feature_policies` / `phase14_ai_route_policies` | `0017...sql:871-907`, `2305-2413` | Kill-switch gate + named feature toggles, `security definer` gated | Read by `getPremiumReportAutomationFlags()`, called from the **live** manual path | Own tables | N/A (config) | N/A | **Already partially live** — not inert | `extend` (sound mechanism, already load-bearing — do not treat as dead) |
| `record_payment_transition` RPC | `0024...sql:110-228` | Single `security definer` atomic payment state-machine transition | `payment-service.ts:49` | `payment_automation_records`, `payment_transition_events`, `orders`, `order_events` | Yes (`idempotency_key` unique + `unique_violation` handler) | Yes — one atomic function | Yes, as the transaction to extend | `extend` |
| `complete_manual_report_generation` RPC | `20260721150808...sql:19-99` | Commits generated+verified PDF into `reports`, supersedes prior version atomically | `phase1-manual-fulfilment.ts:457` | `reports`, `manual_report_generation_attempts`, `report_events`, `order_events` | Yes (relies on `reports_one_current_assessment_type_uidx`) | Yes — atomic | Yes | `extend` |

## Part 2 — Answers to the 20 audit questions

**1. Durable job/outbox table already present?** Yes — `report_generation_claims`,
`report_delivery_authorizations`, `phase14_workflow_start_outbox`, `phase14_storage_cleanup_queue`
all have real lease/claim/status-machine columns. None has a live caller.

**2. Report-generation attempt table already present?** Three: `manual_report_generation_attempts`
(live), `report_generation_runs` (dormant, requires a `report_fulfilments` row nothing live
creates), `report_ai_attempts` (dual-parented — reachable from **both** paths today).

**3. Could an existing attempt table act as the job/outbox itself?**
`manual_report_generation_attempts` is closer to a state machine than a log (status enum,
`retry_count`, one-active-per-order partial unique, idempotent claim RPCs) but lacks
lease/heartbeat and scheduled retry. `report_generation_claims` has the lease/heartbeat
machinery but zero live callers and is keyed to a different entitlement chain
(`assessment_id`+`report_type`, not the manual path's `order_id`).

**4. Does payment confirmation still call generation synchronously?** Confirmed, re-verified
directly on this branch: `payment-service.ts:71-73` → `fulfilment.ts:16-21` →
`phase1-manual-fulfilment.ts:412-436` (Puppeteer render) — all awaited inline. The triggering
route (`webhooks/stitch/route.ts`) declares no `maxDuration` and runs under the platform default
timeout.

**5. Where does the payment transaction commit?** `record_payment_transition` (`0024...sql:110-228`)
— one `security definer` PL/pgSQL function, one Postgres transaction, called once from
`payment-service.ts:49-64`.

**6. Could a job row be inserted in the same transaction as the payment RPC?** Yes for the
payment commit itself (`record_payment_transition` could be extended to also insert a job row).
But transactionality is already broken one step later: `claim_payment_report_generation` is a
*separate* RPC call from a separate code path, executed after `record_payment_transition` has
already returned. Closing this fully means either folding job-creation into
`record_payment_transition` itself, or accepting the existing two-step pattern and relying on its
existing idempotency (`request_key` unique) to make the second step safely retriable.

**7. Uniqueness constraint preventing duplicate generation?** Yes, at three layers: attempt
(`manual_report_generation_one_active_order_uidx`, verified present), report
(`reports_one_current_assessment_type_uidx`, verified present, and the specific subject of a
real production incident fixed by `20260721150808...sql`), and payment
(`payment_transition_events.idempotency_key unique`).

**8. Is supersession DB-enforced or application-only?** Application-only, inside a
`security definer` RPC, made safe by the unique index in Q7 forcing correct ordering
(supersede-then-insert). No trigger auto-supersedes.

**9. Lease/heartbeat/claim mechanism already present?** Yes, extensively, but confined to the
dormant Phase14 tables. The live manual path has no lease/heartbeat concept — only the
single-active-attempt unique index, which prevents double-starts but cannot detect or recover a
genuinely stuck/crashed attempt.

**10. Retry scheduling already present?** Only in `phase14_storage_cleanup_queue`
(`next_attempt_at`, exponential backoff capped at 3600s, 5-attempt dead-letter). Nowhere in the
live manual path — retries are 100% human-initiated via the admin UI today.

**11. Terminal/manual-review state already present?** Yes, several:
`manual_report_generation_attempts.status = 'GENERATION_FAILED'`;
`report_ai_attempts.status` includes `provider_result_uncertain`/`reconciliation_required`
(already reachable per the headline finding); `phase14_workflow_start_outbox.status` includes
`acceptance_uncertain`/`reconciliation_required`; `reports.status` enum includes
`under_review`/`approved` but the live RPC never sets them.

**12. Does any cron/worker route invoke this automation today?** No. `vercel.json` crons is
confirmed empty. No route imports `workflow-start`, `automation/processor`,
`premium-report-fulfilment`, or `premium-report-service`. `workflow-start.ts` itself has zero
importers.

**13. Are existing cron/internal routes authenticated, reusably?** Yes —
`internal/phase14-storage-cleanup/route.ts:14-18` uses a standard `Authorization: Bearer
$CRON_SECRET` check. Directly reusable.

**14. Vercel duration constraints vs. current generation time?** No route declares
`maxDuration` (confirmed by grep — zero matches). PDF render alone allows up to 30s
(`DEFAULT_PDF_RENDER_TIMEOUT_MS`), plus a 15s content-set sub-timeout, before DB round-trips,
storage upload, and checksum re-verification are added — already close to typical platform
function-duration ceilings. If AI narrative generation were ever enabled, up to 2 attempts ×
120,000ms each are schema-legal (`report_ai_attempts.timeout_ms between 1000 and 120000`,
`attempt_number between 1 and 2`) — up to 240s, which would exceed most Vercel duration limits
outright. This is independent, strong evidence for moving generation off the request path
regardless of which job/queue design is chosen.

**15/16. Human quality-review promise, and is it DB-enforced?** Yes, promised explicitly in
customer-facing copy shown before payment (`FreeSnapshot.tsx:332,339,403`: "subject to MK
quality review before release," "reviewed by MK before release"). **No** `approved_by`/
`approved_at` columns exist anywhere in the schema (grep confirmed none) — contrary to what
might be assumed from the `reports.status` enum containing `under_review`/`approved` values,
those values are never set by the live RPC. The only real enforcement today is procedural: an
admin with `platform_admin`/`approver` role must explicitly call the send-email route; there is
no database-enforced approval gate. Release B must preserve this human-in-the-loop step (or
replace it with an equivalent, explicit, DB-recorded approval) — it cannot be silently dropped.

**17. Can the existing admin retry/regenerate UI be adapted to a durable workflow?** Not without
change — it currently blocks on one long synchronous fetch. The idempotency keys and role checks
are already correct and reusable; only the request/response shape needs to change from
fire-and-await to fire-and-poll.

**18. What would newly become reachable if Release B activates dormant Phase14
infrastructure?** Precisely: `workflow-start.ts` (0→N importers), `premium-report-fulfilment.ts`
(would actually execute), `automation/processor.ts`, `premium-report-service(-core).ts`, and the
tables `report_fulfilments`, `report_generation_runs`, `report_generation_claims`,
`report_delivery_authorizations`, `report_delivery_finalizations`, `report_delivery_remediations`,
`phase14_worker_capabilities`, `phase14_workflow_start_outbox`, `phase14_storage_cleanup_queue`
(if its cron were wired), `phase14_operational_alerts`. **Not** in this "currently inert"
category — already partially live per the headline finding — `phase14_security_gates`,
`phase14_feature_policies`, `phase14_ai_route_policies`, `report_ai_attempts`.

**19. RLS/grants on candidate job tables?** `report_generation_claims`: RLS enabled, all roles
revoked, **no** select policy at all — access is exclusively via `security definer` RPCs.
`report_delivery_authorizations`/`finalizations`: RLS enabled, admin-role-gated select policy.
`manual_report_generation_attempts`: RLS enabled, admin-role-gated select including
`finance_admin`. Several Phase14 tables go further and revoke from `service_role` too — even the
app's own service-role client cannot touch them directly; every mutation is RPC-only. This
defense-in-depth pattern is worth following for any new Release B table.

**20. Smallest necessary migration changes (rough list)?**
- Extend `manual_report_generation_attempts` (or a sibling table modeled on it) with
  lease/heartbeat and `next_attempt_at` backoff columns, mirroring
  `phase14_storage_cleanup_queue`'s pattern — not `report_generation_claims`, which is keyed to
  a different entitlement chain with zero live callers to build on.
- Fold job-row creation into `record_payment_transition` (or accept the existing two-step
  pattern, relying on its idempotency) to close the atomicity gap at Q6.
- Add one authenticated cron/worker route reusing the exact Bearer-token pattern from
  `phase14-storage-cleanup/route.ts`, registered in `vercel.json` (currently empty).
- Add a `for update skip locked`-based claim RPC mirroring
  `claim_phase14_storage_cleanup_jobs`.
- Change the admin UI's fetch-and-block pattern to submit-then-poll (application code, not a
  migration).
- No new uniqueness/supersession constraints needed — the existing partial-unique indexes
  already cover duplicate-prevention.
- Explicitly decide (and record as a migration-level, gate-checked decision) whether
  `ai_narrative` stays off during Release B — it is in scope either way, since it is already
  reachable, not dormant.

## Audit gate outcome

**A new `fulfilment_jobs` table modeled from scratch is not justified.** The existing
`manual_report_generation_attempts` table already has: a status enum, an idempotent claim RPC
chain, one-active-per-order enforcement, and a `retry_count` column. It is missing exactly two
things a durable job needs — lease/heartbeat and scheduled retry — and both have a proven,
already-audited reference implementation in this same codebase
(`phase14_storage_cleanup_queue`'s claim/backoff pattern) to copy rather than invent. Building a
brand-new table would duplicate this existing state machine rather than complete it, and would
leave the still-unexplained Q6 atomicity gap in place either way. **Decision: extend
`manual_report_generation_attempts` (via a new migration adding the missing columns and a
sibling claim RPC), not replace it, and not resurrect `report_generation_claims`.**

See `docs/safe-launch/12-durable-fulfilment-design.md` for the resulting minimum-change design.
