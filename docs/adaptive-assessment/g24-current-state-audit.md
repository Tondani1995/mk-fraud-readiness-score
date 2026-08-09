# G24 current-state audit

Audit basis: Staging Supabase project `penhenkzfrtmcxklodtu`, current branch base `9eda0c8e59b64040ac8711c4e0019237a8da376b`, and the checked-in server-side methodology/evidence model.

## Current methodology and question bank

- Active methodology: `MFRS-V1.1`, id `df96e242-9625-4b2a-bc62-615ae402483a`.
- Active V1.1 bank: 68 distinct controls, ordered `D1-Q01` through `D10-Q06`.
- Current V1.1 applicability rules: 22.
- Weights, critical flags, hard-gate flags, domains, prompts and the 0–5 response scale are retained in the draft graph as a snapshot for traceability.
- Retired `MFRS-V1.0` rows remain historically present and active at the row level; they are not selected by the active methodology and are not included in the G24/G28 seed.

## Existing runtime state

- Existing assessments: 3 (`scored`: 1; `report_requested`: 2).
- Existing assessment answers: 204; existing N/A answers: 0.
- Existing scoring, report-generation, report-storage and report-delivery paths remain the source of truth for legacy assessments.
- Existing resume state is stored through the current resume capability/RPC path; G24 adds a separate navigation state model without changing that path.
- Existing question-specific evidence guidance is the 68-entry server-side question playbook registry. G28 seeds a database-bound draft copy from that registry and does not alter report assembly.

## G24 boundary

The migration is additive and Staging-only. Existing assessments default to `legacy_fixed`; no customer assessment is assigned a graph. The only graph row is a draft with `customerRoutingEnabled=false`. The new navigation, answer-history, applicability-profile and integrity-signal tables are service-role-only and have no public, anon or authenticated grants.

PR #46 was used only as a design reference for gateway, applicability and oversight-variant shape. Its browser-only engine, client scoring, localStorage persistence, inspection hooks and prototype labels are not copied.
