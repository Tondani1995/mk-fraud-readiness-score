# Release and Rollback Runbook

Closes `00-current-state.md` §15 ("Release and rollback process... carried forward as an explicit
task for Release D"). This is the first release/rollback process documentation this repository has
had. It describes the integrated A-D release-candidate event this whole safe-launch programme has
been building toward, not a process that has run yet — every step below is a plan, not a completed
action, and this document does not itself perform any of them.

## 1. Stacked-PR integration order

The four releases are stacked in dependency order and must integrate in that same order —
Release C's migrations assume Release B's schema exists; Release D's assume Release C's:

1. #41 (Release A, backlog reconciliation) → base `docs/safe-launch-discovery`
2. #42 (Release B, durable fulfilment) → base `release-a/backlog-reconciliation`
3. #43 (Release C, email/secure delivery) → base `release-b/durable-fulfilment`
4. #44 (Release D, operational readiness) → base `release-c/email-secure-delivery`

Merging out of order, or merging any one without the others, produces a branch whose migrations
don't form a valid sequence — do not do this. The integration event is: merge all four, in order,
into one new `release-candidate/a-d-integration` branch (not directly into `main` — see §2).

## 2. Release-candidate branch creation

1. Create `release-candidate/a-d-integration` from `main`.
2. Merge #41, then #42, then #43, then #44 into it, resolving any conflicts as they arise (expected
   to be minimal — each PR was built additively against its own base, but a merge is not the same
   operation as the stacked diffs each PR shows individually, so conflicts are possible and must be
   resolved by re-reading the conflicting migration/RPC bodies, not by mechanically picking a side).
3. Run the full verification suite (§4 below, "Smoke tests") against this branch's own disposable
   local Postgres replay before treating it as a real release candidate.
4. Only after that passes does this branch become the subject of the cloud-certification event this
   whole document exists to make safe.

## 3. Pre-deployment backup and preflight

Before any migration touches `jvjxlphdyzerrhwcgkup` (or whichever Supabase branch is used per
`19-release-c-cloud-schema-reconciliation.md`'s Option A/B mechanics):

1. Confirm Point-in-Time Recovery (PITR) is enabled on the target Supabase project, and note the
   current PITR window. If PITR is not available (project tier dependent), take an explicit manual
   backup/export first and confirm it completed before proceeding.
2. Confirm exactly which commit is currently deployed to Production (Vercel dashboard → Production
   deployment → commit SHA) and record it — this is the rollback target if anything needs to revert
   (§7).
3. Confirm no other migration or schema change is in flight against the same project from any other
   source.
4. Re-run this repo's own read-only schema audit (the same queries `19-release-c-cloud-schema-reconciliation.md`
   used) immediately before migrating, not from memory — schema state can change between when a
   document is written and when the migration actually runs.

## 4. Migration order and smoke tests

1. Apply migrations in the exact order they appear in `supabase/migrations/`, starting from
   whichever migration `list_migrations` shows as the current tip (per the last reconciliation
   audit, `20260721150808`) through Release D's own final migration.
2. After each release's migration block (A, then B, then C, then D), re-run that release's own
   local disposable-Postgres test suite against the *cloud* connection string instead of a local
   replica, to confirm cloud state matches what local replay already proved.
3. Full production build against the release-candidate branch.
4. All 6 required GitHub workflows green on the release-candidate branch's own final head — not
   inferred from any individual release PR's own CI history.

## 5. Vercel deployment

1. Point Preview (or a dedicated release-candidate Preview alias) at
   `release-candidate/a-d-integration`.
2. Redeploy so the new environment variables (if any changed) and the new code are both live
   together — a code-only redeploy does not pick up env var changes made after the last build, and
   vice versa; confirm both explicitly.
3. Confirm the new deployment's `READY` state and that its branch alias resolves to it before
   proceeding.

## 6. Provider tests (external-provider certification)

Run the controlled Resend verification cycle this programme has already built and partially
exercised (`18-controlled-resend-preview-verification.md`), now against a cloud schema that
actually has Release C's tables/RPCs:

1. Provision `provider_webhook_db_hmac` / `provider_lookup_db_hmac` via the Release D-independent
   Release C admin control (`/score/admin/phase14-activation`), now operational because the cloud
   schema finally matches what it expects.
2. Trigger all four message types with synthetic data, exactly as the prior controlled-send cycle
   did for messages 1 and 2.
