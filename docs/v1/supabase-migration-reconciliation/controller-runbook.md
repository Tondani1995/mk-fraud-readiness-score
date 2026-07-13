# Controller runbook - numeric migration-chain reconciliation

Status: ready for controller approval only. Do not execute against production without explicit controller approval.

## Goal

Make the MK Fraud Readiness Score Supabase migration chain reproducible for:

- a clean empty Supabase project;
- a Supabase development branch created from the production project;
- future controller review of Phase 14 isolated UAT.

This runbook intentionally avoids product changes, scoring changes, report-generation changes, customer email, automation flags and production schema changes.

## Controller decision

The approved versioning strategy is to retain the existing numeric migration versions:

- `0001`
- `0002`
- `0003`
- `0004`
- `0005`
- `0006`
- `0007`
- `0009`
- followed by the existing `0010` through `0019` chain.

Do not introduce a timestamped baseline. Do not squash migrations at this stage.

Current Supabase CLI behaviour confirmed by the controller:

- numeric migration prefixes are accepted as digit-only versions;
- `supabase migration repair --status applied <version>` resolves the matching local migration file;
- it reads the real migration SQL;
- it stores the migration version, name and parsed statements in `supabase_migrations.schema_migrations`;
- it does not execute the migration SQL against production.

## Pinned CLI version

The GitHub Actions clean-replay workflow pins:

```text
Supabase CLI 2.81.3
```

This version is recorded in workflow evidence at:

```text
tmp/migration-replay/supabase-cli-version.txt
```

## Official Supabase behaviour to account for

Supabase migration workflow tracks remote migration versions in `supabase_migrations.schema_migrations`. Local migrations in `supabase/migrations` are compared with that remote migration history. Supabase documents `migration repair` as the supported way to update migration-history records when migration history and local files diverge.

Supabase also documents that squashing migrations creates a schema-only dump and can omit DML seed data; any required seed data must be manually added back. Because MK has methodology, product, app-setting, report-template and storage seed requirements, a blind squash is not acceptable for this repair.

References:

- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/reference/cli/supabase-migration-repair
- https://supabase.com/docs/reference/cli/supabase-migration-squash

## Selected strategy

Use numeric Supabase CLI repair after clean-replay evidence passes and the controller approves production metadata repair.

The exact preferred commands are:

```bash
supabase link --project-ref jvjxlphdyzerrhwcgkup

supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 \
  --status applied

supabase migration list
```

This path preserves production schema, keeps all Phase 14 flags off, and avoids inventing a second source of truth.

## Required pre-repair checks

Before any production ledger repair, the controller should confirm:

- clean-replay CI passes on the exact PR head;
- foundational tables exist in production;
- foundational enum types exist in production;
- `rate_limit_hits` exists in production because `0004` exists in the repository;
- expected methodology versions remain intact;
- MFRS-V1.0 and MFRS-V1.1 audit integrity remains unchanged;
- Phase 14 tables and flags remain present and disabled;
- no production customer/order/report rows will be mutated by the repair;
- the stranded fulfilment for `MKORD-2026-1NMUW1N9` remains cancelled and has no workflow, report, generation or email side effects.

## Clean-replay CI

The dedicated workflow is:

```text
.github/workflows/supabase-migration-replay.yml
```

It uses Supabase CLI `2.81.3`, starts an empty local Supabase database, runs the repository migration chain, captures the local ledger, verifies schema/seed/RLS/grants/storage state and uploads evidence.

Current successful evidence:

- Workflow: `Supabase Migration Replay`
- Run ID: `29286268503`
- Head SHA: `2e96ed7d0ac21fb8d9aef892089829d5b335c9ed`
- Evidence artifact: `supabase-migration-replay-evidence`
- Artifact ID: `8293313917`
- Artifact digest: `sha256:685461e065eabf88397e53a226a60675dd3bfe924bc63932e3321a2858c5da0c`

The assertions prove the local ledger includes:

```text
0001 0002 0003 0004 0005 0006 0007 0009 0010 0011 0012 0013 0014 0015 0016 0017 0018 0019
```

The workflow also verifies foundational enum types, expected public tables, expected public functions, active methodology state, product pricing, disabled Phase 14 flags, RLS posture, admin policies, grants and private `generated-reports` storage bucket.

It also generates the controller-review-only full-statement repair artefact at:

```text
tmp/migration-replay/numeric-migration-repair-full-statement-artifact.sql
```

The artefact is generated from the real migration files by:

```text
scripts/phase14-generate-numeric-repair-artifact.mjs
```

## Replay compatibility correction

The clean-replay workflow exposed a Supabase CLI prepared-statement failure in `0007_phase6_v1_1_atomic_scoring.sql`. The migration has been reordered so its settings seed commits before the large `complete_score_run_atomic` function and that function is the final statement in the file. This preserves the final schema/function/settings outcome while allowing clean replay from an empty local Supabase database.

## Rollback preparation

If an approved metadata repair needs to be reverted, use the metadata-only CLI rollback:

```bash
supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 \
  --status reverted
```

Verification queries are recorded in:

```text
docs/v1/supabase-migration-reconciliation/prepared-verification-and-repair.sql
```

Expected rollback effect:

- only migration-history rows for `0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007` and `0009` change;
- public schema objects remain unchanged;
- customer, assessment, order, fulfilment, report and email rows remain unchanged;
- Phase 14 flags remain unchanged/off.

## Why not direct schema mutation

Directly applying `0001` through `0009` to production is unsafe because production already contains the foundational objects. Several early migrations use plain `create type` and `create table` statements intended for an empty database. Reapplying them would fail or require invasive edits, and would not be a controlled product change.

## Why no marker-only SQL fallback

A previous emergency SQL draft inserted comment-only marker statements into `supabase_migrations.schema_migrations`. That fallback is removed. A branch replay must have real parsed SQL statements, not placeholders.

The preferred operation is still Supabase CLI repair. The generated full-statement SQL artefact is only for controller comparison and emergency equivalence if CLI repair is unavailable.

## Why not a blind squash

A single squashed baseline can make empty-project schema creation faster, but Supabase warns that squashing can omit seed data. MK's V1 relies on seed data and settings for methodology versions, products, report templates, EFT settings and automation flags. Squashing is intentionally deferred.

## Why not another paid branch now

The previous `phase14-uat` branch failed before public tables were created. Recreating it before numeric repair approval and clean-replay evidence would risk repeating the same failure and incurring avoidable cost.

## Proposed controller sequence

1. Review the updated reconciliation pack.
2. Confirm the clean-replay workflow passes on the exact final PR head.
3. Download and inspect the generated full-statement repair artefact.
4. Confirm production pre-repair read-only checks.
5. Approve the preferred Supabase CLI numeric repair.
6. Execute the metadata-only repair using the pinned/recorded CLI version.
7. Run `supabase migration list` and read-only verification queries.
8. Only then create a new disposable Supabase branch and continue Phase 14 isolated UAT.
