# Phase 14 Migration History Note

The repository now keeps the complete disabled Phase 14 foundation in the
single atomic migration
`supabase/migrations/0017_phase14_canonical_disabled_foundation.sql`. Exact
historical UAT-applied SQL is retained outside the deployable migration path in
`docs/v1/phase14/migration-audit-archive`; production has not received Phase 14.

This documentation change does not change the live schema. It records the current assurance position only:

- `0017` through `0019` are treated as the applied Phase 14 schema history in production.
- The split history covers the private operational tables and columns for report fulfilments, generation provenance, report linkage, workflow state and disabled Phase 14 feature flags.
- Automation flags remain off by default: auto fulfilment, AI narrative generation, automatic report email delivery and R50,000 automation are disabled.
- The Phase 14 remediation pass must not apply another database migration unless the controller first approves a reviewed schema diff.
- Supabase advisor review and isolated preview-branch runtime UAT remain required before any final merge candidate.

The Phase 14 migration set must not mutate scoring, methodology, pricing, prior assessments, prior score results or historical order outcomes.
