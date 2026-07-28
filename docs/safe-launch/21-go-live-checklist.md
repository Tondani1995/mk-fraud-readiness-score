# Go-Live Checklist

The single authoritative list of what stands between this codebase and Production authorisation.
Every gate below already existed somewhere in this programme's docs before this cycle — this
document consolidates them by reference; it does not restate their evidence in full, and updating an
item here without updating its cited source document (or vice versa) is a bug in the documentation,
not an acceptable drift.

**Stage definitions**, used consistently in the "Stage" column:

| Stage | Means |
|---|---|
| Code complete | Written, matches its own design doc, no known incompleteness |
| Locally verified | Passes disposable-Postgres replay + static suites on the author's machine |
| CI verified | All 6 required GitHub workflows green on the exact final head (not inferred from an earlier commit) |
| Preview verified | Exercised against a real Preview deployment (real Vercel, real provider where applicable) |
| Cloud migration applied | The relevant migration(s) exist on the live Supabase project's `list_migrations` ledger |
| External provider certified | A real send/webhook round-trip independently confirmed against the real Resend account |
| Production authorised | Explicit controller/owner sign-off to deploy to Production — the only stage this document cannot self-assign |

No item may be marked complete without the evidence reference in its own row. An empty or
placeholder evidence reference means the item is not complete, regardless of what the Stage column
might otherwise suggest.

## Migration and cloud-schema gates

| Gate | Stage | Evidence |
|---|---|---|
| Complete A-D migration sequence exists and replays cleanly locally | Code complete, Locally verified | Each release's own migration replay; `22-release-and-rollback-runbook.md` §4 for the combined sequence |
| Schema reconciliation (cloud matches what the code assumes) | **Not met** | `19-release-c-cloud-schema-reconciliation.md` — live ledger stops at `20260721150808`, before Release A |
| Backup/PITR checkpoint taken immediately before cloud migration | **Not yet applicable** (no migration has been scheduled) | `22-release-and-rollback-runbook.md` §3 (procedure only, not yet executed) |
| Exact Production commit confirmed before any change | **Not verified** | `23-vercel-operational-inventory.md` — no tool available reads this; owner must confirm directly |
| Cloud migration applied (A-D) | **Not done — deliberately deferred, Option B** | `19-release-c-cloud-schema-reconciliation.md` §2a (controller decision) |

## External-provider certification gates

| Gate | Stage | Evidence |
|---|---|---|
| Resend sender/domain verification (SPF/DKIM/DMARC) | Owner-attested, not independently re-verified | `17-domain-authentication.md` |
| Resend webhook endpoint configured | Owner-attested | `18-controlled-resend-preview-verification.md` §1 |
| Paired HMAC secrets provisioned (Vercel + Supabase, matching values) | **Not done — blocked on schema reconciliation above, capability now exists** | `19-release-c-cloud-schema-reconciliation.md`; provisioning UI: `/score/admin/phase14-activation` (Release C, commits `5fa9653`/`7b1dfa7`) |
| Four message types verified (customer confirmation, admin alert, payment-confirmed, report-ready) | **2 of 4** — customer confirmation and admin alert real-sent and message-ID-persisted; admin alert mailbox receipt owner-confirmed | `09-release-evidence.md`, controlled-Resend-send-cycle section |
| Signed webhook HTTP 200 + database attestation persisted | **Not done** | Same section — zero rows in `email_provider_events`/`phase14_provider_attestations` as of last check |
| Preview email mode returned to `disabled` before Production approval | **In progress, owner action** | `09-release-evidence.md` "Preview environment rollback" entry |

## Durable-fulfilment and worker gates

| Gate | Stage | Evidence |
|---|---|---|
| Durable worker mechanism (claim/lease/retry/recovery) | Code complete, Locally verified | `12-durable-fulfilment-design.md`, Release B (#42) evidence |
| Immediate exact-attempt dispatch and automatic downstream release/delivery | Code complete, Locally verified; controller review required | `34-rc1-near-real-time-automatic-fulfilment.md`; dedicated 24-check suite and 43-migration replay |
| Worker runtime measured under real provider load | **Not done — controlled certification required** | Document 34 certification SLOs |
| Queue safety (no unrelated job or delivery claimed by an immediate run) | Locally verified with synthetic exact-claim isolation; cloud certification outstanding | Document 34; `scripts/rc1-prepostflight-disposable-tests.mjs` |
| Vercel plan and cron-frequency decision | **Decided for launch:** current daily cron stays enabled as delayed recovery; immediate dispatch is primary; optional Pro minute-level recovery is not launch-required | Documents 29 and 34 |
| Reconciliation of existing paid orders against post-migration behaviour | **Not done** | `19-release-c-cloud-schema-reconciliation.md` §2, Option C assessment (18 `payment_received` orders at last count) |
| Exception owner and mailbox | Tondani Netili; `admin@mkfraud.co.za`; operational certification outstanding | Documents 29 and 34 |

## Operational-readiness gates (Release D)

| Gate | Stage | Evidence |
|---|---|---|
| Operational-alerts admin surface | Code complete, Locally verified, CI verified | `09-release-evidence.md` "Release D evidence" |
| Audited alert lifecycle (acknowledge/resolve/reopen) | Code complete, Locally verified, CI verified | `transition_phase14_operational_alert` RPC, migration `20260725150000`; `09-release-evidence.md` |
| Monitoring and alert ownership decided (who watches this page) | **Not decided** — this document does not itself assign an owner | — |
| Second-admin/break-glass decision | **Not decided** | `20-release-d-scope-and-existing-infrastructure-audit.md` §3 |
| Rollback readiness (documented procedure) | Code complete (the procedure exists) | `22-release-and-rollback-runbook.md` |

## Overall status

**Production authorised: no.** The accepted RC1 technical base is locked. The near-real-time
automatic-fulfilment correction is code complete and locally verified but requires exact-head CI and
controller review. Schema reconciliation, backup/cutover evidence, controlled provider
certification, paid-order dispositions, canary authority and remaining operational approvals are
still outstanding. RC1 OPERATIONAL READINESS, RC MIGRATION/DEPLOYMENT, CLOUD CERTIFICATION and
PUBLIC LAUNCH remain **NO-GO**; **DO NOT MERGE**.

## Cross-references

- Release D scope: `20-release-d-scope-and-existing-infrastructure-audit.md`
- Release and rollback runbook: `22-release-and-rollback-runbook.md`
- Vercel operational inventory: `23-vercel-operational-inventory.md`
- Cloud-schema reconciliation and decision memo: `19-release-c-cloud-schema-reconciliation.md`
- Full evidence pack: `09-release-evidence.md`
