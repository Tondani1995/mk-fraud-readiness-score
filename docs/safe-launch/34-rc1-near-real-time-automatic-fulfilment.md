# RC1 Near-Real-Time Automatic Fulfilment

**Status:** RC1 TECHNICAL BASE: **ACCEPTED** at
`6550c05fe866a1880f4fe6e21b8ef2baa43301a8`; RC1 NEAR-REAL-TIME AUTOMATIC
FULFILMENT: **CONTROLLER REVIEW REQUIRED**; RC1 OPERATIONAL READINESS:
**NO-GO**; RC MIGRATION/DEPLOYMENT: **NO-GO**; CLOUD CERTIFICATION:
**NO-GO**; PUBLIC LAUNCH: **NO-GO**; **DO NOT MERGE**.

This document records the final owner operating decision and the code-only correction implemented
from the accepted technical base. It authorises no cloud or Production action.

## Launch operating model

The launch model is **manual payment verification + automatic near-real-time generation and
delivery + manual exception management**.

1. The customer submits an order. Order submission alone does not start fulfilment.
2. `admin@mkfraud.co.za` receives the new-order notification.
3. Tondani Netili independently verifies payment and marks the order paid.
4. The payment transaction commits exactly one durable fulfilment attempt and returns its technical
   attempt ID.
5. The application returns the payment response promptly and uses `waitUntil()` to invoke the
   existing authenticated worker on the exact deployment with only the attempt ID and a technical
   correlation reference.
6. The worker transactionally claims that exact attempt, generates and validates the report, uploads
   the PDF to private Storage, and verifies checksum, size and read-back evidence.
7. A service-role-only transaction automatically releases the report only after every payment,
   score, relationship, entitlement, commercial-quality, Storage, current-version, recipient and
   suppression gate passes.
8. That transaction creates exactly one report-ready email event and one delivery authorisation.
9. The same worker invocation claims that exact authorisation, issues one secure access token,
   sends the report-ready email through the shared delivery implementation, and finalises delivery.
10. Any failed gate is held in an existing exception/retry state and surfaced operationally to
    `admin@mkfraud.co.za`.

Marking the order paid is the final routine human approval. Routine operation does not require
**Generate Report**, **Approve for Delivery**, or **Send Approved Report** clicks. Existing human
approve, reject, retry, recovery and recipient-correction controls remain available for exceptions.

## Immediate processing and recovery

Immediate exact-attempt dispatch is the primary processor. The existing Vercel Cron Job remains
enabled at its once-daily Hobby-compatible cadence as delayed recovery for a failed dispatch,
function interruption, expired lease, retry-eligible provider failure or other stranded eligible
work. Hobby cron cannot itself provide near-real-time processing. A future Vercel Pro upgrade may
permit minute-level recovery scheduling, but that upgrade and cadence change are not required for
this launch path and are not authorised by this correction.

A failed immediate HTTP dispatch cannot roll back the already committed payment or remove the
durable queued attempt. Dispatch start, success and failure are recorded with technical evidence.
The bearer secret and Authorization header are never included in payloads, logs or responses.

## Fail-closed automatic release

Automatic release is limited to a worker-owned, unexpired completed attempt whose exact
attempt/report/order/assessment/score relationship is valid. It also requires:

- verified `PAID` payment and `payment_received` order state;
- an identified verifier and verification timestamp;
- the locked completed current score;
- a generated current report with no competing current report;
- commercial-quality completion evidence;
- verified private-Storage bucket/path, PDF MIME type, checksum, positive size and read-back;
- a matching delivery entitlement;
- a present eligible recipient with no bounce/complaint suppression.

Failure creates no customer delivery. The attempt is held for manual review or failure recovery,
or the authorisation enters `retry_scheduled`, `failed_terminal` or
`reconciliation_required` as appropriate. Provider acceptance followed by finalisation failure is
never blindly resent; it requires reconciliation.

## Certification SLOs

The synthetic certification targets are operational SLOs, not customer promises:

- payment-to-worker-dispatch start: under 10 seconds;
- payment-to-report-ready: under 2 minutes;
- payment-to-provider-accepted and payment-to-delivered-record: under 3 minutes;
- terminal/manual-review condition to exception alert: under 1 minute.

The disposable 43-migration harness proves these thresholds under normal synthetic local
conditions. Real provider and Production timing still require a separately authorised controlled
certification and remain part of CLOUD CERTIFICATION **NO-GO**.

## Payment-provider position

No Stitch integration is required for this launch path. When Stitch is later integrated, its
verified payment event replaces the owner's manual payment verification step and reuses this same
durable downstream fulfilment, release, delivery, retry and exception process.

## Code-only evidence

Implementation commit:
`ff3a0aefa2abfec2dbcda2d5626eb9f0a5a3c109`, whose direct parent is the locked accepted base
`6550c05fe866a1880f4fe6e21b8ef2baa43301a8`.

The additive migration is
`20260728120000_rc1_near_real_time_automatic_fulfilment.sql`, SHA-256
`f98bb7f5187da6f2f06de88d8e69f34877e8e9c3274967e6a8989624cb630668`.
No accepted migration was modified.

Local synthetic evidence includes:

- the dedicated 24-check near-real-time suite;
- the full 43-migration pre/postflight replay;
- exact-attempt and exact-delivery isolation;
- duplicate-payment, duplicate-invocation, report, authorisation, event, token and provider-send
  prevention;
- commercial-quality, Storage, recipient, provider and reconciliation failure paths;
- immediate and scheduled freeze blocking;
- unchanged protected 18-order synthetic fixtures;
- accepted seven-behaviour-migration checksum protection;
- lint, type checking and the production build.

All six exact-head GitHub workflow results are required before controller review can accept this
correction. No earlier-head result is transferable.
