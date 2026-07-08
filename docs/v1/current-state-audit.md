# MK Fraud Readiness Score V1 - Current State Audit

Date: 2026-07-08  
Branch: `v1/current-state-audit`  
Repository: `Tondani1995/mk-fraud-readiness-score`  
Audit mode: GitHub connector inspection only. No local checkout, database access, browser run, Vercel run or automated test execution was performed in this audit task.

## 1. Control position

This audit confirms the repository is a partially built V1 runtime foundation, not a completed launch product. The package identifies itself as `mk-fraud-readiness-score-v1` at version `0.6.2-consolidated-phase0-6-v1.3`, with the package description stating that it consolidates Phase 0-4, Phase 5 assessment engine and Phase 6 deterministic scoring work.

The active Next.js configuration uses `basePath: '/score'`, which aligns with the current route decision that the application is served under the MK website path `/score/*` rather than a separate score subdomain.

The immediate next product phase remains Phase 7 Free Snapshot, but the safest next build action is not to redesign Phase 7 from scratch. It is to harden and prove the existing start-to-submit-to-score-to-snapshot path through fixtures, persisted result checks, state safety and a formal Phase 7 exit card.

## 2. Files inspected

The following repository files were inspected during this audit:

- `package.json`
- `next.config.mjs`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/start/page.tsx`
- `src/components/assessment/StartAssessmentForm.tsx`
- `src/app/api/assessments/start/route.ts`
- `src/lib/respondent/start-assessment.ts`
- `src/app/assessment/[assessmentRef]/page.tsx`
- `src/components/assessment/AssessmentEngine.tsx`
- `src/app/api/assessments/[assessmentRef]/answers/route.ts`
- `src/lib/respondent/assessment-save.ts`
- `src/app/api/assessments/[assessmentRef]/submit/route.ts`
- `src/lib/scoring/score-assessment.ts`
- `src/lib/scoring/scoring-engine.ts`
- `src/lib/snapshot/free-snapshot.ts`
- `src/components/assessment/FreeSnapshot.tsx`
- `src/app/api/assessments/[assessmentRef]/report-request/route.ts`
- `src/app/admin/page.tsx`
- `src/lib/auth/admin-route.ts`
- `src/app/api/health/route.ts`
- `scripts/phase6-scenario-tests.mjs`

A previously committed temporary route, `src/app/api/qa/full-flow-check/route.ts`, was seen in commit history but is not present on the current default branch. That route had implemented a full start-to-score UAT check and was later removed.

## 3. Existing routes and observed behaviour

### Public / respondent routes

| Route | Current behaviour | Audit view |
|---|---|---|
| `/` | Redirects to `/start`. Under the `/score` base path this becomes the score app root redirecting to start. | Present and simple. |
| `/start` | Renders the assessment start screen. Supports `?embed=1` to remove broader framing and fit inside the MK website journey. | Present. |
| `/api/assessments/start` | Accepts respondent and organisation details, validates payload, applies rate limits and calls `startAccountlessAssessment`. | Present. |
| `/assessment/[assessmentRef]` | Requires a private resume token. Loads methodology, saved answers, progress and renders `AssessmentEngine`. | Present. |
| `/api/assessments/[assessmentRef]/answers` | Saves draft answers and exposure answers through `saveAssessmentDraft`. | Present. |
| `/api/assessments/[assessmentRef]/submit` | Submits the assessment, runs scoring, loads the free snapshot and returns snapshot data in the submit response. | Present. |
| `/api/assessments/[assessmentRef]/report-request` | Allows detailed report request after snapshot/scoring state. Writes to `data_requests`, updates assessment status to `report_requested`, queues an email event and writes an audit log. | Present but not the final Phase 9 EFT/order state machine. |
| `/api/health` | Returns `{ ok: true, service: 'mk-fraud-readiness-score-v1', phase: 'phase-6-consolidated-scoring' }`. | Present; proves service label only, not product readiness. |

### Admin routes

| Route | Current behaviour | Audit view |
|---|---|---|
| `/admin` | Requires admin role, shows high-level dashboard counts for assessments, orders and reports. | Present, but this is a limited Phase 4/early admin surface, not the Phase 8 Admin Console. |
| `/admin/login` | Not inspected in this audit. | Must be inspected in Phase 8/current-state follow-up. |
| `/admin/assessments` | Not confirmed during this audit. | Required for Phase 8. |
| `/admin/assessments/[id]` | Not confirmed during this audit. | Required for Phase 8. |
| `/admin/config/*` | Not confirmed during this audit. | Required for Phase 8 if not already present. |
| `/admin/audit-log` | Not confirmed during this audit. | Required for Phase 8 if not already present. |

## 4. Current `/score` base path behaviour

`next.config.mjs` sets `basePath: '/score'`. The start endpoint constructs MK-domain continuation links by inspecting forwarded host/protocol and returning a base URL that ends in `/score`. This aligns with the handoff decision to run the assessment application under `https://www.mkfraud.co.za/score/*`.

The start form preserves embedded mode by carrying `embed=1` into the resume URL when the start page itself was opened in embedded mode. However, the assessment page currently accepts only `token` in its typed `searchParams`, while the client-side `keepEmbedded` helper appends `embed=1`. This may not break behaviour, but Phase 7 should confirm whether the embedded journey remains visually clean after moving from `/start?embed=1` into `/assessment/[assessmentRef]?token=...&embed=1`.

## 5. Assessment start, resume, answer-save, submit and result flow

### Start flow

`StartAssessmentForm` collects respondent and organisation details, then posts to `/api/assessments/start`. The start API validates input, checks IP/email rate limits and calls `startAccountlessAssessment`.

`startAccountlessAssessment` does the following:

- Looks up the active methodology version.
- Inserts `organisations`.
- Inserts `respondents`.
- Inserts a draft `assessments` row with a generated `assessment_reference`.
- Creates a resume token using `assessment_tokens` with token type `resume`.
- Creates a resume URL in the form `/assessment/[assessment_reference]?token=[rawToken]`.
- Inserts audit and placeholder email-event rows.
- Returns reference, IDs, respondent email and resume expiry.

### Resume/token flow

`/assessment/[assessmentRef]` requires a token. It uses `validateResumeToken`, which hashes the raw token, looks up a `resume` token, checks revocation, expiry and max-use, confirms the assessment reference, and refuses non-draft or locked assessments. This is consistent with the accountless respondent model.

A notable implementation detail is that most current calls set `consume: false`, including page load, answer save and submit. That means token `use_count` may not increase during normal respondent use. Phase 7/11 should decide whether this is intentional V1 behaviour or a security-control gap.

### Answer save

`saveAssessmentDraft` validates 0-5 responses, controlled N/A and exposure selections. It rejects invalid N/A, invalid response values, unknown questions and mismatched exposure-option points. It upserts `assessment_answers`, upserts `exposure_answers`, recalculates progress and inserts an audit-log event.

The save path blocks mutations when the assessment is not draft, locked or already submitted.

### Submit

`submitAssessment` validates the resume token, reloads methodology and saved answers, checks all exposure factors and all domain questions, validates N/A reasons and then updates the assessment to `submitted`, setting `submitted_at` and `locked_at`. It also revokes active resume tokens and inserts an audit log.

`/api/assessments/[assessmentRef]/submit` then immediately calls `scoreSubmittedAssessment`, loads the free snapshot and returns it to the client. `AssessmentEngine` renders the returned snapshot in `FreeSnapshotCard` after successful submission.

### Result / snapshot flow

There is a free snapshot component and a `loadFreeSnapshotByReference` server helper that reads persisted `score_runs` and `score_domain_results`. The snapshot currently appears to be shown immediately from the submit response in the client state. A durable standalone snapshot route using a snapshot token was not confirmed during this audit, although `validateSnapshotToken` exists.

This is the most important Phase 7 gap: the immediate free snapshot exists, but Phase 7 still needs proof that the snapshot can be safely reloaded/refreshed through a token-scoped route without recalculation drift or cross-assessment access.

## 6. Supabase migrations, tables, seed data and storage assumptions

The audit could not list the full Supabase migration directory through the connector. However, inspected code references the following database objects:

- `methodology_versions`
- `organisations`
- `respondents`
- `assessments`
- `assessment_tokens`
- `assessment_answers`
- `exposure_answers`
- `audit_logs`
- `email_events`
- `domains`
- `questions`
- `exposure_factors`
- `score_runs`
- `score_domain_results`
- `score_question_traces`
- `data_requests`
- `admin_profiles`

The Phase 6 scenario test script reads `supabase/migrations/0003_phase5_methodology_seed.sql`, which indicates that the methodology seed file exists in the repo even though it was not directly fetched during this connector audit.

Storage buckets for payment proofs and generated reports were not confirmed in code during this audit. Phase 9 and Phase 10 must inspect Supabase storage code/policies before implementation.

## 7. Current scoring functions and score trace persistence

The scoring implementation is materially present.

`calculateFraudReadinessScore` calculates:

- Question-level normalised scores.
- N/A exclusion from numerator and denominator.
- Domain raw scores.
- Domain weighted contributions.
- Assessment coverage.
- N/A rate.
- Exposure score and exposure band.
- Critical gaps and major hard-gate gaps.
- Maturity bands.
- Maturity-cap events.

`scoreSubmittedAssessment` loads a submitted/scored assessment, loads methodology and saved answers, calculates the score, builds an input hash, then persists through the Supabase RPC `complete_score_run_atomic`.

The atomic persistence payload includes:

- Score-run summary.
- Domain results.
- Question traces.
- Maturity cap events.

This is stronger than a simple UI-calculated score, but Phase 7 must still prove the persisted `score_runs`, `score_domain_results` and `score_question_traces` reconcile to the UI snapshot and fixtures.

## 8. Current snapshot/result components

`FreeSnapshotCard` displays:

- Organisation name.
- Assessment reference.
- Final maturity.
- Readiness score.
- Exposure score and exposure band.
- Critical gaps and major gaps.
- Coverage and N/A rate.
- Maturity cap notice where applicable.
- Strongest domains.
- Priority domains.
- A short explanation of what the snapshot means.
- A CTA to request the paid detailed report.

The content boundary is broadly aligned with Phase 7: it does not show full 30/60/90 recommendations, public benchmarks or AI-generated recommendations. The CTA currently creates a basic detailed report request through `data_requests`; it does not yet implement the Phase 9 order reference, EFT instructions, proof upload or admin verification state machine.

## 9. Current admin routes and access control status

A minimal `/admin` route exists and calls `requireAdmin` with several roles. `requireAdmin` reads a Supabase access token from cookies, uses the anon Supabase client to get the user, then uses the service client to check `admin_profiles` for an active profile. Non-admin or inactive users are redirected to login.

This is a useful foundation but not the Phase 8 admin console. The required Phase 8 screens still need to be confirmed or built: assessment list, assessment detail, answer trace, score trace, product/pricing config, EFT settings, report content blocks and audit log.

## 10. EFT/order/payment-proof code status

A basic detailed report request endpoint exists. It records a `data_requests` row with `request_type = 'detailed_report_request'`, sets assessment status to `report_requested`, creates a placeholder email event and writes an audit-log entry.

This is not the Phase 9 commercial flow. The following were not confirmed:

- Unique human-friendly order reference.
- Order state machine.
- EFT instruction display from admin config.
- Proof-of-payment upload.
- Private proof storage.
- Admin verification/rejection.
- Payment-state audit trail.
- Server-side block preventing report generation before verified payment.

## 11. PDF/report code status

No PDF generation implementation was confirmed in this audit. Phase 10 remains open.

Required Phase 10 items still open:

- Server-generated PDF route/service.
- Report template.
- Report version record.
- Private report storage.
- Admin generate/regenerate control.
- Audit trail for report generation.
- Proof that PDF values match persisted score trace.

## 12. Current test coverage and missing test areas

`package.json` defines these scripts:

- `phase3:smoke`
- `phase4:smoke`
- `phase5:smoke`
- `phase6:test-scenarios`
- `phase6:smoke`
- `phase6:test-engine`
- `build`
- `typecheck`
- `lint`

The Phase 6 scenario script defines three important deterministic scenarios:

- TS-01 weak readiness scenario.
- TS-02 moderate readiness scenario.
- TS-03 strong-with-critical-gap scenario.

The connector audit did not run these scripts. Phase 7 must run or reproduce them in the implementation PR, then add/confirm tests that map persisted score results to snapshot UI values.

Missing or unproven test areas:

- Full respondent browser journey from `/score/start?embed=1` to submission.
- Snapshot refresh/reload using a token-scoped route.
- Repeated submit click safety.
- Back-button stale-state safety.
- Cross-assessment snapshot access protection.
- RLS isolation.
- Admin route protection beyond code inspection.
- Payment gating.
- Private payment-proof storage.
- Private report storage.
- PDF versioning.

## 13. Known risks against the control plan

1. The product has an immediate in-session snapshot, but no confirmed durable snapshot route. This can cause a gap between “submitted and saw result” and “can safely reopen free snapshot later.”
2. `validateSnapshotToken` exists, but a route using it was not confirmed.
3. Normal resume-token validation is usually called with `consume: false`, which may leave token use-count controls untested or ineffective in ordinary use.
4. A basic report request exists earlier than Phase 9, but it is not the manual EFT order flow required by V1.
5. Admin foundation exists, but Phase 8 operational screens are not confirmed.
6. Score trace persistence appears strong, but actual fixture-to-database-to-snapshot reconciliation has not been evidenced in this audit.
7. RLS/security cannot be concluded from code inspection alone because the full migration and policy set was not inspected.
8. The temporary full-flow UAT endpoint was removed, which is good for production hygiene, but its removal means Phase 7 needs another controlled proof mechanism.

## 14. Recommended next branch and next smallest deliverable

Recommended next branch: `v1/phase-7-free-snapshot`

Recommended next smallest deliverable:

Create and prove the Phase 7 Free Snapshot gate by hardening the current start-to-submit-to-score-to-snapshot flow. This should include:

1. Inspect and confirm whether a token-scoped snapshot route exists. If not, add the smallest route needed.
2. Ensure submit creates a snapshot token or otherwise provides a private reopen mechanism.
3. Ensure the snapshot reads persisted `score_runs` and `score_domain_results`, not client recalculation.
4. Add or update tests for TS-01, TS-02 and TS-03 against the actual scoring engine and persisted snapshot mapping.
5. Add tests for repeated submit, stale resume token after submit and snapshot cross-access protection.
6. Create `docs/v1/phase-exit-cards/phase-07-free-snapshot.md`.

## 15. Strict phase conclusion

Gate result: current-state audit complete, with limitations.

Phase 7 can begin safely, but only as a hardening/proof phase. The existing code already contains much of the Phase 7 user flow, so the next PR should not rebuild the assessment engine. It should prove and close the gaps around durable snapshot access, persisted score reconciliation, repeated-submit safety, fixture evidence and phase exit documentation.

Do not proceed to Phase 8 Admin Console, Phase 9 EFT Order Flow or Phase 10 PDF Report Engine until Phase 7 has a passed or explicitly approved conditional exit card.
