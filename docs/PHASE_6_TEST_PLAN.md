# Phase 6 v1.1 Test Plan

## Static/local tests

Run:

```bash
npm run phase6:smoke
```

This runs:

```bash
node scripts/phase6-scenario-tests.mjs
node scripts/phase6-engine-direct-tests.mjs
```

The first test confirms the methodology seed reconciles independently. The second test calls the actual production scoring function `calculateFraudReadinessScore()` directly and validates TS-01, TS-02, TS-03, repeatability and incomplete-coverage blocking.

## Required scenario outcomes

| Scenario | Required outcome |
|---|---|
| TS-01 Low readiness | Score 20, Reactive, Severe exposure, 19 critical gaps, 17 major gaps |
| TS-02 Moderate | Score 60, Structured, High exposure, no critical gaps |
| TS-03 Strong with response failure | Score 82, calculated Strategic, final Developing after cap, High exposure |
| Incomplete coverage | No score issued; status incomplete |

## Supabase dev tests before approval

After running migrations `0001` to `0006` in a Supabase development project:

1. Start an accountless assessment through `/start`.
2. Complete all exposure factors and all 68 questions.
3. Submit the assessment.
4. Confirm the assessment status is `submitted` and locked.
5. Log in as an active MK admin.
6. Call the admin scoring endpoint.
7. Confirm the assessment status becomes `scored`.
8. Confirm exactly one completed score run exists.
9. Confirm exactly 10 `score_domain_results` rows exist for the run.
10. Confirm exactly 68 `score_question_traces` rows exist for the run.
11. Confirm maturity cap rows exist where the fixture requires them.
12. Confirm `current_score_run_id` points to the completed run.
13. Run the same scoring request again as `initial` and confirm it is blocked if a current score already exists.
14. Try changing a completed score trace and confirm the database rejects it.
15. Try inserting a trace for a question outside the methodology version and confirm the database rejects it.
16. Try inserting a trace with an answer from another assessment and confirm the database rejects it.

## Approval rule

Phase 6 may not be approved for Phase 7 until local static tests and Supabase dev tests pass.
