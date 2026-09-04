# Phase 14 control reachability inventory

Scope: recovered Production source `df88caf06446a39fa401dfcf25d46d0411564475` plus the bounded
unified-admin integration candidate. This is an inventory only; it does not enable, remove or
mutate any Phase 14 control.

## Historical artefacts

The historical migration, SQL fixture and documentation corpus still contains references to
`phase14_security_gates`, `phase14_feature_policies`, `phase14_ai_route_policies` and
`premium_report_ai_narrative_enabled`. The current checkout contains 8 matching migration files,
43 matching script files and 40 matching documentation files. These are retained as historical
lineage and test evidence. They are not certification authority for the Comprehensive route.

## Obsolete admin/control-plane UI

The following legacy admin surfaces remain in the recovered tree and were deliberately not removed
in this provenance-recovery patch:

- `src/app/score/admin/phase14-activation/page.tsx`
- `src/app/score/api/admin/phase14-activation/ai-route-policy/route.ts`
- `src/app/score/api/admin/phase14-activation/feature-policy/route.ts`
- `src/app/score/api/admin/phase14-activation/gate/route.ts`
- `src/app/score/api/admin/phase14-activation/runtime-secret/route.ts`
- `src/app/score/api/admin/phase14-activation/settings/route.ts`

They are not read by the Comprehensive generation branch. Removing them requires a separately
authorised forward retirement change because shared database objects and historical Essential or
delivery evidence must not be changed here.

## Legacy runtime references

- `src/lib/reports/phase1-manual-fulfilment.ts` still imports the flag type/container for the
  Essential branch. Its flag load now occurs only inside that Essential branch; Comprehensive no
  longer reads the retired AI-generation authority before its own generation path.
- `src/lib/reports/automation/processor.ts`,
  `src/workflows/premium-report-fulfilment.ts` and
  `src/lib/reports/automation/workflow-start.ts` form the historical Phase 14 workflow seam.
  No active application caller or Vercel fulfilment cron was found in this tree.
- `src/lib/reports/email/report-delivery-service-core.ts` retains the old implementation after
  the unconditional V1.2 manual-delivery failure guard. The guarded implementation is unreachable
  in the active customer path; its flag import is retained for later cleanup rather than changing
  historical delivery behaviour in this patch.
- `src/lib/fulfilment/immediate-dispatch.ts` remains a historical dispatch helper. The current
  payment service no longer calls it.

## Current shared consumers

The current Essential report-generation path is the only active application path identified as
consuming `getPremiumReportAutomationFlags`, and it remains intentionally unchanged in behaviour.
The current internal notification boundary uses the internal audience/provider boundary and does
not depend on Phase 14 AI-generation authority. Comprehensive uses its certified generation
contract and does not load the legacy flags.

## Retirement disposition

No Phase 14 control was enabled, disabled, dropped or rewritten. Historical controls and their
tests remain discoverable for a later forward migration. The bounded integration proof covers the
current Comprehensive non-dependency and preserves Essential compatibility.
