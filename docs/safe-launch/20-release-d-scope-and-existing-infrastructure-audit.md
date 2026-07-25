# Release D0 — Scope and Existing-Infrastructure Audit

Produced per the controller's Option B decision (`19-release-c-cloud-schema-reconciliation.md` §2a):
Release D is authorised to proceed as **code-only** work, on its own stacked draft branch/PR, with
no cloud-level claim, once its scope is established here and reviewed. **This document is the
scope-establishment step. No Release D implementation code has been written yet.**

Method: read `docs/safe-launch/00-current-state.md` through `13-durable-fulfilment-runbook.md` (the
pre-Release-C history), the PR #40/#41/#42 descriptions, and the repo's root-level integration docs;
searched the repo for every prior mention of "Release D"; and independently re-verified the load-
bearing claims below directly against the current `release-c/email-secure-delivery` checkout (not
taken on faith from the research pass) before writing them here.

## 0. Where "Release D" actually comes from

**Release D was never scoped anywhere in this repository before now — it exists only as three
forward-references, all pointing at a document that didn't exist until this one:**

- `00-current-state.md` §15 ("Release and rollback process"), verbatim: *"Not yet inventoried in
  this pass — no `docs/` release-process documentation was found in the repo... This is carried
  forward as an explicit task for Release D, not resolved here."*
- `00-current-state.md` §3 ("Vercel project and environment structure"), verbatim: *"Full Vercel
  project/team inventory... was not pulled in this pass — the Vercel MCP tool requires a team ID I
  have not yet resolved. This is an open item for Release A/D setup..."*
- The controller's own instruction this cycle names the domain explicitly: "admin recovery,
  monitoring, alerting, reconciliation and operational-readiness requirements." This matches, almost
  verbatim, a heading that already exists in `12-durable-fulfilment-design.md`: **"Operational
  readiness (not met on the current plan)"** — Release B's own design doc already used this exact
  term for the one gap it explicitly could not close within its own cycle (see §2 below). Release D's
  domain is not a new invention; it is the closure of gaps Releases A, B, and C each explicitly
  deferred rather than resolved.

Nothing in the repo ever described Release D as "operational readiness" before this controller
instruction, but the instruction and the pre-existing deferred-item trail line up precisely — this
document treats that as the confirmed scope, not an assumption.

## 1. Exact intended Release D outcome

Close the accumulated "carried forward" operational-readiness gaps from Releases A, B, and C's own
docs — release/rollback process, Vercel account-level inventory, visibility into operational signals
the codebase already generates but nothing reads, and a consolidated go-live checklist — as
**code-only, locally-testable work**, so that when the integrated A-D release candidate is finally
cloud-certified (Option B), operational readiness is certified in the same pass rather than
discovered as a gap afterward. Release D does not re-open or modify Release A/B/C's own domain logic
(payments, delivery, backlog reconciliation) — it adds an operational layer on top.

## 2. What is already implemented

- **`phase14_operational_alerts` table** (`0017_phase14_canonical_disabled_foundation.sql:909-926`,
  RLS-enabled, admin-`select`-only policy) — already on `main`, part of the dormant Phase 14
  foundation. Independently confirmed this table now has a **live write path**: Release C's closure
  migration (`20260724180000_release_c_closure_delivery_exceptions.sql`) writes to it on permanent-
  bounce/complaint events (9 live-verified checks recorded in `09-release-evidence.md`). Independently
  re-confirmed just now: `grep -rn "phase14_operational_alerts" src/` returns **zero matches** — no
  route, page, or component anywhere in the app reads this table. It is being populated by real,
  reachable code and has no consumer.
- **Narrow, per-feature recovery RPCs**, already implemented and tested (locally) across Releases
  B/C: `retry_fulfilment_job`, `recover_fulfilment_job`, `recover_expired_fulfilment_leases`,
  `retry_delivery`, `revoke_customer_report_access_token`, `reissue_customer_report_access_token`,
  `correct_delivery_recipient_and_queue`. These are real recovery mechanisms, but each is scoped to
  one feature's own failure mode — there is no cross-cutting "what needs attention right now" surface
  that aggregates them.
