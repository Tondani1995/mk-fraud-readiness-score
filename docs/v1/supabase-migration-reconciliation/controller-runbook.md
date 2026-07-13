# Controller runbook - migration-chain reconciliation

Status: prepared for controller review only. Do not execute against production without explicit controller approval.

## Goal

Make the MK Fraud Readiness Score Supabase migration chain reproducible for:

- a clean empty Supabase project;
- a Supabase development branch created from the production project;
- future controller review of Phase 14 isolated UAT.

This runbook intentionally avoids product changes, scoring changes, report-generation changes, customer email, automation flags and production schema changes.

## Official Supabase behaviour to account for

Supabase migration workflow tracks remote migration versions in `supabase_migrations.schema_migrations`. Local migrations in `supabase/migrations` are compared with that remote migration history. Supabase documents `migration repair` as the supported way to update migration-history records when migration history and local files diverge.

Supabase also documents that squashing migrations creates a schema-only dump and can omit DML seed data; any required seed data must be manually added back. Because MK has methodology, product, app-setting, report-template and storage seed requirements, a blind squash is not acceptable as the first repair.

References:

- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/reference/cli/supabase-migration-repair
- https://supabase.com/docs/reference/cli/supabase-migration-squash

## Selected smallest safe strategy

Use a two-stage reconciliation, both controller-approved:

1. **Clean-project baseline validation in disposable infrastructure.** Start from an empty Supabase project or branch that is explicitly disposable. Apply the repository migration chain in the documented order. Capture schema diff, migration-history diff and advisor results. This proves whether the repository is complete before any production metadata is touched.
2. **Production migration-history metadata repair only if validation passes.** If production schema is equivalent to the repository baseline and only ledger records are missing/mismapped, use Supabase migration repair semantics to mark the missing foundational migrations as applied, or an approved metadata-equivalent operation if the CLI cannot represent the timestamp/name mapping. Do not execute DDL or DML against production in this step.

This path preserves production schema, keeps all Phase 14 flags off, and avoids inventing a second source of truth.

## Why not direct schema mutation

Directly applying `0001` through `0009` to production is unsafe because production already contains the foundational objects. Several early migrations use plain `create type` and `create table` statements intended for an empty database. Reapplying them would fail or require invasive edits, and would not be a controlled product change.

## Why not direct ledger inserts as the first option

Direct `insert` into `supabase_migrations.schema_migrations` is lower-level than Supabase's supported repair command. It may be necessary only if the controller confirms the CLI cannot express the existing timestamped/split history. A direct SQL template is provided separately as an emergency/controller-only fallback, not as the preferred action.

## Why not a blind squash

A single squashed baseline can make empty-project schema creation faster, but Supabase warns that squashing can omit seed data. MK's V1 relies on seed data and settings for methodology versions, products, report templates, EFT settings and automation flags. A squash may be useful later, but only after controlled seed reconciliation.

## Why not another paid branch now

The previous `phase14-uat` branch failed before public tables were created. Recreating it before ledger reconciliation would likely repeat the same failure and incur avoidable cost.

## Proposed controller sequence

1. Review this pack.
2. Confirm the desired versioning policy:
   - Option A: continue repository numeric filenames and repair production ledger to include numeric foundational versions;
   - Option B: introduce a controlled timestamped baseline chain in a separate reviewed migration branch;
   - Option C: perform a future squash after full seed reconciliation.
3. In a disposable Supabase environment, apply the repository migration chain from `0001` through `0019`.
4. Run Supabase database diff against production schema, excluding expected live data and auth/storage-managed internals.
5. Run Supabase security and performance advisors against the disposable environment.
6. Compare migration history between disposable environment and production.
7. If schema and advisor results are acceptable, approve one metadata-repair plan for production.
8. After metadata repair, create a new disposable branch from production and confirm it replays successfully.
9. Only then continue Phase 14 isolated UAT.

## Required pre-repair checks

Before any production ledger repair, the controller should confirm:

- foundational tables exist in production;
- foundational enum types exist in production;
- `rate_limit_hits` exists in production because `0004` exists in the repository;
- expected methodology versions remain intact;
- MFRS-V1.0 and MFRS-V1.1 audit integrity remains unchanged;
- Phase 14 tables and flags remain present and disabled;
- no production customer/order/report rows will be mutated by the repair.

## Prepared CLI repair concept

If the controller chooses Supabase CLI repair and confirms numeric migration versions are accepted by the linked project, the conceptual commands are:

```bash
supabase link --project-ref jvjxlphdyzerrhwcgkup
supabase migration repair --status applied 0001
supabase migration repair --status applied 0002
supabase migration repair --status applied 0003
supabase migration repair --status applied 0004
supabase migration repair --status applied 0005
supabase migration repair --status applied 0006
supabase migration repair --status applied 0007
supabase migration repair --status applied 0009
supabase migration list
```

This exact command list must not be run until a controller confirms that the CLI maps these numeric versions to the repository filenames as intended.

## Open blocker

The current production ledger uses timestamp versions for `0010+` while the repository filenames use numeric prefixes. That mismatch must be resolved deliberately. If Supabase branch replay relies on timestamp versions rather than filename names, the controller may need a timestamped baseline or metadata mapping rather than simple numeric repair.

## Current recommendation

Do not touch production ledger yet. First validate the repository chain on a disposable project and decide whether numeric repair or a timestamped baseline is the correct long-term source of truth.