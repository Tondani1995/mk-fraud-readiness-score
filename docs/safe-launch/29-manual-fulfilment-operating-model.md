# RC1 Exception-Only Fulfilment Operating Model

**Status:** The previous routine manual generation/review/delivery model is superseded by the final
owner decision in `34-rc1-near-real-time-automatic-fulfilment.md`. RC1 NEAR-REAL-TIME AUTOMATIC
FULFILMENT remains **CONTROLLER REVIEW REQUIRED**; RC1 OPERATIONAL READINESS and RC
MIGRATION/DEPLOYMENT remain **NO-GO**.

**Named owner:** Tondani Netili. **Technical executor:** Codex only under the approved runbook and
explicit owner/controller approval. This model changes no Vercel billing or cron configuration and
authorises no Production, Supabase, Resend or migration-ledger action.

## Routine and exception boundaries

- Tondani independently verifies payment and marks the order paid.
- That payment confirmation commits the durable attempt and starts immediate exact-job dispatch.
- A report that passes every approved gate is automatically released and delivered.
- Routine **Generate Report**, **Approve for Delivery**, and **Send Approved Report** clicks are not
  part of the launch operating model.
- Existing human controls remain available only for held exceptions, authorised retries,
  reconciliation and recipient correction.
- `admin@mkfraud.co.za` receives safe operational exception notifications.
- Customer delivery is expected within minutes under normal conditions; the measured thresholds are
  certification SLOs, not customer promises.
- Provider mode remains disabled until a separately authorised controlled certification.

## Exception procedure

1. Review the safe operational alert and technical reference through supported admin controls.
2. Confirm the affected order's authorised treatment; for any of the existing 18 paid orders, also
   confirm its owner-approved disposition in the restricted external register.
3. Never regenerate or redeliver either `CURRENT_VERIFIED` order.
4. Use only supported retry, recovery, review, reconciliation or recipient-correction controls.
5. For a provider-accepted/finalisation-uncertain delivery, reconcile first and never blindly resend.
6. Preserve current report/version, payment, event and delivery evidence; never issue direct SQL
   state changes.
7. Record the decision and action through the supported audit path.
8. Verify aggregate no-duplicate/no-unexpected-event evidence after the action.
9. Escalate unresolved critical, terminal, suppression or integrity exceptions immediately to
   Tondani Netili.

## Recovery cadence

The existing once-daily Vercel Cron Job remains enabled only as delayed recovery for stranded
eligible work. Immediate post-payment dispatch is the primary processor. Hobby cron cannot provide
near-real-time recovery; a future Pro minute-level recovery cadence is optional, requires separate
approval and is not a launch requirement.

## Absence cover and reconciliation

Tondani Netili must name an approved exception-management absence-cover operator before launch. The
substitute may use only the same supported controls and may not alter the model, approve a canary,
release the freeze or approve forward repair.

Retain anonymised daily counts for successful automatic generation/delivery, retries, recoveries,
open alerts, reconciliation cases and exceptions. Do not place order references, organisation names,
email addresses, report contents, access tokens, signed URLs or secret values in git.

No Stitch integration is required for launch. A later Stitch integration replaces manual payment
verification and reuses the same downstream automatic fulfilment and exception process.