- **`audit_logs`** (universal, already used by every admin-mutating RPC across every release) and
  **`order_events`** (per-order activity timeline) — both already populated, both already have
  partial admin-facing surfaces (the order-detail page's delivery-history sections), neither has a
  cross-order or time-windowed operational view.
- **A `middleware.ts` exists at `src/middleware.ts`** — independently read in full. It gates only the
  separate marketing-site `/admin` (website CMS/insights) surface via a JWT cookie check; its
  `matcher` does not include `/score/admin/*` or `/score/api/admin/*`. **The fraud-platform admin
  console — every admin surface Releases A/B/C added — has no centralized gate; each route/page calls
  `requireAdmin()` individually**, which is the correct characterisation, more precise than "no
  middleware.ts exists at all."
- **CI**: 6 required GitHub workflows, already exercising every release's static suites and migration
  replay. Established static-suite + live-disposable-Postgres testing pattern, reusable for Release D
  with no new tooling.
- **A single `platform_admin` row** in `admin_profiles` (per `00-current-state.md` §9) — the only
  admin account presently able to reach AAL2-gated actions across every release.

## 3. What is genuinely missing

- Any admin-facing surface that reads `phase14_operational_alerts` (or `order_events`/`audit_logs`)
  as a cross-cutting operational view, rather than per-order/per-feature only.
- A documented release/rollback process (`00-current-state.md` §15, explicit open item).
- A pulled Vercel project/team-level inventory — env var *values*, domain config, preview aliasing
  (`00-current-state.md` §3). **Partially resolvable now without new capability**: this session's
  Vercel MCP tools (already used throughout this engagement, e.g. `list_deployments`, `get_project`)
  were not available to whoever wrote `00-current-state.md`, and can pull most of this read-only.
- The Vercel Cron/plan launch gate (`12-durable-fulfilment-design.md`, "Vercel plan launch gate"):
  production is on a plan tier that cannot run the fulfilment worker at its certified 1-2 minute
  interval; `vercel.json` currently ships a once-daily `0 3 * * *` stopgap. Independently confirmed
  by reading the current `vercel.json` directly.
- "Measuring worker runtime" — `12-durable-fulfilment-design.md`, explicitly headed **"(integrated
  release-candidate cycle, not this cycle)"** — i.e. this document's own predecessor already
  earmarked this for exactly the cycle Release D is part of.
- A consolidated go-live / launch-blocker checklist. None exists as a single document; the real gates
  are scattered across `09-release-evidence.md`, `12-durable-fulfilment-design.md`,
  `15-email-and-secure-delivery-design.md`, `17-domain-authentication.md`, and
  `19-release-c-cloud-schema-reconciliation.md`.
- A no-test-framework gap (`00-current-state.md` §12-13): no jest/vitest/playwright; the ~70+ ad hoc
  `scripts/*.mjs` static-assertion-plus-disposable-Postgres pattern is the only test layer that
  exists. Out of scope to fix wholesale in Release D (a framework migration is its own large,
  separate project) but worth naming plainly rather than pretending it isn't there.
- Break-glass/succession for the single `platform_admin` account — not previously named as a gap
  anywhere in the docs, but follows directly from §2's single-admin-row finding: today, if that one
  account is locked out, nothing in this codebase has an alternate path to any AAL2-gated action.

## 4. Code gaps versus cloud-certification gaps

