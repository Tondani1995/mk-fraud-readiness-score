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

Proposed scope for Release D's code:

1. **Operational alerts admin surface** — a new read-only admin route/page
   (`/score/admin/operational-alerts`, matching existing route conventions) that lists
   `phase14_operational_alerts` rows, filterable by severity/category/date, role-gated the same way
   every other admin route in this codebase is (`requireAdmin(['platform_admin', ...])`). Zero new
   migrations required — the table and its RLS policy already exist. This is the single most
   concrete, evidence-backed gap found (a live write path with no consumer).
2. **Consolidated go-live checklist** (`docs/safe-launch/21-go-live-checklist.md` or similar) —
   aggregates every open gate already scattered across 09/12/15/17/19 into one document, cross-
   referencing rather than duplicating each source. Pure documentation.
3. **Release/rollback runbook** — closes `00-current-state.md` §15 directly: how to deploy, how to
   roll back a Vercel deployment, how a migration would be rolled back if the integrated release
   candidate's cloud certification ever needs it. Pure documentation; does not require the cloud
   certification to have happened yet to be written correctly.
4. **`vercel.json` cron entry prepared at target frequency**, added as a documented, currently-inert
   change (or left as a clearly-labelled follow-up in the checklist) — do not silently flip production
   cron frequency as a side effect of an unrelated commit; that decision belongs with the plan
   upgrade, not buried in Release D's diff.

**Explicitly out of scope for this cycle** (would exceed "smallest safe boundary" or duplicate
another release's own domain): new alert *write* paths beyond what A/B/C already generate (adding new
alert sources risks touching frozen A/B/C domain logic); any Vercel plan/billing change; empirical
worker-runtime measurement against a real deployment; a second admin account or any Supabase Auth
user-management change; centralising `/score/admin/*` auth into `middleware.ts` (a real improvement,
but a broad refactor touching every existing admin route — higher blast radius than this cycle's
boundary should take on, better suited to its own reviewed change).

## 6. Migration requirements

None required for the boundary in §5 — `phase14_operational_alerts` already exists with its schema,
RLS, and admin-select policy on `main`. If query performance on a filtered/time-windowed view turns
out to need a new index, that would be one small additive migration, reviewed on its own merits at
implementation time. Whatever Release D's own migration file (if any) contains would join the same
queue as Releases A/B/C's — written, locally replayed, CI-verified, and **not applied to
`jvjxlphdyzerrhwcgkup`** until the integrated release candidate's own cloud-certification event.

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

Following the established pattern (static source assertions + live disposable-Postgres checks, no
new framework introduced): confirm the new admin route is role-gated before rendering any alert
detail; confirm `phase14_operational_alerts` rows created by Release C's existing bounce/complaint
path render correctly; confirm the route makes no write calls (read-only surface); `npm run
typecheck`, `npm run build`, existing release-a/b/c static suites unchanged; all 6 required GitHub
workflows green on the true final head, independently, like every prior cycle. No claim of cloud
verification anywhere in Release D's own evidence pack entry, matching Option B.

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
- Release D PR (to be opened alongside this document): base `release-c/email-secure-delivery`
