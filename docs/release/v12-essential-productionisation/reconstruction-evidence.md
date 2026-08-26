# V1.2 Essential productionisation — reconstruction evidence

Generated 2026-08-26 from the owner-approved baseline and canonical Preview Staging ledger.

## Release worktree

- Branch: release/v12-essential-productionisation-20260826
- Worktree: /Users/tondani/Documents/Codex/2026-08-26/files-pasted-by-the-user-mk/work/release-v12-essential-productionisation-20260826
- Baseline: bc3b0f69282f8d631272b8dc1bfabee9f4be406f
- Canonical Staging project: iszihmmbgsfefawqmnwo
- Dirty docs/safe-launch-discovery checkout was not modified.

No canonical Staging, historical Production, Vercel, provider, customer, order, payment, or email state was mutated. No AI provider was invoked.

## Migration correspondence

The baseline contains 113 active migration files. Canonical Staging reports 121 applied migrations. The reconstructed release source contains 121 files, and the (version, name) comparison is exact: zero missing and zero extra pairs.

Canonical tail, in applied order:

    20260810140000 final_pre_staging_comprehensive_closure
    20260810150000 fix_paid_order_catalogue_lock_privilege
    20260810160000 fix_comprehensive_package_event_context_and_template
    20260820120000 comprehensive_automated_launch_closure
    20260821090000 adaptive_v1_2_staging_activation
    20260821102116 customer_conversion_interim_closure
    20260821113000 interim_manual_fulfilment_transition
    20260821170050 comprehensive_finalisation_rpc_contract_fix
    20260821181032 canonical_preview_staging_project_rebind
    20260824130345 essential_report_reference_v1
    20260824135232 retire_rc1_operational_gating
    20260825115921 remove_mfa_aal2_operational_dependency

The MFA migration is retained once, under the live version 20260825115921. Its SQL is byte-identical to the baseline 20260825114500 file; only the timestamped filename changed. The old filename is not retained.

The two migrations without a recoverable Git source are restored exactly from the live ledger with the required provenance label:

- 20260824130345_essential_report_reference_v1.sql — LIVE_LEDGER_RECOVERY — originating Git commit unavailable
- 20260824135232_retire_rc1_operational_gating.sql — LIVE_LEDGER_RECOVERY — originating Git commit unavailable

Exact hashes and all drifted-migration provenance are in migration-provenance-manifest.json.

## Disposable replay

Run bash scripts/release-v12-migration-replay.sh to boot a fresh local PostgreSQL 17.10 instance, supply only disposable Supabase object stubs, replay every migration in lexical version order, and destroy the temporary database on exit.

Result:

    121/121 migrations replayed
    121 exact-once log rows
    121 distinct migration versions
    tail 20260825115921
    assessment/adaptive/graph/score/report/admin structures present

The replay is deterministic and clean. It did not use the canonical Staging connection.

## Read-only schema/RPC comparison

The inventory uses normalized PostgreSQL catalog rows for public and phase14_private. Values below are row_count / md5; Staging and replay are identical for every application contract category.

| Contract | Staging | Replay |
| --- | ---: | ---: |
| tables and RLS flags | 93 / 8c08fad45c8b1ca2174ff99805606b13 | same |
| columns | 1,292 / 5fcea5d2fcd3fb6482a064db2ce6df96 | same |
| constraints | 654 / 0f9a52f005655d7eb8c058d10e807d7e | same |
| indexes | 352 / 428205a0d910b991fca0cbed03957cae | same |
| RLS policies | 87 / 90a71a04d524b4d9961f226647a824fa | same |
| triggers | 63 / e0b7b83c472ce546d422db0abd7710c1 | same |
| enum/domain types | 89 / 493f1cd72cb36001dbfa1e4aad8f2ce2 | same |
| RPC signatures, return types, volatility, security-definer flags | 317 / f1fe4897c5cdea8d6127aedfc08fd7de | same |
| non-extension RPC definitions | 270 / 510b684fde578d3a389bba8f79396a23 | same |
| application table grants (PUBLIC, anon, authenticated) | 22 / 6ca1462225662e31c6d2ed8ebd17d21b | same |
| application function grants, excluding extension functions and service_role overlay | 103 / ce46e5ce7c6edd3505cfeb0b8a629a7e | same |

Raw ACL totals intentionally differ because canonical Staging has a Supabase-managed privilege overlay not represented in the migration files:

- Staging table grants: 546 rows; replay migration grants: 152 rows.
- Staging function grants: 415 rows; replay migration grants: 231 rows.
- Staging grants broad additional table privileges to service_role.
- Staging grants the 47 citext extension functions to anon/authenticated; the replay correctly excludes extension-owned functions from the application contract comparison.

This is an environment privilege overlay, not a source schema/RPC mismatch. The security-relevant migration-defined RLS, security-definer, function-definition, and application-role grant contracts match.

## Next approved diff — not yet applied

Per the owner instruction to stop after evidence/planned diff, application productionisation remains pending. The minimal change set is:

1. Add explicit fail-closed environment/project activation for V1.2: Preview may bind only to iszihmmbgsfefawqmnwo; eventual Production may bind only to the authorized Production project; mismatch disables start/submit/scoring.
2. Add an idempotent internal completion notification after successful deterministic score persistence, and a derived 24-hour IN_PROGRESS stalled-lead alert without changing assessment status.
3. Add the MK-admin-only completed/scored assessment action Generate Essential Report, invoking the accepted Phase 1 engine without payment-state gating and without the QA recovery route.
4. Add the authenticated MK-admin Download Report path for the current persisted private PDF; no regeneration and no customer delivery token.
5. Correct the Essential catalogue and UI copy to PDF-only; remove stale register/XLSX/checkout/status/email fulfilment wording. Do not add profile intake.
6. Keep payment automation, worker/webhook/email/delivery-token infrastructure dormant; do not restore payment-triggered generation or automatic fulfilment.

Required next certification remains a new synthetic customer/admin journey plus a separate incomplete save/resume/stalled-lead journey. It must be run only after this diff is implemented and a new authorized staging window is explicitly granted.
