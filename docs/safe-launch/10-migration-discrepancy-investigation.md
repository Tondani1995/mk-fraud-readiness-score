# Investigation: Supabase Cloud preview-branch migration failure

**Status: UNRESOLVED. Root cause not established.** This record exists to preserve evidence and
open hypotheses, not to declare a finding. The precise, controller-approved framing of what is
and is not proven:

> Supabase Cloud preview provisioning produced a migration error that could not be reproduced
> through a complete local migration replay or the repository's GitHub migration-replay
> workflow. The root cause remains unresolved pending verification of the failed cloud branch's
> source commit, provisioning logs, migration source, and the production migration ledger.
>
> Local replay proves that the current Git migration files are syntactically replayable. It does
> not, by itself, prove that production's stored migration history has drifted.

## What happened

| Field | Value |
|---|---|
| Date/time of failed provisioning | 2026-07-24, branch `created_at` = `2026-07-24T10:50:52.18319+00:00` (Supabase API); failure observed within the same session shortly after |
| Intended Git branch/commit | Local working branch was `release-a/backlog-reconciliation`, based on `feace689ce7d3b1ecabd288e91006d4ac56df271`, with the Release A migration already committed locally. The branch-push to GitHub and the `create_branch` MCP call were issued in the same batch, so **the exact timing relationship between the GitHub push completing and Supabase's branch provisioning starting is not established** — this is one of the open evidence gaps below. |
| Actual Git branch/commit Supabase used | **Unknown.** The `create_branch` tool does not accept or report a git ref; it applies "all migrations from the main project." What "main project" migration source it drew from (git-integration sync, a previously `db push`-ed state, or something else) was not observable via the tools available in this session. |
| Exact error text | `"syntax error at or near \"Controlled\""`, `error_severity: "ERROR"`, captured via Supabase `get_logs` (postgres service) on the branch project |
| Referenced migration/line (in current git HEAD) | `supabase/migrations/0017_phase14_canonical_disabled_foundation.sql`, line 3702: `-- Controlled operator reconciliation. Accepted requires a verified provider`. Confirmed at the byte level that this is a normal, correctly-formed ASCII `--` SQL comment in the current git file — not a mangled/substituted dash character. |
| Failed preview branch identifier | id `1516153f-2827-45ff-85a9-7b29b7d41d61`, name `release-a-backlog-reconciliation`, branch's own `project_ref` = `cezyphvyommcxarbclfs`, parent `project_ref` = `jvjxlphdyzerrhwcgkup` |
| Failed branch deleted? | **Yes**, confirmed via `delete_branch` (`{"success": true}`) and a follow-up `list_branches` call showing only `main` remaining. Deleted specifically to stop the small hourly charge on an unusable (`MIGRATIONS_FAILED`) branch, per cost-hygiene practice — see the resource register in `09-release-evidence.md`. |

## What was checked and did NOT reproduce the error

1. **Complete local replay.** Installed the Supabase CLI (via `npx`, no persistent global install), ran `supabase start` against a fresh local Postgres in Docker (isolated from any pre-existing local stack — see resource register), and every migration in `supabase/migrations/` — all 31 pre-existing ones plus the new Release A migration — applied with `Applying migration ...` and only benign idempotency `NOTICE`s (`already exists, skipping`), through to a fully healthy local stack. **Zero errors**, including through `0017_phase14_canonical_disabled_foundation.sql` in full.
2. **The repository's own GitHub Actions "Supabase Migration Replay" workflow.** This workflow runs a from-scratch local Postgres replay in an isolated GitHub-hosted runner, entirely independent of both my local machine and Supabase Cloud. It ran automatically on both pushes this session and **passed both times**:
   - Run `30087604815` (branch `docs/safe-launch-discovery`, commit `70c0141`): success, 4m39s.
   - Run `30087606900` (branch `release-a/backlog-reconciliation`, commit `b1080f3`): success, 4m38s.
   - Its log explicitly shows `Applying migration 0017_phase14_canonical_disabled_foundation.sql...` completing without error, as part of a full sequential replay.

So the current git content of `supabase/migrations/`, replayed from scratch by two independent mechanisms (a local Docker Postgres, and an isolated CI runner), is syntactically clean. That rules out "the file as it sits in git right now is malformed" as an explanation. It does **not** by itself explain why Supabase Cloud's own branch-provisioning replay failed — that mechanism may not be drawing on the same source.

## A concrete, precedented mechanism that makes ledger drift plausible here (not proof of it)

While reading the CI workflow (`.github/workflows/supabase-migration-replay.yml`) to understand what it actually verifies, I found the codebase already has a deliberately engineered process for exactly this class of problem, called "canonical post-commit recovery":

