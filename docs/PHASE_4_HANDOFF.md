# Phase 4 Handoff: Admin Auth, Resume Tokens and Organisation Setup

Phase 4 must implement identity and access foundations before client data and assessment answers are stored.

## Phase 4 must build

- Supabase admin authentication for MK users only.
- Admin role model: platform_admin, reviewer, approver, finance_admin and read_only_admin.
- Accountless respondent start-assessment flow.
- Server-generated assessment reference.
- Server-generated resume token stored only as a hash.
- Secure resume link dispatch through email.
- Organisation profile persistence.
- Route protection for all `/admin/*` routes.
- Server-route protection for all respondent-token actions.

## Phase 4 must not build

- Full assessment engine.
- Scoring engine.
- PDF report generation.
- EFT verification workflow.
- Client dashboard.
- Respondent password accounts.

## Phase 4 hard gate

No assessment answers may be stored until admin role separation, assessment references and resume-token security are working.


## Schema-contract guardrail

Phase 4 must use the enum and status values recorded in `docs/SCHEMA_CONTRACT.md` and mirrored in `src/lib/types/domain.ts`. Do not introduce alternate labels such as `read_only`, `snapshot_generated`, `paid_report_requested`, `under_mk_review`, `report_released`, `verification_pending` or `reviewed` unless the approved Phase 2 SQL contract is formally amended.
