# Source/Cloud Migration-History Reconciliation

**Revision 4 current status:** controller-selected reconciliation designs are implemented on the
RC branch; the fresh disposable replay is green, while the complete CI battery remains pending. This document distinguishes exact
applied-history archives, canonical active replay migrations, retired never-applied consolidated
migrations, and the seven genuinely pending migrations. Revision 3 blocker findings remain below as
the complete historical record and are superseded only where the Revision 4 outcome says so.

Code-only work, executed on `release-candidate/v7-a-d-integration`. **The live migration ledger on
`jvjxlphdyzerrhwcgkup` was never altered, queried anything other than `SELECT`-only, or had any row
inserted/updated/deleted.** No Supabase branch was created. No secret value or customer data appears
anywhere in this document. All facts below were independently retrieved this session via the
Supabase MCP `list_migrations`/`execute_sql` (`SELECT`-only) tools and direct `git` inspection, not
assumed from any earlier document.

## 1. All 34 cloud-applied migration versions, mapped to their local file

Re-queried fresh via `list_migrations` immediately before this reconciliation began.

| Version | Ledger name | Local file (before this reconciliation) | Local file (after) |
|---|---|---|---|
| `0001` | `0001_phase2_v1_1_schema_rls` | `0001_phase2_v1_1_schema_rls.sql` | unchanged |
| `0002` | `0002_phase4_dev_seed` | `0002_phase4_dev_seed.sql` | unchanged |
| `0003` | `0003_phase5_methodology_seed` | `0003_phase5_methodology_seed.sql` | unchanged |
| `0004` | `0004_phase4_v1_2_rate_limiting` | `0004_phase4_v1_2_rate_limiting.sql` | unchanged |
| `0005` | `0005_phase5_v1_1_guards` | `0005_phase5_v1_1_guards.sql` | unchanged |
| `0006` | `0006_phase6_scoring_guards` | `0006_phase6_scoring_guards.sql` | unchanged |
| `0007` | `0007_phase6_v1_1_atomic_scoring` | `0007_phase6_v1_1_atomic_scoring.sql` | unchanged |
| `0009` | `0009_methodology_copy_polish` | `0009_methodology_copy_polish.sql` | canonical deterministic replay repair; exact cloud SQL archived under `supabase/applied-history/` |
| `0017` | `phase14_canonical_disabled_foundation` | `0017_phase14_canonical_disabled_foundation.sql` | unchanged |
| `20260708181207` | `0010_phase9_manual_eft_order_flow` | `0010_phase9_manual_eft_order_flow.sql` | unchanged |
| `20260708193238` | `phase10_report_engine_additions` | **none — see §2** | `20260708193238_phase10_report_engine_additions.sql` (restored) |
| `20260708193318` | `phase9_phase10_private_storage_buckets` | **none — see §2** | `20260708193318_phase9_phase10_private_storage_buckets.sql` (restored) |
| `20260708194834` | `phase10_v2_report_engine_content` | **none — see §2** | `20260708194834_phase10_v2_report_engine_content.sql` (restored) |
| `20260709033522` | `phase10_v2_report_template_seed` | **none — see §3 (Revision 3 blocker history)** | `20260709033522_phase10_v2_report_template_seed.sql` (restored verbatim; active replay) |
| `20260710220504` | `0012_phase13_commercial_event_foundation` | `0012_phase13_commercial_event_foundation.sql` | unchanged |
| `20260710220746` | `0013_phase13_event_index_cleanup` | `0013_phase13_event_index_cleanup.sql` | unchanged |
| `20260711211557` | `0014_phase13_customer_commercial_conversion` | `0014_phase13_customer_commercial_conversion.sql` | unchanged |
| `20260711211654` | `0015_phase13_data_request_policy_cleanup` | `0015_phase13_data_request_policy_cleanup.sql` | unchanged |
| `20260712153438` | `platform_database_hardening` | `0016_platform_database_hardening.sql` | unchanged |
| `20260716222156` | `0023_phase1_manual_fulfilment_recovery` | `0023_phase1_manual_fulfilment_recovery.sql` | unchanged |
| `20260716222317` | `0024_phase23_payment_automation` | `0024_phase23_payment_automation.sql` | unchanged |
| `20260716222400` | `0025_phase23_assessment_resume` | `0025_phase23_assessment_resume.sql` | unchanged |
| `20260716222446` | `0026_phase14_workflow_start_admin_recovery` | `0026_phase14_workflow_start_admin_recovery.sql` | unchanged |
| `20260716222527` | `0027_phase14_delivery_ambiguity_admin_resolution` | `0027_phase14_delivery_ambiguity_admin_resolution.sql` | unchanged |
| `20260716222622` | `0028_phase14_attestation_canonicalisation_hardening` | `0028_phase14_attestation_canonicalisation_hardening.sql` | unchanged |
| `20260716222653` | `0029_phase14_ai_attempt_cross_kind_budget` | `0029_phase14_ai_attempt_cross_kind_budget.sql` | unchanged |
| `20260716222720` | `0030_phase14_ai_attempt_pre_dispatch_budget_exclusion` | `0030_phase14_ai_attempt_pre_dispatch_budget_exclusion.sql` | unchanged |
| `20260716222755` | `0031_phase14_delivery_event_recency_precision_fix` | `0031_phase14_delivery_event_recency_precision_fix.sql` | unchanged |
| `20260719081858` | `phase14_gate_invalidation_safe_update_fix` | **none — see §2** | `20260719081858_phase14_gate_invalidation_safe_update_fix.sql` (restored) |
| `20260719134816` | `phase1_app_settings_service_role_select_restore` | `0032_phase1_app_settings_service_role_select_restore.sql` | unchanged |
| `20260720192442` | `phase1_manual_generation_report_event_authoritative_context` | `0033_phase1_manual_generation_report_event_authoritative_context.sql` | unchanged |
| `20260720200442` | `phase_v2_content_library_domain_code_and_activation` | `0034_phase_v2_content_library_activation.sql` (**wrong version identity — see §2**) | `20260720200442_phase_v2_content_library_domain_code_and_activation.sql` |
| `20260720200735` | `phase_v2_fix_singular_cap_wording` | `20260720200735_phase_v2_fix_singular_cap_wording.sql` | unchanged |
| `20260721150808` | `fix_complete_manual_report_generation_supersede_order` | `20260721150808_fix_complete_manual_report_generation_supersede_order.sql` | unchanged |