3. Confirm a real, signed webhook returns HTTP 200 and a `phase14_provider_attestations` row is
   persisted and correlated — the specific proof every prior cycle was blocked on.
4. Confirm the new `/score/admin/operational-alerts` page renders anything genuinely emitted during
   this test cycle (e.g. a deliberately-triggered `provider_event_payload_conflict` via a signed
   synthetic replay, matching the adverse-event testing already specified in
   `18-controlled-resend-preview-verification.md`).

## 7. Rollback decision criteria

Roll back if, after the migration and deployment above:

- Any of the 18 (or however many by then) existing `payment_received` orders shows an unexpected
  state change not explained by an intentional admin action.
- A required GitHub workflow that was green on the release-candidate branch's own pre-deployment
  head fails when re-run post-deployment against the now-live schema.
- The controlled provider test (§6) cannot achieve a genuine HTTP 200 + persisted attestation within
  a bounded, pre-agreed retry window.
- Any Production-serving request (not Preview) is observed to error as a result of the deployment.

Do not roll back for: a Preview-only issue with no Production impact (fix forward on the
release-candidate branch instead); a documentation inaccuracy discovered post-deployment (correct
the doc, not the deployment).

## 8. Vercel rollback

1. Vercel dashboard → Production deployments → select the commit recorded in §3.2 → "Promote to
   Production" (or the equivalent instant-rollback action for the plan tier in use).
2. Confirm the rolled-back deployment is `READY` and serving before considering this step complete.
3. This step alone does not undo any database change — see §9.

## 9. Forward-only database repair

**Never edit or revert an already-applied migration file.** If a migration needs to be undone:

1. Write a new migration that reverses the specific change (e.g. `drop column if exists`, restore a
   prior function body).
2. For a function body specifically: restore it via a new `create or replace function` containing
   the *exact* prior body — captured before the original migration ran (see §3.4's live audit, or
   `pg_get_functiondef` run immediately before migrating, as `19-release-c-cloud-schema-reconciliation.md`
   did for `record_payment_transition` as a worked example of capturing a prior body before
   changing it).
3. If PITR is available and the issue is caught quickly, a PITR restore to immediately before the
   migration may be faster and safer than a forward-only repair migration — but this reverts *all*
   database changes since that point, including any real customer activity in that window, so it is
   the more disruptive option and should only be used when a forward-only repair genuinely cannot
   undo the damage.

## 10. Secret and webhook rollback

Mirrors the controller's own Preview-rollback instruction from the Release C cycle, generalised:

1. Set `MK_EMAIL_PROVIDER_MODE=disabled` and redeploy.
2. Temporarily disable (never delete, never rotate the signing secret for) the Resend webhook
   pointed at whatever environment is being rolled back.
3. Do not rotate `provider_webhook_db_hmac`/`provider_lookup_db_hmac` as part of a rollback unless
   there is a specific reason to believe the secret itself was compromised — rotating it
   unnecessarily invalidates in-flight webhook verification for events already accepted by the
   provider before the rollback.

## 11. Incident communication

If a rollback is triggered by anything customer-visible: state plainly what happened, what was
rolled back, and what (if anything) customers need to do — never understate scope to make a status
update look better, matching this whole programme's evidentiary discipline. Internal-only issues
(caught before any customer-visible effect) do not require external communication, only evidence
capture (§12).

## 12. Evidence capture

For every release-candidate deployment attempt, successful or rolled back: record the exact
migration set applied, the exact commit deployed, the pre- and post-deployment schema-audit results,
the provider-test outcome, and (if rolled back) the rollback trigger and the exact steps taken, in
`09-release-evidence.md`. This document's own §7-10 exist so that record can point at a named
procedure rather than re-deriving one under pressure.

## 13. Post-release review

After a successful integrated release candidate reaches Production (or after a rollback, either
way): review whether this runbook's steps matched what actually happened, and correct this document
if they didn't — a runbook that silently drifts from reality is worse than no runbook, since it
creates false confidence the next time it's needed.

## Cross-references

- Release D scope: `20-release-d-scope-and-existing-infrastructure-audit.md`
- Go-live checklist: `21-go-live-checklist.md`
- Vercel operational inventory: `23-vercel-operational-inventory.md`
- Cloud-schema reconciliation and Option A/B/C mechanics: `19-release-c-cloud-schema-reconciliation.md`
- Controlled Resend verification procedure: `18-controlled-resend-preview-verification.md`
