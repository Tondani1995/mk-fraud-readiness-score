# MK Fraud Readiness Adaptive Assessment V1.2 — revised owner review pack

Candidate graph version: MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821
Candidate graph fingerprint: 6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7
Counts: 17 gateways, 68 scored controls, 8 oversight variants
Activation status: revised draft candidate only; no customer routing; no staging activation; V1.1 remains active and immutable.

## Correction outcome

- Retained controls use original D*-Q* IDs. New IDs are sequential within domains; no C IDs are used.
- V1.1 critical/hard-gate treatment is restored: 19 critical controls and 17 hard gates; no new flags are proposed.
- No domain-wide weight normalisation is used. Retained weights are exact, split allocations are explicit and NEW weights are proposed for owner approval.
- G04 is asked only when G03 = Yes; G03 = unknown retains supplier exposure without forcing G04.
- G06 is a factual Yes / No / I don't know question about normal physical-cash handling.
- G10 covers customer/user digital-payment exposure only.
- Shared/hybrid delivery remains direct to avoid double-weighting; provider-only delivery receives retained oversight.

## Pathways
- typical: 60 scored controls shown, 8 excluded, 0 redirected.
- complex_high_exposure: 68 scored controls shown, 0 excluded, 0 redirected.
- provider_only: 66 scored controls shown, 2 excluded, 7 redirected.
- low_exposure: 46 scored controls shown, 22 excluded, 0 redirected.
- unknown: 68 scored controls shown, 0 excluded, 0 redirected.

## Documents
- [Revised full questionnaire](./v1-2-questionnaire.md)
- [Complete old-ID → revised-ID crosswalk](./v1-2-crosswalk.md)
- [Frozen 88-item audit](./v1-2-v1-1-audit.md)
- [Genuinely new-control review](./v1-2-new-controls.md)
- [Split review](./v1-2-split-review.md)
- [Routing truth table and pathway counts](./v1-2-routing-truth-table.md)
- [Score-parity fixtures and comparison](./v1-2-score-parity.md)
- [Individual weight reconciliation](./v1-2-weight-reconciliation.md)
- [Critical and hard-gate reconciliation](./v1-2-critical-hard-gate-reconciliation.md)
- [Candidate graph JSON](./adaptive-graph-v1-2-candidate.json)

## Safety boundary

No migration, activation policy update, staging graph insert, customer-start route change, provider call, Comprehensive generation, Production mutation, email or report generation is part of this correction. Stop for owner approval.
