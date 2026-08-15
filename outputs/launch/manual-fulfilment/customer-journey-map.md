# Manual fulfilment — customer journey audit

Audited at SHA `47ad61b1b41b6e46561144f64050ee42d6cf8f73`, clean tree. Read-only: no code changed,
no provider calls, no database writes.

## Headline finding

**The platform is already configured for exactly the launch model the owner has chosen.**
Staging `app_settings` records:

```
v2_phase1_manual_fulfilment   status: manual_only
                              automatic_generation: false
                              automatic_delivery:   false
                              email_provider_mode:  disabled
                              storage_bucket:       generated-reports
v2_phase23_payment_automation provider_mode: disabled
phase14_delivery_policy       premium_report_manual_delivery_enabled: false
                              mfa_enforcement_gate: required_before_production_enablement
```

Manual-only fulfilment is not something to build here — it is the current, deliberate operating
state. The work is to verify the journey around it and align the customer-facing wording.

## Customer-facing routes that exist

| Step | Route |
|---|---|
| Entry | `/score`, `/score/start` |
| Assessment (adaptive) | `/score/adaptive/[assessmentRef]` |
| Assessment (legacy) | `/score/assessment/[assessmentRef]` |
| Result | `/score/assessment/[assessmentRef]/result` |
| Snapshot + tier comparison + CTA | `/score/snapshot/[assessmentRef]` |
| Order | `/score/order/[assessmentRef]` |
| Payment return | `/score/payment/return` |
| Report request | `/score/report/request/[assessmentRef]` |

## Admin console that exists

`/score/admin` with: `orders`, `orders/[orderReference]`, `comprehensive/[orderReference]`,
`assessments`, `reports`, `audit-log`, `operational-alerts`, `enquiries`, `security`,
`settings`, `config/{products,questions,content}`, `backlog-reconciliation`, `login`,
`phase14-activation`.

Fulfilment API surface already present:
`generate-report`, `fulfilment/{approve,reject,retry,recover}`,
`delivery/{retry,reissue-token,correct-recipient,revoke-token}`.

The order-detail page already renders delivery state, delivery history, payment state, payment
status update, a generate action and a delivery-access panel.

## Payment — actual state, not assumed

`src/lib/payments/` contains `payment-capability.ts`, `payment-service.ts`, `payment-operations.ts`,
`payment-verification.ts`, `stitch-adapter.ts`, `fulfilment.ts`.

`getPaymentAutomationCapability()` gates provider payments behind a schema marker plus an RPC
capability probe, and degrades to a documented manual path:

> "Payment automation is not yet activated in this environment. Manual payment recording remains
> available."

Staging has `provider_mode: disabled`, so **payment is currently manual today** — an operator
records payment against the order. That is commercially safe for launch (EFT plus manual
confirmation), and no integration needs to be fabricated. Whether to enable Stitch is a separate
owner decision, not a launch blocker.

## What this audit does NOT yet cover

Steps 3–24 of the mandate — assessment UX hardening, mobile at 390px, snapshot conversion,
comparison surface, order-form duplicate protection, post-purchase confirmation, admin queue
filters, generation feedback, download filename, delivery email pack and templates, delivery
checklist, mark-delivered notes UX, customer comms, support routes, brand pass, domain hygiene,
security verification, failure paths, and the copy/fulfilment gates — plus the five staging
journeys. None of these were inspected in this pass.
