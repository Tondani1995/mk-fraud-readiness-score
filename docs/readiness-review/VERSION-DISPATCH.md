# Methodology-version dispatch, from the assessment's own record

MK's direction of 11 November (18:33), item 2. The patch held as P-5 is withdrawn and removed: it passed a null graph-version identifier, so an adaptive assessment would have resolved to the fixed calculator, and it read nothing the assessment recorded. No integrity-guard exception is requested. The protected MFRS scorers, the three scoring routes and the integrity guard are unchanged, and the revised calculator stays inactive.

## What the assessment records

| Column | Where it comes from | What it decides |
|---|---|---|
| `assessments.assessment_mode` | Set when the assessment starts; `legacy_fixed` or `adaptive` (check constraint in the migrations) | Which family of calculator applies |
| `assessments.methodology_version_id` → `methodology_versions.version_code` | The methodology the assessment started on | Which version of that family |
| `assessments.graph_version_id` → `adaptive_graph_versions` | The adaptive graph the assessment started on, with its own methodology id, methodology code and fingerprint | Which adaptive graph, and that it belongs to the recorded methodology |
| `assessments.graph_version_snapshot`, `graph_fingerprint_snapshot` | Snapshotted on the assessment at start | That the graph row has not changed since |
| Review-engine ruleset | Recorded by every review-track session | The revised family, which refuses to score |

A version code alone is not enough. `MFRS-V1.1` is the fixed method and also the methodology of the adaptive V1.1 draft graph, so only the mode and the graph pin together say which calculator applies.

## Resolution (`resolveMethodologyRoute`, pure)

| Recorded | Resolves to |
|---|---|
| A review-engine ruleset | Refused: `revised_methodology_inactive` (family `revised-review`) |
| `legacy_fixed`, no graph pin, code `MFRS-V1.0` or `MFRS-V1.1` | `mfrs-fixed` |
| `legacy_fixed` with any graph pin | Refused: `fixed_assessment_with_graph_pin` |
| `legacy_fixed` with another code | Refused: `unregistered_methodology_version` |
| `adaptive` without graph id, version or fingerprint | Refused: `adaptive_assessment_without_graph_pin` (the withdrawn patch's case) |
| `adaptive`, graph row not found | Refused: `graph_not_found` |
| `adaptive`, graph not registered | Refused: `unregistered_graph_version` |
| `adaptive`, graph's methodology id or code differs from the assessment's, or from the registry | Refused: `graph_methodology_mismatch` |
| `adaptive`, graph version or fingerprint differs from the snapshot | Refused: `graph_snapshot_mismatch` or `graph_fingerprint_mismatch` |
| `adaptive`, every check agrees | `mfrs-adaptive`, with the graph version and fingerprint |
| Any other mode, a missing methodology row or no record | Refused: `unknown_assessment_mode`, `methodology_version_not_found` or `assessment_not_found` |

Registered adaptive graphs: `MFRS-V1.1-ADAPTIVE-DRAFT-20260804` (methodology `MFRS-V1.1`) and `MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821` (methodology `MFRS-V1.2-CANDIDATE-OWNER-CORRECTION`), taken from the repository migrations; the test checks the registry against the repository's V1.2 graph.

## The entry point

Three existing routes score an assessment today, each calling its scorer directly: the fixed submit route calls `scoreSubmittedAssessment`, the adaptive submit route calls `scoreAdaptiveSubmittedAssessment`, and the admin scoring route calls `scoreSubmittedAssessment` whatever the assessment's mode. `dispatchSubmittedAssessmentScoring` is the single entry point they would call instead: it loads the record (`loadRecordedMethodologyFromDb`, which reads only the columns above), resolves it, calls exactly that family's unchanged scorer with the run type passed through, and returns a refusal as a 409 (404 for a missing assessment) with `methodology_dispatch_refused:<reason>`, without calling any scorer.

The routes are protected by the integrity guard, so switching them to this entry point is a release step for MK, taken with a pinned exception when MK decides to; it is not part of this prototype and is not requested here.

## Evidence

`scripts/methodology-version-dispatch-tests.mjs`, 9 of 9, on records shaped as the migrations define them, with the repository's real version codes and the real V1.2 graph identity:

| Test | Shows |
|---|---|
| VD-01 to VD-03 | Fixed and adaptive assessments resolve to their own family; `MFRS-V1.1` resolves by mode and pin, not code |
| VD-04 | The withdrawn rule sends a null graph identifier to the fixed calculator; the new resolution refuses it |
| VD-05 | Eleven mismatches each fail closed with their own reason |
| VD-06 | A revised assessment is refused whatever else it records |
| VD-07 | The entry point calls exactly one unchanged scorer, passes the run type through and calls none on refusal |
| VD-08 | The production loader maps stored rows to the same results |
| VD-09 | The registry agrees with the repository graph |

The earlier parity tests still pass (8 of 8): the fixed calculator behind the dispatch is byte-identical to the results pinned at `3f933ac`. The integrity guard passes.
