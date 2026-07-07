# Supabase Dev Setup - Phase 5 v1.1

Phase 5 adds the assessment engine on top of the approved Phase 4 v1.1 accountless respondent flow. Phase 5 v1.1 adds the approval-grade guardrails required before scoring can begin.

Run these migrations in this order in a Supabase **development** project only:

1. `supabase/migrations/0001_phase2_v1_1_schema_rls.sql`
2. `supabase/migrations/0002_phase4_dev_seed.sql`
3. `supabase/migrations/0003_phase5_methodology_seed.sql`
4. `supabase/migrations/0005_phase5_v1_1_guards.sql`

Then bootstrap the first MK admin user using:

- `supabase/admin-bootstrap-template.sql`

## What the Phase 5 seed and guard migration add

The Phase 5 methodology seed populates the approved V1 methodology:

- 6 response-scale options from 0 to 5.
- 10 domains.
- 68 assessment questions.
- 11 conditional N/A questions.
- 19 critical controls.
- 17 hard-gate controls.
- 8 exposure factors with banded input options.
- Recommendation-trigger shells for later report logic.

The Phase 5 v1.1 guard migration adds:

- database-side prevention of answer/exposure changes after submission or lock;
- database-side prevention of answering questions from the wrong methodology version;
- profile-derived N/A enforcement;
- hard-gate N/A protection;
- methodology immutability once a methodology version has been used by an assessment.

It does **not** calculate scores, create score runs, generate snapshots, create paid reports, or create PDF reports.

## Local run

```bash
npm install
npm run phase5:smoke
npm run dev
```

Then test:

1. Start an assessment at `/start`.
2. Use the generated resume link.
3. Complete the exposure profile.
4. Move through all 10 domains.
5. Confirm answers autosave.
6. Close and reopen the resume link.
7. Confirm saved answers reload.
8. Try N/A on a question where it is not allowed; it should not be offered in the UI and the API/database should reject it if forced.
9. Use N/A on a conditional question only where the exposure profile makes it genuinely inapplicable.
10. Confirm hard-gate N/A is blocked unless the system-derived profile rule allows it.
11. Submit the assessment.
12. Try reopening the same resume link; it should be rejected because the assessment is locked.
13. Try updating answers directly in Supabase after submission; the trigger should reject it.
14. Confirm `score_runs` remains empty.

## Critical warnings

- Do not run these migrations in production yet.
- Do not add scoring logic in Phase 5.
- Do not change methodology values casually; Phase 1 is the methodology source.
- Do not rerun methodology updates after real assessments exist unless the intent is to confirm immutability protection.
- Do not expose the service role key in the browser.
- Respondent save/submit actions must continue to go through server routes after token validation.

Use `docs/PHASE_5_V1_1_TEST_MATRIX.md` before approving Phase 5.
