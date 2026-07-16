# Schema and capability plan

## Independent capabilities

| Capability | Source marker | Authoritative RPC | Compatibility behaviour |
|---|---|---|---|
| Phase 1 fulfilment | `v2_phase1_manual_fulfilment` / 0023 | `phase1_manual_fulfilment_capability()` | Payment is recorded; fulfilment remains pending. |
| Payment automation | `v2_phase23_payment_automation` / 0024 | `payment_automation_capability()` | Manual legacy status recording remains available; provider route fails closed. |
| Assessment resume | `v2_phase23_assessment_resume` / 0025 | `assessment_resume_capability()` | Saved answers derive the next incomplete question. |

Each application check uses `available`, `unavailable` and `error`; permission/database errors fail closed and are not misclassified as an absent migration.

## Migrations

- `0024_phase23_payment_automation.sql` — SHA-256 `2d83af2ceb623e7f549cf55e491646b5d1de783ebbad94970514b35b4dc22517`
- `0025_phase23_assessment_resume.sql` — SHA-256 `ef0f71809e0680396d3f3eb8b50e81428fd318438daa7aff64fd8655f7f7c362`

Both are additive. New tables have RLS enabled, public/anon/authenticated table grants revoked, service-role grants explicit, and security-definer RPC execution revoked from public roles. No public report path or token column is added.

## Exact application control

`apply-phase23-0024-0025-only.sh` requires a database fingerprint, target label, exact confirmation phrase and reviewed checksums. Its SQL controller refuses:

- an absent exact 0023 ledger boundary;
- any 0017–0022 or Phase 14 history/object;
- an already recorded 0024/0025;
- partial Phase 2–3 objects or cursor columns;
- missing Phase 1 base objects/capability.

It applies exactly 0024 then 0025 and records exactly those ledger entries in one transaction. Generic migration push is not the deployment mechanism.
