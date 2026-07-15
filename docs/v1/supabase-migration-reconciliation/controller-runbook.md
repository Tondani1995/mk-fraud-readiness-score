# Controller runbook — superseded numeric repair

The former numeric-chain repair completed before this evidence pass. Production already contains `0001`–`0007` and `0009`; no numeric repair command in earlier evidence is current or authorized.

For the only current production-specific strategy, see `production-canonical-reconciliation.md`. That strategy:

- requires separate controller approval;
- verifies the complete exact production ledger and early schema boundary;
- applies only the missing closure/fourth/fifth/sixth delta;
- reconciles six timestamped early Phase 14 records to canonical `0017` atomically;
- supports final-schema/missing-ledger acknowledgement recovery and safe restart;
- keeps all gates, feature policies and AI routes disabled;
- is never shared with the UAT-only script.

No production action is part of this PR handoff.
