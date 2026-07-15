# Supabase migration reconciliation pack

Status: production-history evidence and controller-review strategy only. No production or UAT operation is authorized.

The previous numeric-chain repair pack is superseded: production already records `0001`–`0007` and `0009`. Do not run the former `migration repair` commands.

The accurate boundary is:

- production contains the early disabled Phase 14 fulfilment, provenance, linkage, flag, PDF-delivery and email-state foundation;
- production does not contain the security closure or fourth/fifth/sixth remediation controls;
- all automation flags remain disabled;
- this PR has not written to production or UAT.

Current artefacts:

- `migration-inventory.md` — exact observed ledger and schema evidence link;
- `production-canonical-reconciliation.md` — production-only strategy and proof contract;
- `scripts/phase14-production-canonical-reconciliation.sql` — generated, controller-only SQL; never use for UAT;
- `scripts/phase14-uat-canonical-reconciliation.sql` — UAT-only SQL; never use for production;
- `docs/v1/phase14/production-history-read-only-evidence-2026-07-15.md` — controller read-only evidence.

The production strategy is not executed by CI. CI uses a disposable local database to reproduce the ledger/schema boundary and prove convergence, restart, acknowledgement recovery, preservation, equivalence and disabled controls.
