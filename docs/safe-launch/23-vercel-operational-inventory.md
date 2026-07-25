# Vercel Operational Inventory

Read-only. Closes `00-current-state.md` §3's open item ("Full Vercel project/team inventory... was
not pulled in this pass — the Vercel MCP tool requires a team ID I have not yet resolved") using
this session's Vercel MCP tools (`get_project`, `list_teams`, `list_deployments`), which that
document's author did not have. **No secret value is recorded anywhere in this document** — none of
the tools used here can read one, and none was requested.

Every fact below is labelled:

- **Observed** — read directly via a tool this session, this cycle, cited with the call that
  produced it.
- **Owner-confirmed** — stated by the owner/controller earlier in this engagement, not
  independently re-verified here.
- **Not verified** — genuinely unknown from this session; needs the owner to check directly.

## Team and project identifiers (Observed)

- Team: `Tondani's projects`, slug `tondanis-projects`, id `team_GUJmlkNo4bbVh75FwxcrQI61` (`list_teams`).
- Project: `mk-fraud-platform`, id `prj_jFSTfwL14kk8UURjaaRwYe2HWuhK`, framework `nextjs`, Node
  version `24.x` (`get_project`).
- This is the only team and only relevant project this session's Vercel access can see.

## Domains attached to the project (Observed)

Via `get_project`, the project has five domains attached: `mkfraud.co.za`, `www.mkfraud.co.za`,
`mk-fraud-readiness-score.vercel.app`, `mk-fraud-platform-tondanis-projects.vercel.app`,
`mk-fraud-platform-git-main-tondanis-projects.vercel.app`. **Not verified**: which of these is the
actual Production-serving domain versus a legacy/unused alias — `get_project` lists attached domains
but does not label a "primary" one, and no tool in this session's Vercel MCP surface distinguishes
domain-to-environment binding beyond what a deployment's own `alias` array shows for a specific
deployment. The owner should confirm which domain is the one customers actually reach.

## Branch-to-deployment mapping (Observed)

Every push to a feature branch on this repo auto-deploys via Vercel's GitHub integration (a side
effect of the integration, not something separately configured per branch) and receives a stable
branch alias of the form `mk-fraud-platform-git-<branch-slug>-tondanis-projects.vercel.app` — e.g.
`release-c/email-secure-delivery` → `mk-fraud-platform-git-release-c-email-f80f7b-tondanis-projects.vercel.app`,
`release-d/operational-readiness` → `mk-fraud-platform-git-release-d-operat-c6b169-tondanis-projects.vercel.app`.
Each individual deployment also gets a unique, non-stable URL (e.g.
`mk-fraud-platform-1l22tmmo3-tondanis-projects.vercel.app`); the branch alias always points at the
latest deployment for that branch (confirmed by comparing `list_deployments`' per-deployment
`branchAlias` metadata against which deployment is newest, repeatedly, across this and prior
cycles).

## Deployment protection (Observed, partially)

Every Preview URL accessed this engagement required a `_vercel_share` bypass token
(`get_access_to_vercel_url`) before it would render — confirmed repeatedly, this cycle and prior
cycles, not assumed once and reused. This means some form of Vercel Deployment Protection
(password, Vercel Authentication/SSO, or team-only access) is active on Preview deployments. **Not
verified**: the exact protection mode (password vs. Vercel Authentication vs. trusted-IP) — no tool
available this session reads deployment-protection *configuration*, only whether a bypass was
needed in practice.

## Cron configuration (Observed)

`vercel.json`, read directly from this repo: a single cron entry, `{"path":
"/score/api/internal/fulfilment-worker", "schedule": "0 3 * * *"}` — once daily. Per
`12-durable-fulfilment-design.md`, the durable-fulfilment worker's certified target frequency is
every 1-2 minutes; running at that frequency on the current plan tier fails deployment (see "Plan
tier" below). This document does not change `vercel.json` — see `21-go-live-checklist.md` for the
gate and `20-release-d-scope-and-existing-infrastructure-audit.md` §7 for why Release D does not
touch this file. **Vercel Cron Jobs only execute against Production deployments, never Preview**
(documented Vercel behaviour, independently consistent with this whole engagement never having
observed a Preview-triggered automatic worker run) — so today, on Preview, the fulfilment worker
only ever runs via the manual "process queue now" admin action, never on a schedule at all.

## Plan tier (Not verified from this session; consistent with an existing, owner-attested finding)

No tool available in this session's Vercel MCP surface reads billing/plan-tier information
directly. `12-durable-fulfilment-design.md`'s "Vercel plan launch gate" (written in an earlier
cycle) states the production project is on a tier that cannot run cron at the 1-2 minute target
frequency — recorded here as owner-attested via that earlier document, not re-confirmed
independently this cycle.

## Environment variable names and scopes (Observed, names only — never values)

Confirmed to exist on Preview for `release-c/email-secure-delivery`, from this engagement's own
work provisioning/using them (never by reading their values — no tool available ever does that):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MK_REPORT_EMAIL_FROM`, `MK_REPORT_EMAIL_REPLY_TO`,
`MK_INTERNAL_LEADS_EMAIL`, `MK_EMAIL_PROVIDER_MODE` (owner-confirmed set to `test` mid-cycle, then
scheduled to be returned to `disabled` per the controller's rollback instruction), `CRON_SECRET`
(referenced by the worker route's own auth check; never requested or handled by any session in this
engagement, per this programme's standing rule).

**As of this document, `PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET` and
`PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET` do not exist on Preview** — this is the same finding
recorded in `19-release-c-cloud-schema-reconciliation.md`, not a new one, repeated here because this
document is meant to be a complete environment-variable inventory. **Owner secret entry for these
two remains deferred** per the controller's Option B decision — nothing here changes that.

## What remains owner-attested or unavailable

- Exact Production commit/branch currently serving `mkfraud.co.za` traffic.
- Whether Production has ever received a deployment from any commit later than the one the live
  Supabase schema matches (`19-release-c-cloud-schema-reconciliation.md`'s finding that the cloud
  database reflects pre-Release-A state is the closest available signal, but Vercel deployment
  history and Supabase migration history are two independent systems and this document does not
  assume they moved in lockstep).
- Full list of environment variables and their exact Preview-vs-Production scoping (this document
  lists names this engagement has directly used or provisioned; it is not a machine-verified
  complete enumeration, since no tool available lists env var names without also being able to read
  values, and reading values is out of scope for any tool used in this engagement).
- Deployment-protection exact mode (see above).
- Production plan tier (see above).

## Cross-references

- Release D scope: `20-release-d-scope-and-existing-infrastructure-audit.md`
- Go-live checklist: `21-go-live-checklist.md`
- Release C cloud-schema reconciliation (source of the HMAC-secret finding repeated above):
  `19-release-c-cloud-schema-reconciliation.md`
- Release B durable-fulfilment design (source of the Vercel plan/cron gate): `12-durable-fulfilment-design.md`