- `supabase/migrations/` used to contain individually numbered Phase 14 migrations —
  `0017_phase14_autonomous_report_engine.sql`, `0018_phase14_pdf_email_delivery.sql`,
  `0019_phase14_email_delivery_state_hardening.sql`, `0020_phase14_privileged_function_grants.sql`,
  `0021_phase14_adversarial_remediation.sql`, `0022_phase14_adversarial_remediation_grants.sql`,
  plus several later timestamped remediation files — preserved today only as an audit archive at
  `docs/v1/phase14/migration-audit-archive/uat-applied/` and
  `docs/v1/phase14/migration-audit-archive/unpublished-remediation/` (this explains the
  0018–0022 numbering gap noted in `00-current-state.md` §4).
- These were later **squashed into the single file** now checked in as
  `0017_phase14_canonical_disabled_foundation.sql` (8,887 lines).
- The CI workflow has a step that proves the squashed file is schema-equivalent to the original
  incremental sequence (by temporarily swapping files, replaying the archived originals, hashing
  the resulting schema, and comparing against a pinned hash), then runs
  `supabase migration repair 0017 --status applied --local` — a bookkeeping-only command that
  marks a migration version as applied in the `supabase_migrations.schema_migrations` ledger
  **without re-executing it**.
- I confirmed the exact comment text from the failing error (`Controlled operator
  reconciliation...`) does exist in the archive, but under a *different* historical file —
  `docs/v1/phase14/migration-audit-archive/uat-applied/20260714214023_phase14_fourth_adversarial_remediation.sql`,
  not the original small `0017_phase14_autonomous_report_engine.sql` (168 lines). This means the
  comment is not new to the squash; it existed somewhere in the incremental history too, under a
  different version number. That weakens (does not eliminate) the specific theory that Supabase
  Cloud's replay is using the *old, small* 0017 content — if it were, a full incremental replay
  would eventually reach an equivalent comment too, just attributed to a different migration
  version in whatever log Supabase Cloud produces.

This finding is included because it establishes that **migration renumbering/squashing with
ledger-repair has genuinely happened in this project's history**, so "production's stored
migration ledger doesn't match the current git file layout" is a well-precedented, plausible
category of explanation here — not a generic guess. It is not evidence that this specific
incident is *caused* by that mechanism.

## Open hypotheses (none confirmed or eliminated)

| Hypothesis | Status |
|---|---|
| Stale integration commit — Supabase Cloud branched from a commit/ref other than what was just pushed | Open. Timing between push and `create_branch` was not sequenced to rule this out. |
| Supabase branch cache — cached/stale migration content reused across branch-creation attempts | Open. Not tested (would require creating a second branch, which is explicitly deferred per current instructions). |
| Encoding or byte-level issue specific to Supabase Cloud's ingestion pipeline | Open. Ruled out *for the exact reported line* in the current git file (confirmed plain ASCII `--`), but not ruled out for content elsewhere in the 8,887-line file, or for whatever Supabase Cloud's own stored copy contains. |
| SQL concatenation/parsing difference between Supabase Cloud's replay tooling and `supabase db start`/CI's `psql`-based replay | Open. |
| Repository-to-cloud configuration mismatch (e.g., a GitHub↔Supabase integration pointing at a different branch/commit than intended) | Open. Whether this project even has such an integration configured was not observable via the tools available this session. |
| Migration-ledger drift (production's `supabase_migrations.schema_migrations` reflects the pre-squash incremental history or a `migration repair`-adjusted state that a from-scratch branch replay can't reconstruct from the current file layout) | Open, but now the best-supported hypothesis given the confirmed precedent above. Not confirmed. |
| Supabase platform defect in branch-provisioning replay | Open. Cannot be assessed without Supabase support/status information not available via these tools. |

## Evidence still needed to distinguish between these

- The failed branch's full provisioning/build log beyond the single `get_logs` postgres-service
  query captured here (a dashboard-level "branch build log," if Supabase exposes one, was not
  accessed).
- Direct inspection of production's `supabase_migrations.schema_migrations` table — in particular
  whether a row exists for version `0017`, and if so, whether it was written by a real
  `0017_phase14_canonical_disabled_foundation.sql` execution or by a `migration repair`-style
  bookkeeping command run against production (mirroring the CI step described above).
- Confirmation of whether this Supabase project has a live GitHub-integration branch sync, and if
  so, which branch/commit it was pointed at on 2026-07-24 around 10:50 UTC.
- Reproducing the failure a second time under controlled, sequenced conditions (push completes
  and is confirmed on GitHub, *then* branch is created, with the branch's git ref explicitly
  pinned if the tooling allows it) — deferred per current instructions to the single
  release-candidate cloud branch planned after Releases A–D are integrated, not attempted again
  during Release A/B.

## What was explicitly NOT done

- Migration `0017_phase14_canonical_disabled_foundation.sql` was not edited.
- No production migration history was changed.
- No second Supabase Cloud branch was created to retest.
