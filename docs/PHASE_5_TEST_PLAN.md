# Phase 5 Test Plan

Phase 5 validates the assessment engine only. It must not validate scoring, Free Snapshot, report generation, EFT/order workflow or PDF output because those belong to later phases.

## Required preconditions

1. Supabase dev project exists.
2. Migrations `0001`, `0002`, `0003` and `0004` have run successfully in dev.
3. `.env.local` points to the dev Supabase project.
4. An assessment can be started through `/start`.
5. Admin auth remains working from Phase 4.

## Core acceptance tests

| Test | Expected result |
|---|---|
| Open valid resume link | Assessment engine loads. |
| Open wrong/expired/revoked token | Rejected. |
| Complete exposure profile | 8 exposure factors save and reload. |
| Complete all 10 domains | 68 question answers save and reload. |
| Use valid N/A where exposure profile allows it | Saves as N/A and requires reason before submission. |
| Use invalid N/A where exposure profile does not allow it | Rejected. |
| Use N/A on non-N/A question | Rejected. |
| Submit incomplete assessment | Rejected with missing-domain/question guidance. |
| Submit complete assessment | Status becomes `submitted`, `submitted_at` and `locked_at` are set, resume tokens revoked. |
| Attempt to edit after submit | Rejected by application and database trigger. |
| Score runs | `0`; Phase 5 must not write to `score_runs`. |
| Snapshot status | Must not become `snapshot_available`; Phase 5 does not generate results. |

## Expanded edge-case coverage

Use `docs/PHASE_5_V1_1_TEST_MATRIX.md` for the detailed approval-grade test matrix. It includes token, N/A, autosave, database lock, methodology immutability, malformed-payload and abuse tests.

## Phase 5 gate

Phase 5 is not approved until the Supabase dev test confirms:

- accountless respondent flow still holds;
- questions load from active methodology version;
- answers persist and reload;
- N/A is profile-controlled;
- hard-gate N/A cannot be abused;
- assessment submission locks inputs;
- methodology cannot be mutated after use;
- no scoring is triggered.
