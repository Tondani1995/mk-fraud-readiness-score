# Production migration inventory

Observed read-only on `2026-07-15`; no production or UAT mutation occurred. Exact evidence is in `docs/v1/phase14/production-history-read-only-evidence-2026-07-15.md`.

The ledger contains numeric `0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007`, `0009`; timestamped Phase 9–13 records through platform hardening; and these early Phase 14 records:

| Version | Name | Canonical mapping |
| --- | --- | --- |
| `20260712180303` | `phase14_report_fulfilment_core` | early `0017` |
| `20260712180317` | `phase14_report_generation_runs` | early `0017` |
| `20260712180329` | `phase14_report_links` | early `0017` |
| `20260712180346` | `phase14_report_security_and_flags` | early `0017` |
| `20260712182003` | `phase14_pdf_email_delivery` | `0018` |
| `20260712184501` | `phase14_email_delivery_state_hardening` | `0019` |

The read-only Phase 14 production-boundary inventory contains 360 normalized metadata entries plus its digest line, with SHA-256 `417dfbf2fb7fdea1727d7dc9d84d0463a597db6b545def32de18d2e15d8509cd`. It covers exact tables, columns, constraints, indexes, grants, RLS policies, trigger definitions, helper-function hashes, flags and the private report bucket without reading customer rows.

Production lacks `phase14_security_gates`, the later closure/fourth/fifth/sixth tables and functions, the shared terminal core, and expired-lease recovery. The production-only reconciliation generator composes those missing reviewed sources without reapplying the early foundation.
