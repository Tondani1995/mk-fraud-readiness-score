# Genuine staging readiness — 25 October 2026

**Hosted staging tests remain blocked. No deployment or remote write was performed.** This investigation used connector metadata and one read-only query of activation-policy metadata. It did not read customer assessments, credentials, transactions or documents.

## Evidence and exact blockers

- Supabase lists active project `iszihmmbgsfefawqmnwo` and inactive `penhenkzfrtmcxklodtu`. Branch inventory for the active project shows only the default `main` branch. There is no separately isolated branch available in that inventory.
- A fresh read of `adaptive_activation_policies` shows enabled `customer_start` policies for **both preview and production** against `iszihmmbgsfefawqmnwo`, using the same V1.2 candidate graph. The project name containing “preview-staging” is not isolation evidence. No writes were attempted there.
- Supabase's create-branch quote returned `{type:"branch",recurrence:"hourly",amount:0.01344}` (the response did not include a currency field). The connector requires explicit agreement to the cost before branch creation. That agreement was not supplied. No billable branch/project was created.
- [Supabase branching documentation](https://supabase.com/docs/guides/deployment/branching) describes separate instances/credentials and data-less branches, but the migration/configuration workflow can apply vault secrets and deploy functions. A data-less database alone is not proof of blocked worker, notification or provider egress. Review migrations, seeds, functions, scheduled jobs and vault configuration before provisioning.
- Vercel exposes project `mk-fraud-platform` metadata. Listing even non-decrypted environment metadata returned 403 forbidden, including an explicitly scoped retry. The Vercel CLI is not installed, so its mapped fallback was unavailable. No secrets were requested/decrypted/pulled or copied from production.
- This checkout has no application `.env.local`, Supabase service credential/token pepper or approved bound preview identity. No deployment exists for these local changes; the user expressly prohibited deployment. Existing unrelated previews cannot establish evidence for this branch's commit.
- Local Docker CLI exists but its daemon is unavailable. A disposable PostgreSQL17 test was possible using an already installed local runtime. That is real local SQL evidence, **not hosted Supabase/PostgREST/RLS or application staging**.

A safe staging environment is technically feasible, but cannot be established within the current cost/access/deployment constraints. Creating it requires separate authorisation and exact configuration evidence, not copied production credentials or a renamed shared project.

## Required setup, before any application write

1. Approve any provisioning cost and explicitly permit the staging setup/deployment. Record the disposable project/branch, owner, lifetime, cleanup plan, tested SHA and exact URL. Use new scoped staging credentials and a new token pepper.
2. Use a data-less isolated instance, reviewed synthetic seed data and explicit graph/methodology activation for the exact tested build. Do not import production records, vault secrets, worker credentials or customer addresses. Confirm no production activation points at it.
3. Verify provider, webhook, queue, storage, worker and cron isolation. Payment must use the existing permitted non-chargeable double or approved sandbox. Email must terminate in a controlled sink with outbound egress blocked; an email `test` mode that can call Resend is insufficient. AI/generation must be explicitly non-chargeable/disabled, including OIDC routes.
4. Supply a redacted configuration/isolation attestation before creation, submission or provider tests. Do not lower runtime activation, access, payment-before-generation or private-delivery guards to make a test pass.

## Execution matrix

Use the full existing 21-row matrix and evidence manifest under `docs/experience-transformation/`, then add the assertions below. Every hosted row remains outstanding.

| Boundary | Exact staging verification required | Supporting local evidence |
|---|---|---|
| Creation/legal gates | Real profile/terms validation, consent versions, exactly one draft/token, invalid requests create nothing; Begin-to-usable timing separately sampled. | Existing consent/launch/security contracts. No legal acceptance submitted this run. |
| Save/resume | Persist numeric 0 and unknown, fresh-context resume, failed reply/retry and two-tab stale sequence; inspect saved sequence and current path. | Real browser HTTP fixture; no remote persistence claim. |
| Branching | Answer affected controls; cancel/confirm a gateway change; verify immutable invalidation history and actual score inputs. | Existing graph/score tests, transition coordinator. |
| Completion | Final response, explicit review/submit, locked initial run, duplicate/stale rejection, private Snapshot identity. | Existing scoring/submit contracts; no real submit. |
| Result recovery | POST with valid original resume token; consume allowance atomically; issue a normal private Snapshot token without revoking prior URLs; verify fresh-context access. Test invalid/expired/revoked/exhausted/wrong-assessment tokens, locked-run identity, pending/error and concurrency. | 69 service checks; disposable local SQL concurrency: 5 requests → 1 grant for final allowance; presentation fixture. Hosted API/PostgREST/RLS chain outstanding. |
| No replay | Before/after counts/checksums of locked score runs, reports/jobs and notifications across repeated recovery. Confirm only credential/audit mutations. | Service rejects any RPC except existing token consumption; local SQL score row unchanged. Real counters outstanding. |
| Database timing | Collect numeric Server-Timing access/load/commit/projection on actual state saves; p50/p95/worst over ≥30 samples per profile. Separate network, SQL and UI motion. | Synthetic HTTP timing only; local SQL is correctness evidence, not remote latency. |
| Payment | Correct prices/entitlements, negative/duplicate/out-of-order/wrong-amount callbacks, one confirmed test transition and no charge. | Catalogue/transaction regressions. No payment this run. |
| Report/delivery | Payment gate, one non-chargeable generation, retry/idempotency, private storage/access and delivery only to controlled sink; expired/wrong links denied. | Existing local contracts. No generation or customer communications this run. |
| Physical mobile | Actual320–430px devices/mobile Safari, touch selection, long questions, scrolling, keyboard, Back/recovery and sticky billing. Record device/OS/browser/network. | Viewport-based desktop Chromium tests only; no attached phone/device session. |
| Assistive technology | VoiceOver/Safari and NVDA/Firefox or agreed equivalent: names/meanings, announcements, focus, modal containment, review/recovery and OS reduced motion. | Browser keyboard, axe and native semantics only; no instrumented AT speech/session or physical device evidence. These tests remain outstanding. |

The earlier completed-result recovery defect is corrected locally in this branch. Its **staging acceptance remains open**. The unknown-response scoring-policy decision is independently open. Neither a fixture pass nor a healthy project name clears the production gate.
