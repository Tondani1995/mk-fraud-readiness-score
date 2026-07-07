# Schema Contract

This file records the Phase 2 v1.1 SQL enum contract that the Phase 3 scaffold must mirror before Phase 4 begins.

The frontend types in `src/lib/types/domain.ts` must match the approved Supabase enum values. Do not rename statuses for readability in the application layer. Friendly labels may be derived for UI display, but database values and TypeScript union values must stay aligned with this contract.

## Admin roles

```ts
type AdminRole =
  | 'platform_admin'
  | 'reviewer'
  | 'approver'
  | 'finance_admin'
  | 'read_only_admin';
```

## Assessment statuses

```ts
type AssessmentStatus =
  | 'draft'
  | 'submitted'
  | 'scored'
  | 'snapshot_available'
  | 'report_requested'
  | 'under_review'
  | 'closed'
  | 'voided';
```

## Order statuses

```ts
type OrderStatus =
  | 'created'
  | 'awaiting_payment'
  | 'proof_uploaded'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'cancelled'
  | 'refunded';
```

## Report statuses

```ts
type ReportStatus =
  | 'draft'
  | 'generated'
  | 'under_review'
  | 'approved'
  | 'released'
  | 'superseded'
  | 'voided';
```

## Other Phase 2 enum values mirrored in TypeScript

```ts
type UserStatus = 'active' | 'suspended' | 'invited' | 'revoked';
type AssessmentTokenType = 'resume' | 'snapshot' | 'report_request';
type MethodologyStatus = 'draft' | 'approved' | 'active' | 'retired';
type ScoreRunType = 'initial' | 'admin_recalc' | 'correction_recalc' | 'test_fixture';
type ScoreRunStatus = 'draft' | 'completed' | 'voided';
type MaturityBand = 'Reactive' | 'Developing' | 'Structured' | 'Strategic';
type ExposureBand = 'Low' | 'Moderate' | 'High' | 'Severe';
type PaymentProofStatus = 'uploaded' | 'accepted' | 'rejected' | 'superseded';
type ReportType = 'free_snapshot' | 'essential_self_assessment' | 'mk_validated';
type ReportTemplateStatus = 'draft' | 'active' | 'retired';
type ContentStatus = 'draft' | 'active' | 'retired';
type AuditActorType = 'admin' | 'respondent_token' | 'system';
```

## Disallowed legacy scaffold values

The following values were removed in Phase 3 v1.1 because they did not match the approved Phase 2 SQL contract:

- `read_only`
- `snapshot_generated`
- `paid_report_requested`
- `under_mk_review`
- `report_released`
- `verification_pending`
- `reviewed`

If one of these appears in code or documentation again, the smoke check should fail.


## Phase 5 assessment-engine contract

Phase 5 may write only to respondent/assessment collection tables:

- `assessment_answers`
- `exposure_answers`
- `assessments` status update to `submitted`
- `assessment_tokens` revocation after final submission
- `audit_logs`

Phase 5 must not write to:

- `score_runs`
- `score_domain_results`
- `score_question_traces`
- `maturity_cap_events`
- `reports`
- `orders`

A submitted assessment must remain locked for respondent-token editing. Scoring begins only in Phase 6 after the Phase 1 technical scoring test matrix is applied.

## Phase 6 scoring contract additions

The approved Phase 6 scoring layer uses the Phase 2 enum contract without renaming statuses.

Scoring may only create completed score runs for assessments that are at least `submitted`. A successful score changes the assessment to `scored` and sets `current_score_run_id` to a completed score run. Completed score runs and their traces are immutable. Recalculation must create a new score run, not overwrite an old one.

The frontend must not infer or recalculate scores client-side. Client-facing display in Phase 7 must read from stored `score_runs`, `score_domain_results`, `score_question_traces` and `maturity_cap_events` records.
