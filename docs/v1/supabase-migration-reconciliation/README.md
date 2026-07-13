# Supabase migration reconciliation pack

Status: numeric migration repair ready for controller approval.

This pack documents the migration-chain blocker discovered during Phase 14 PR #21 Supabase branch creation. It does not change application behaviour, production schema, production data, feature flags, report generation, email delivery or automation.

## Scope lock

- PR: #21
- Branch: `phase14/autonomous-premium-report-engine`
- Current reconciliation evidence head: `2e96ed7d0ac21fb8d9aef892089829d5b335c9ed`
- Production Supabase project inspected read-only: `jvjxlphdyzerrhwcgkup`
- No production migration was applied.
- No production migration-history record was inserted, deleted or repaired.
- No Supabase branch or paid project was created in this pass.
- No Phase 14 automation flag was enabled.

## Controller decision

Retain the existing numeric migration versions:

```text
0001 0002 0003 0004 0005 0006 0007 0009 0010 ... 0019
```

Do not introduce a timestamped baseline. Do not squash the migrations at this stage.

The preferred production repair, after controller approval, is:

```bash
supabase link --project-ref jvjxlphdyzerrhwcgkup

supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 \
  --status applied

supabase migration list
```

Rollback preparation is:

```bash
supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 \
  --status reverted
```

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

## Clean-replay CI

The dedicated workflow is:

```text
.github/workflows/supabase-migration-replay.yml
```

It pins Supabase CLI `2.81.3`, starts a clean local Supabase database, replays all repository migrations and verifies schema, seed, RLS, grant and storage state.

Current-head evidence:

- GitHub Actions workflow: `Supabase Migration Replay`
- Run ID: `29286268503`
- Head SHA: `2e96ed7d0ac21fb8d9aef892089829d5b335c9ed`
- Result: success
- Evidence artifact: `supabase-migration-replay-evidence`
- Artifact ID: `8293313917`
- Artifact digest: `sha256:685461e065eabf88397e53a226a60675dd3bfe924bc63932e3321a2858c5da0c`

Passing steps:

- checkout;
- Node 24 setup;
- Supabase CLI `2.81.3` setup and version recording;
- expected migration file verification;
- full-statement repair artefact generation;
- empty local Supabase database start;
- local database reset and full migration replay;
- final local migration ledger capture;
- schema, seed, RLS, grant and storage assertions;
- local database lint;
- local database inspection capture;
- evidence artifact upload.

The workflow generates and uploads the controller-review-only full-statement repair artefact:

```text
tmp/migration-replay/numeric-migration-repair-full-statement-artifact.sql
```

The generator is:

```text
scripts/phase14-generate-numeric-repair-artifact.mjs
```

The generated SQL contains real parsed statements from `0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007` and `0009`. It contains no marker-only statement arrays and is not placed in the automatic migration directory.

## Replay compatibility correction

Clean replay exposed a Supabase CLI prepared-statement parsing failure in `0007_phase6_v1_1_atomic_scoring.sql` when the large `complete_score_run_atomic` function was followed by a seed insert and transaction commit. The migration was reordered so the settings seed commits before the large function and that function is the final statement in the file. The final schema and runtime function body remain equivalent for the intended empty-project replay path.

## Supporting artifacts

- `migration-inventory.md` records the inspected migration chain and production-history mapping.
- `controller-runbook.md` records the approved numeric repair process and rejected alternatives.
- `prepared-verification-and-repair.sql` records read-only checks, preferred CLI repair, rollback preparation and explicitly removes the marker-only fallback.
- `numeric-repair-rollback.md` records the metadata-only rollback procedure and read-only verification queries.

## Cleanup status correction

The stranded fulfilment for `MKORD-2026-1NMUW1N9` was already cancelled through a controller-approved cleanup. No workflow, report, generation or email records were created from that stranded fulfilment.

## Official Supabase references

Supabase documents that `db push` compares local migration files with records in `supabase_migrations.schema_migrations`, that `migration repair` updates migration-history metadata, and that squashing may omit DML seed data that must be manually restored. See the Supabase CLI migration guide linked from the runbook.