**Code gaps (buildable and locally testable now, no live Supabase or Vercel account change needed):**
the operational-alerts read surface; the consolidated go-live checklist doc; the release/rollback
runbook doc; a `vercel.json` cron entry at the target frequency, written and ready but not yet the
active schedule (see §7 — activating it needs a plan change, writing it doesn't).

**Cloud/account-level gaps (owner-actionable, not Release D code work, and not resolved by writing
more code):** the Vercel plan tier upgrade itself; actually pulling live env var *values* (this
document can pull public metadata via MCP tools, but secret values are correctly never read by any
tool available in this session, matching every prior release's discipline); measuring real worker
runtime under real load (needs a real running deployment against a real, sufficiently-populated
database — deferred to the integrated release candidate's own cloud certification pass, consistent
with `12-durable-fulfilment-design.md`'s own framing); a second admin account for break-glass
purposes (creating a real Supabase Auth user is an account-level action, not a schema change).

## 5. Smallest safe implementation boundary

**Superseded by controller amendment, recorded here for the audit trail:** this section originally
proposed a read-only alerts surface (§5 as first written, see git history of this file). The
controller's Release D0 approval amended that scope before implementation began: the surface must be
*actionable* (acknowledge/resolve/reopen), not read-only, via one narrow, audited, SECURITY DEFINER
RPC. What was actually built, matching the amended instruction:

1. **Operational alerts admin surface** (`/score/admin/operational-alerts`) — lists
   `phase14_operational_alerts` rows with server-side status/severity/category/date filtering,
   pagination, and open/acknowledged/resolved counts. Read-gated the same way every other admin route
   in this codebase is (`requireAdmin(['platform_admin','reviewer','approver','read_only_admin'])`,
   the four existing table-select roles). Raw `detail_json` is never rendered — an explicit
   per-category safe-field allow-list (`src/lib/reports/operational-alerts.ts`) governs what surfaces.
2. **Audited lifecycle transition** — one new additive migration
   (`supabase/migrations/20260725150000_release_d_operational_alert_lifecycle.sql`) adds lifecycle
   metadata columns and the `transition_phase14_operational_alert` SECURITY DEFINER RPC, the sole
   authoritative path for open→acknowledged, open→resolved, acknowledged→resolved, acknowledged→open,
   and resolved→open (explicit reopen only). Mutation is restricted to `platform_admin`/`reviewer`,
   requires a non-empty reason, uses the existing `phase14_require_actor` AAL2 gate, and writes one
   `audit_logs` entry per transition (never `detail_json`). No direct table UPDATE from TypeScript —
   table grants remain `select`-only to `authenticated`, matching every other Phase14 admin surface.
3. **Cloud-schema fail-closed behaviour** — capability is detected via PostgREST OpenAPI
   introspection (`checkOperationalAlertLifecycleCapability`), never a raw RPC probe. Against the
   current shared cloud schema (which does not have this migration), the page renders read-only, the
   lifecycle controls do not render, and the transition route returns a clean message rather than a
   raw PostgREST error if called directly. No temporary cloud RPC was created; no synthetic alert was
   inserted into the shared database.
4. **Consolidated go-live checklist** (`docs/safe-launch/21-go-live-checklist.md`) — aggregates every
   open gate already scattered across 09/12/15/17/19 into one document, cross-referencing rather than
   duplicating each source.
5. **Release/rollback runbook** (`docs/safe-launch/22-release-and-rollback-runbook.md`) — closes
   `00-current-state.md` §15 directly.
6. **Vercel operational inventory** (`docs/safe-launch/23-vercel-operational-inventory.md`) —
   read-only evidence pulled via the Vercel MCP tools this cycle; no secret values recorded.

**`vercel.json` cron entry — explicitly not done, per controller instruction.** The controller
directed that no "prepared but inert" cron schedule be committed, on the grounds that a committed cron
schedule is not meaningfully inert once the branch is integrated. `vercel.json` is unchanged by
Release D; the target cadence and plan dependency are recorded in the go-live checklist and Vercel
inventory as an owner decision instead.

**Remains explicitly out of scope for this cycle** (unchanged from the original boundary): any Vercel
plan/billing change; empirical worker-runtime measurement against a real deployment; a second admin
account or any Supabase Auth user-management change; centralising `/score/admin/*` auth into
`middleware.ts`; duplicating any Release B/C recovery RPC inside Release D.

## 6. Migration requirements

One narrow, additive migration was required after all — `20260725150000` (see §5.2), because the
amended scope requires an audited *write* path, not only a read surface. `phase14_operational_alerts`
itself, its schema, RLS, and admin-select policy were already on `main` and are unchanged; this
migration only adds new nullable/defaulted lifecycle columns, three new indexes, and one new function.
No existing column, constraint, or function is altered or dropped. This migration joins the same queue
as Releases A/B/C's — written, locally replayed (all 37 migrations, embedded-postgres), CI-verified,
and **not applied to `jvjxlphdyzerrhwcgkup`** until the integrated release candidate's own
cloud-certification event.

## 7. External-provider or paid-resource requirements

None for the §5 boundary. The Vercel plan-tier upgrade (§3/§4) is a real, pre-existing cost decision
carried over from Release B — it is named here for completeness and cross-referenced in the go-live
checklist, but it is an owner/billing decision, not something Release D's code can resolve or should
attempt to work around (e.g. by silently shipping a cron frequency the current plan would reject).

## 8. Production compatibility risks

Low, by design: the §5 boundary is purely additive (a new read-only route, new documentation) and
touches no existing order/payment/delivery logic from any prior release. The structural risk is the
same one every release since B has carried: Release D depends on `release-c/email-secure-delivery`,
which is not yet cloud-certified (Option B) — Release D's own local-Postgres-replay tests can and
should exercise the full accumulated schema (A+B+C+D) exactly as Release C's own tests already do,
but **Release D cannot claim cloud-level verification before Release C does**, for the identical
structural reason C couldn't be verified before B.

## 9. Tests and evidence required

**Superseded by the amended, actionable scope** (§5): the original proposal above described tests for
a read-only surface. The controller's amendment additionally required an 18-case suite covering the
lifecycle RPC's role gating, transition validation, audit-record correctness, reopen field-clearing,
secret/raw-payload non-exposure, and cloud-capability-absence behaviour. `scripts/release-d-operational-alerts-tests.mjs`
implements all 18 cases (13 executed live against disposable local Postgres with all 37 accumulated
A-D migrations replayed, including a real alert created through Release C's own bounce/complaint path
— not a reimplemented fixture; 2 covered by static source assertions; 1 by pure-function tests; 1
deferred by design to the pre-existing separate release-a/b/c npm scripts, per the script's own header
comment) — see `09-release-evidence.md` for the run result. Also run: `npm run typecheck`, `npm run
build`, the dependency-audit gate, and existing release-a/b/c static and live suites unchanged; all 6
required GitHub workflows green on the true final head, independently, like every prior cycle. No
claim of cloud verification anywhere in Release D's own evidence pack entry, matching Option B.

**Controller correction cycle (head `503f383` reviewed, found not yet acceptable):** the controller's
review found one material queue-ordering defect and two related filter-correctness defects in the
admin page — global severity ordering applied after pagination instead of before (an older critical
alert could hide on a later page), an inclusive `lte` end-date bound that silently excluded events
later on the selected final day, and status-count queries that ANDed two conflicting status
conditions together, zeroing the other two badges whenever one status was selected. **This scope
correction stays within the boundary already approved in §5 — it is a correctness fix to the
already-approved alerts surface and lifecycle, not new scope, a new feature, or a reopening of any
question this document previously closed.** No cloud action was taken to investigate or fix any of
the three defects; all three were fixed and proven entirely in application code, a query-builder-mock
test layer, and the existing disposable-local-Postgres harness. See `09-release-evidence.md`
"Controller correction cycle" for the full defect-by-defect record and proof. Release D is not yet
controller-accepted; this correction is submitted for the controller's own re-review, not a
self-certified close-out.

**Controller hardening pass (head `03310eb` reviewed, one final pass required before acceptance):**
the controller confirmed the three original defects fixed and required one narrow hardening pass:
severity/created_at ordering was not fully deterministic for rows sharing both values (fixed with an
`id asc` tie-breaker, applied in the database before pagination, same as the other two ordering
columns); date validation relied on `Date.parse` alone, which silently rolls impossible calendar
dates over rather than rejecting them (fixed with strict component-parse-and-round-trip validation,
plus explicit handling of a valid-but-contradictory from-after-to range); and date bounds were
computed as UTC calendar days rather than the South African operational calendar this platform's
MK operators actually use (fixed with an explicit, named SAST/Africa-Johannesburg conversion,
replacing unexplained UTC arithmetic). **This hardening pass, like the correction before it, stays
within the boundary already approved in §5 — it does not add scope, a new feature, or reopen any
question this document previously closed.** No cloud action was taken. See `09-release-evidence.md`
"Controller hardening pass" for the full record and proof. Release D remains not yet
controller-accepted pending this pass's own review.

## 10. Fit into the integrated A-D release candidate

Once Releases A-D are each code-complete and independently CI-green on their own stacked branches,
the integrated release-candidate branch merges all four in dependency order (A, then B, then C, then
D) and applies the full accumulated migration set to a properly certified environment in one reviewed
cloud change (per whichever of Option A/B this program ultimately executes for that event — see
`19-release-c-cloud-schema-reconciliation.md` §2 for the mechanics either option would use). The full
verification suite then runs once, end to end: the controlled Resend send and webhook proof deferred
from this Release C cycle, payment/quality-review/report-delivery verification, **and** Release D's
own operational-alerts surface and go-live checklist get their first real cloud-level exercise in
that same pass, rather than being separately re-verified release by release.

## Cross-references

- Release C cloud-schema reconciliation and controller decision: `19-release-c-cloud-schema-reconciliation.md`
- Release C evidence pack: `09-release-evidence.md`
- Release B durable-fulfilment design (source of the "Operational readiness" term and the Vercel
  plan/cron gate): `12-durable-fulfilment-design.md`
- Original discovery report (source of the Release D forward-references): `00-current-state.md`
- PR #43: `feat(release-c): real transactional email and secure customer report delivery`, base
  `release-b/durable-fulfilment` (stacked)
- PR #44: `feat(release-d): operational-alerts admin surface with audited lifecycle`, base
  `release-c/email-secure-delivery` (stacked)
- Go-live checklist: `21-go-live-checklist.md`
- Release and rollback runbook: `22-release-and-rollback-runbook.md`
- Vercel operational inventory: `23-vercel-operational-inventory.md`
