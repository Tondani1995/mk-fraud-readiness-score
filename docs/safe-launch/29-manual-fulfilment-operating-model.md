# RC1 Manual Fulfilment Operating Model

**Status:** Proposed operating model; RC1 OPERATIONAL READINESS remains IN PROGRESS and RC
MIGRATION/DEPLOYMENT remains **NO-GO**.

**Named owner:** Tondani Netili. **Technical executor:** Codex only under the approved runbook and
explicit owner/controller approval. This model does not change Vercel billing, cron configuration,
Production, Resend or the cloud migration ledger.

## Operating cadence

- Queue checks occur at **09:00, 13:00 and 17:00 SAST on business days**.
- An additional check occurs immediately after each manual payment confirmation.
- Target: generation, quality review and delivery within **four business hours** of confirmed payment.
- Provider mode remains disabled unless a separately approved controlled certification requires a
  disposable test mode.
- No automatic customer delivery occurs until quality approval and recipient confirmation.
- No raw `CRON_SECRET` handling occurs in ordinary operations.

## Required operating procedure

1. Review the non-PII queue through supported admin controls.
2. Confirm the order's owner-approved action in the external 18-order register before any claim.
3. Protect `CURRENT_VERIFIED` orders from regeneration and duplicate delivery.
4. For `CURRENT_NOT_STORED`, use controlled regeneration as a new version by default, or use an
   individually approved recovery path; preserve prior metadata and supersede rather than overwrite.
5. For `NO_REPORT`, confirm legitimacy and completed assessment and approve first generation
   individually through the Release A flow.
6. Use the supported admin generation, review, delivery and correction controls; never issue raw SQL
   updates for fulfilment state.
7. Record every retry, recovery, quality-review and delivery action in the supported audit path.
8. Verify the recipient separately before delivery.
9. Escalate an unresolved critical alert or failed generation immediately to Tondani Netili.
10. Close each check with aggregate counts and no-duplicate/no-unexpected-event verification.

## Absence cover and escalation

Tondani Netili must name an approved absence-cover operator before the model starts. The substitute
may execute only the same supported controls and must be recorded in the owner approval record; it
may not alter the model, approve a new canary, release the freeze or approve forward repair.

If a scheduled check is missed:

- record the missed checkpoint and reason;
- do not compensate by bulk-claiming or bulk-generating;
- notify Tondani Netili immediately;
- perform an aggregate queue/status review before the next action;
- escalate any critical alert, lease, duplicate or unexpected delivery event immediately.

## Daily reconciliation

At the end of each business day, retain an anonymised record of: checks completed, counts by
classification, owner-approved actions completed, generation/review/delivery totals, retries,
recoveries, open critical alerts, worker claims, provider events and exceptions. Do not record order
references, organisation names, email addresses, report contents, access tokens or secret values in
git or ordinary evidence.

## When this model becomes inadequate

The model is inadequate and a higher worker cadence or Vercel plan change must be approved before
continuing when any of the following occurs:

- the four-business-hour target cannot be met at two consecutive checks;
- queue volume exceeds the owner's verified manual capacity;
- critical alerts cannot be reviewed immediately;
- a worker lease, duplicate generation or delivery race is observed;
- webhook volume requires near-real-time handling;
- absence cover is unavailable;
- manual checks repeatedly miss their scheduled time;
- provider certification or customer delivery requires automation that this disabled model cannot
  safely support.

Any cadence or billing change is a separate owner/controller decision. Codex must not change Vercel
configuration or billing as part of this model.