The 7 migrations genuinely pending against this ledger (§3 of doc 24) are unaffected by anything in
this document — none of them appear in the table above, and none was touched by this reconciliation.

## 2. Restored/corrected files — exact fingerprints and provenance

For each file below, the exact statement text was retrieved via
`select statements[1] from supabase_migrations.schema_migrations where version = '<version>'`
(`SELECT`-only). Every restored/corrected file's SQL body is **byte-identical** to the ledger's own
stored statement, confirmed by SHA-256 comparison — the only difference in every case is the single
trailing newline this repository's files conventionally end with (a stored SQL statement string has
none; a well-formed text file does), which was located, explained, and confirmed as the sole cause of
an initial hash mismatch before being recorded as a non-substantive formatting difference, not
assumed away.

| File | Ledger version | Ledger `statements[1]` SHA-256 | Local body SHA-256 (trailing newline stripped) | Result |
|---|---|---|---|---|
| `20260708193238_phase10_report_engine_additions.sql` | `20260708193238` | `586af99326bb7f24955d4d9e0faa251c56149790243d314c88ec49aabf6f1d51` | `586af99326bb7f24955d4d9e0faa251c56149790243d314c88ec49aabf6f1d51` | **Byte-identical** |
| `20260708193318_phase9_phase10_private_storage_buckets.sql` | `20260708193318` | `28d87527582e4a8a6794ca24263a1e5c068e128d7a0d52f75439e06c64a5d5a7` | `28d87527582e4a8a6794ca24263a1e5c068e128d7a0d52f75439e06c64a5d5a7` | **Byte-identical** |
| `20260708194834_phase10_v2_report_engine_content.sql` | `20260708194834` | `99661edc770ab83922a42a3740e81b7c82e409766a9349cafbc83e9bea6cca40` | `99661edc770ab83922a42a3740e81b7c82e409766a9349cafbc83e9bea6cca40` | **Byte-identical** |
| `20260719081858_phase14_gate_invalidation_safe_update_fix.sql` | `20260719081858` | `f7a9639e4d1574df27212dd040ed0c704c0d2fa01399e6880479f7ac7329181c` | `f7a9639e4d1574df27212dd040ed0c704c0d2fa01399e6880479f7ac7329181c` | **Byte-identical**, also corroborated by the independent, never-merged `hotfix/phase14-safe-update-invalidation` branch's own `0032_phase14_gate_invalidation_safe_update_fix.sql`, which carries the same statement content |
| `20260720200442_phase_v2_content_library_domain_code_and_activation.sql` | `20260720200442` | `1d2a760775feb175b37e8009a9d1dcee6452c105a607e553c00186ba105b7fa1` | `1d2a760775feb175b37e8009a9d1dcee6452c105a607e553c00186ba105b7fa1` | **Byte-identical** (matched on the very first hash, no trailing-newline stripping needed) |

