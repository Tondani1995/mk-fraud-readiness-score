# Supabase migration reconciliation pack

Status: prepared for controller review only.

This pack documents the migration-chain blocker discovered during Phase 14 PR #21 Supabase branch creation. It does not change application behaviour, schema, production data, feature flags, report generation, email delivery or automation.

## Scope lock

- PR: #21
- Branch: `phase14/autonomous-premium-report-engine`
- Starting head inspected: `b3735f980827c8c1685431e61c9a4cc7bb0f7742`
- Production Supabase project inspected read-only: `jvjxlphdyzerrhwcgkup`
- No production migration was applied.
- No production migration-history record was inserted, deleted or repaired.
- No Supabase branch or paid project was created in this pass.
- No Phase 14 automation flag was enabled.

## Problem confirmed

A Supabase development branch named `phase14-uat` was created outside this pass and then deleted after migration replay failed. The branch replay reached an empty `public` schema because production migration history starts at timestamped Phase 9 records while the repository contains earlier foundational migrations that are not represented in `supabase_migrations.schema_migrations`.

Read-only production checks confirmed:

- `supabase_migrations.schema_migrations` columns are `version`, `statements`, `name`, `created_by`, `idempotency_key` and `rollback`.
- Production migration history starts at `20260708181207` / `0010_phase9_manual_eft_order_flow`.
- Production public schema contains the foundational tables expected from repository migrations `0001` through `0009`, including methodology, assessment, scoring, order, report, event, email and rate-limit tables.
- Production storage has private bucket `generated-reports`.

## Important discrepancy

The controller note stated there was no confirmed `0004`. The current PR branch contains `supabase/migrations/0004_phase4_v1_2_rate_limiting.sql`, verified by GitHub file fetch on branch `phase14/autonomous-premium-report-engine`.

There is still no confirmed `0008` migration in the inspected repository migration chain.

## Recommended posture

Do not create another Supabase branch until the controller approves a migration-ledger reconciliation plan.

The smallest safe path is:

1. Keep repository SQL files unchanged for this pass.
2. Treat this pack as a controller-review baseline.
3. Confirm whether production schema is already equivalent to the repository foundation through a schema diff in a disposable environment.
4. If equivalent, repair migration history metadata using Supabase-supported migration repair semantics rather than direct production DDL.
5. Recreate the disposable Supabase branch only after the ledger and repository chain agree.

## Supporting artifacts

- `migration-inventory.md` records the inspected migration chain and production-history mapping.
- `controller-runbook.md` records the proposed controller process and rejected alternatives.
- `prepared-verification-and-repair.sql` records read-only checks and an emergency SQL template that must not be run without explicit controller approval.

## Official Supabase references

Supabase documents that `db push` compares local migration files with records in `supabase_migrations.schema_migrations`, that `migration repair` updates migration-history metadata, and that squashing may omit DML seed data that must be manually restored. See the Supabase CLI migration guide linked from the runbook.