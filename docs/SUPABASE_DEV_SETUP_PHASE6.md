# Supabase Dev Setup - Phase 6 v1.1

## Migration order

Run in Supabase development only:

1. `0001_phase2_v1_1_schema_rls.sql`
2. `0002_phase4_dev_seed.sql`
3. `0003_phase5_methodology_seed.sql`
4. `0005_phase5_v1_1_guards.sql`
5. `0006_phase6_scoring_guards.sql`
6. `0007_phase6_v1_1_atomic_scoring.sql`

Do not run these against production yet.

## What migration 0006 adds

Migration `0007_phase6_v1_1_atomic_scoring.sql` adds:

- `complete_score_run_atomic` RPC;
- score trace identity guard triggers;
- methodology/assessment trace consistency checks;
- atomic score-run completion;
- atomic assessment status update to `scored`;
- atomic audit log insertion;
- app-setting marker for Phase 6 v1.1.

## Admin scoring endpoint

The admin scoring endpoint must remain admin-only. Respondents must not trigger scoring.

Endpoint:

`POST /api/admin/assessments/[assessmentRef]/score`

Expected behaviour:

- draft assessment rejected;
- submitted assessment scored;
- initial scoring blocked if a current score already exists;
- returned run id and run number come from the atomic RPC.