### `0034` → `20260720200442`: the recorded difference

The pre-reconciliation git file, `0034_phase_v2_content_library_activation.sql`, was **not** byte-
identical to the ledger's `20260720200442` statement — the one substantive difference, read directly
and recorded here in full:

- **Ledger / `20260720200442` (now authoritative)**: step 5's `insert into
  public.report_content_blocks (...)` uses a **hardcoded literal**
  `methodology_version_id = 'df96e242-9625-4b2a-bc62-615ae402483a'` for all five inserted rows.
- **Old `0034` (retired, no longer in the migration set)**: the same step instead ran a `do $$ ...
  select id into v_methodology_id from public.methodology_versions where version_code = 'MFRS-V1.1'
  ... $$` block, using the dynamically-resolved id in place of the literal — `0034`'s own comment
  explained this was a deliberate fix: *"A hardcoded literal only works against an environment whose
  methodology_versions table happens to already contain that exact row... This is what was breaking
  Supabase Migration Replay and Phase 1 Release Safety on this branch."*

This is exactly the difference §3 (fresh-replay evidence) below demonstrates in practice: the
literal-UUID version (now correctly recorded as what production actually ran) fails on a fresh
database; the dynamic-lookup version (no longer part of the committed migration set, since it was
never applied to `jvjxlphdyzerrhwcgkup` under any version identity) does not have this problem but is
also not a faithful record of what production ran. **Neither file was edited to reconcile this
difference — the ledger's exact text is now the committed migration; the old file's fix is
preserved only in git history (this repository's own commit log) and in this document, pending a
reconciliation-design decision (§4).**

## 3. Revision 3 blocker history — `20260709033522` versus consolidated `0011`

Retrieved and read, **not written as a live migration file**. Exact statement SHA-256 (for the
record, so this can be verified without re-querying):
`f32f61c4596a6a104c48f62b4e519eb9c364d54b2dba4a61743b8c1cb5e96b59`. It inserts one
`report_templates` row, `template_code = 'phase10_premium_v2'`.

**Live-database confirmation (read-only, this session):** `jvjxlphdyzerrhwcgkup`'s `report_templates`
table contains **exactly one row**, `phase10_premium_v2` — matching this migration's own effect and
nothing else.

**The already-committed `0011_phase10_pdf_report_engine_additions.sql`** (unaffected by this
reconciliation, already part of the migration set before this cycle) inserts two *different*
`report_templates` rows: `mk_fraud_readiness_advisory_v1` and
`mk_fraud_readiness_validated_advisory_v1`. **Neither exists on `jvjxlphdyzerrhwcgkup`** — confirmed
by the same query. This means `0011`, despite being committed to git and replayed by every existing
release's own test suite, **has never actually been applied to production under any version
identity** — its own template rows have no live counterpart at all.

**Overlap conclusion**: restoring `20260709033522` alongside the already-committed `0011` would make
a fresh replay produce 3 `report_templates` rows where production has 1 — a genuine, confirmed
divergence between what CI/fresh-replay would exercise and what production actually contains. This
is not treated as a false alarm and not silently resolved. Two candidate designs, presented for
controller decision, not chosen here:

- **Option A**: retire/deprecate `0011`'s `report_templates` inserts specifically (its other content
  — the `report_events.metadata_json` column, the `generated-reports` bucket touch — has no such
  conflict) in favour of `20260709033522`'s real, live-matching content, on the basis that `0011`
  was apparently an early draft superseded by ad-hoc production application under different
  identities before ever shipping. This is a judgement call about historical intent this document
  does not make unilaterally.
- **Option B**: restore `20260709033522` to a clearly-labelled, non-replayed archival location
  (outside `supabase/migrations/`, so the live migration runner never picks it up), preserving its
  exact recovered SQL and full provenance without introducing the duplicate-seed conflict into the
  live-replayed path — at the cost of `0011`'s own two never-applied template rows continuing to
  exist only in the fresh-replay/CI schema, not in production, indefinitely.

The paragraph above records the blocker exactly as found in Revision 3. The controller-selected
resolution is recorded in §3a below; the historical text is retained so this document does not
rewrite the conflict as though it never existed.

## 3a. Revision 4 controller-selected reconciliation outcome

- `supabase/migrations/0011_phase10_pdf_report_engine_additions.sql` is retired from canonical replay
  at `supabase/retired-migrations/0011_phase10_pdf_report_engine_additions.sql`. Its prior SQL content
  is preserved exactly with an explicit “never applied under version 0011 / do not execute” header.
- The exact cloud SQL for `20260709033522_phase10_v2_report_template_seed` is restored in the active
  migration path. Ledger SHA-256 (statements joined with a blank line) is
  `f32f61c4596a6a104c48f62b4e519eb9c364d54b2dba4a61743b8c1cb5e96b59`; the local body matches after
  normal trailing-newline handling. It creates exactly the Production structural template
  `phase10_premium_v2`, Essential, version 1. The absence of an active `mk_validated` template is
  an existing Production limitation and is intentionally not hidden or filled in by this RC.
- The real Phase 10 history therefore replaces the consolidated surrogate: `metadata_json` comes from
  `20260708193238`; `payment-proofs` and `generated-reports` storage are supplied by the restored
  Phase 10 bucket migrations; the Production content-block seeds come from the restored cloud
  migrations; and the Production template comes from `20260709033522`. No current application code
  consumes `phase10_premium_pdf_report_engine`, and Production does not contain that setting, so it
  is not recreated from retired `0011`.
- The exact cloud-applied `0009` SQL is preserved in
  `supabase/applied-history/0009_methodology_copy_polish.cloud.sql` with statement count 10 and
  cloud SHA-256 `da96ec9ed58f11f66f84809ad09f1044477b47f49dc11fa3147cf4e48f15856a`. The active replay
  migration is intentionally not byte-identical: it explicitly inserts
  `df96e242-9625-4b2a-bc62-615ae402483a` for `MFRS-V1.1`, matching the Production row referenced by
  the later applied `20260720200442` migration. All other clone, polish, activation, guard and
  transaction behaviour is preserved.
- `20260720200442_phase_v2_content_library_domain_code_and_activation.sql` remains unmodified and
  active. The deterministic `0009` repair makes its exact hardcoded Production UUID replayable on an
  empty disposable database without editing historical SQL.

These are four distinct file categories: exact applied-history archives; canonical active replay
migrations; retired never-applied consolidated migrations; and the seven genuinely pending
migrations listed in §1 and doc 24 §3.

## 4. Fresh full replay — actual result, not assumed

**Revision 3 historical result.** The failure documented in this section was the pre-repair result.
It is retained as history and is superseded by the Revision 4 result below.

Executed via `scripts/rc0-migration-reconciliation-replay-check.mjs` (embedded-postgres, disposable,
destroyed after the run), replaying every file in `supabase/migrations/` in filename-sorted order —
the same mechanism every release's own live-Postgres test suite already uses.

**Historical result: the pre-repair migration set did not replay cleanly.**

- Every migration through and including `20260719081858_phase14_gate_invalidation_safe_update_fix.sql`
  applies successfully — this includes all three newly-restored phase10 files (§2), proving the
  overlap analysis with `0011` in §2/§3 correct in practice, not just on paper: no error, no
  constraint violation, at that point in the sequence.
- **`20260720200442_phase_v2_content_library_domain_code_and_activation.sql` fails**, with:
  ```
  insert or update on table "report_content_blocks" violates foreign key constraint
  "report_content_blocks_methodology_version_id_fkey"
  detail: Key (methodology_version_id)=(df96e242-9625-4b2a-bc62-615ae402483a) is not present in
  table "methodology_versions".
  ```
  Exactly the failure mode this file's own header comment discloses (§2) — the hardcoded literal UUID
  exists in production's `methodology_versions` table but not in any freshly-seeded database's own
  (independently-generated) row for the same `version_code`.

**No historical SQL was edited to make this pass.** This is the confirmed, evidence-backed instance
of "if it does conflict, stop and return a reconciliation design rather than weakening or editing
historical SQL casually." Two candidate designs, presented for controller decision, not chosen here:

- **Option A**: add a new, honestly-versioned, idempotent follow-up migration (a timestamp after
  `20260720200442`, not a rename or an edit of it) that performs the same content-activation goal
  using the dynamically-resolved `methodology_version_id` lookup `0034` originally used — safe as a
  no-op against `jvjxlphdyzerrhwcgkup` (which already has this content correctly seeded under the
  literal UUID, so `on conflict (methodology_version_id, block_key, version_number) do nothing` would
  simply not match and do nothing there) while making fresh replay succeed everywhere else. This is
  additive, forward-only, and does not edit `20260720200442`'s own historical text.
  **Caveat requiring its own check before this option is adopted**: the dynamic lookup resolves to
  *whatever* row currently has `version_code = 'MFRS-V1.1'` in a given database — on
  `jvjxlphdyzerrhwcgkup` specifically, this needs to be confirmed to actually resolve to
  `df96e242-9625-4b2a-bc62-615ae402483a` (i.e. that literal is indeed `MFRS-V1.1`'s real id in
  production, not merely assumed) before relying on the no-op behaviour holding there.
- **Option B**: move `20260720200442` out of the live-replayed `supabase/migrations/` path into a
  clearly-labelled, non-replayed archival location (mirroring Option B for §3), accepting that fresh
  replay/CI cannot reach a schema state matching this specific piece of production content until this
  is resolved by explicit decision, and that the "complete migration replay" gate required for RC
  MIGRATION/DEPLOYMENT GO remains unmet until then.

Neither option is implemented. `20260720200442` remains, unedited, in `supabase/migrations/` exactly
as retrieved from the ledger.

**Revision 4 result:** `scripts/rc0-migration-reconciliation-replay-check.mjs` replayed all 41 active
migrations from an empty disposable database in filename order. The deterministic 0009 MFRS-V1.1
clone assertions, final canonical-state assertions, and Release A–D integration assertions all
passed. The replay ended with exactly one active Essential template (`phase10_premium_v2` v1), no
active retired advisory templates, no active `mk_validated` template, both private storage buckets,
72 report-content blocks, and the final Phase 14 hardening assertion passed. The checker now seeds
its repository-derived expected-version temp table and local ledger explicitly so the existing
assertion SQL runs in the same disposable session as the replay.

Because the local checker replays filename-sorted migrations while the cloud ledger applies the
timestamped Phase 10 history before numbered `0017`, `0017_phase14_canonical_disabled_foundation.sql`
now adds only an idempotent `metadata_json` prerequisite. It is a local replay-order compatibility
guard, not a recreation of retired `0011` content, and is a no-op wherever the real Phase 10
migration has already supplied the column.

### Function-definition comparison

`invalidate_phase14_authority_on_gate_change()`, as restored via `20260719081858` and present after
the replay reached that point: matches the live `pg_get_functiondef()` output retrieved from
`jvjxlphdyzerrhwcgkup` this session, including the `where true` clauses on both bulk `UPDATE`
statements — confirmed by direct text comparison, not merely "should match."

## 5. What this reconciliation did not touch

The 7 genuinely pending migrations (§3 of `24-integrated-a-d-release-candidate-plan.md`) —
`20260722143000`, `20260724150000` (A), `20260724160000` (B), `20260724170000` (C), `20260724180000`
(C), `20260725090000` (C), `20260725150000` (D) — are unchanged by anything in this document. No
grant, RLS policy, function signature, or table definition introduced by Releases A-D was read,
compared, or modified as part of this reconciliation; it is scoped entirely to bringing pre-existing,
pre-Release-A git history into alignment with what `jvjxlphdyzerrhwcgkup` already contains.

## Cross-references

- Integrated RC plan and the four-state decision framework: `24-integrated-a-d-release-candidate-plan.md`
- Cloud-schema reconciliation (original finding that the ledger stops at `20260721150808`):
  `19-release-c-cloud-schema-reconciliation.md`
- Full evidence pack: `09-release-evidence.md`
