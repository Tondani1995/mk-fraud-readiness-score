# Final manual-launch certification

One end-to-end pass on Staging. Non-commercial order `MKORD-2026-30828BF2` (Comprehensive,
R35 000,00, Aurelia Financial Services — an owner-acceptance persona, not a customer).

## Journey tested

**Customer — created through the real UI/API, not SQL**
- Comprehensive order created: `MKORD-2026-30828BF2`, R35 000,00 ZAR, `awaiting_payment`
- Payment reference = order reference
- EFT instructions render in full: bank, account holder, account number, branch code, currency,
  account type, reference guidance, customer instruction
- Post-order workspace shows order, price, plain-English payment state, report state, delivery,
  and the Advisory framing for independent validation
- 390px: **0 horizontal overflow**, prices and bank details readable, MK branding intact

**Duplicate protection** — three identical POSTs returned `created: false` with the same order
reference. Idempotent; one payable order.

**Security minimum**
- `/score/admin`, `/score/admin/orders`, `/score/admin/orders/[ref]` all 307 to login unauthenticated
- One customer's snapshot token against another assessment: **denied**
- Bare order reference without token: **redirected**

## P0 fixed
None found in this pass.

## P1 fixed
**Payment reference was not shown to the customer.** The row rendered the profile's instruction
text *instead of* the reference, so a customer following the page had no reference to quote and MK
had nothing to reconcile against. Now shows `MKORD-2026-30828BF2` first, with the guidance beneath.

## P0 — OPEN, owner action (not a code defect)
**The real EFT profile is inactive.** `eft_settings` holds two rows: the real FNB / MK Fraud
Insights / branch 250655 profile with `is_active: false`, and a "STAGING TEST BANK — DO NOT PAY"
profile that is active. Correct for staging. **Before the first real customer, the FNB profile must
be activated in Production**, otherwise either no order can be created (the order service refuses to
create one without instructions) or the customer is shown test details.

## Could not verify — admin session is owner-gated
The MK operator journey (find order → confirm payment → generate → feedback → download → recipient →
delivery email → mark delivered) **was not executed**. Admin authentication requires a credential
this agent cannot obtain.

Verified only that the controls exist in the admin application: *Download Report*, *Payment status
update*, *Retry Generation*, *Retry Delivery*, copy-to-clipboard affordances, and a delivery email
template (`report-delivery-service-core.ts`, subject *"Your MK Fraud Readiness Report — [organisation]"*).
Whether they work end-to-end is untested.

## Also not walked this pass
Assessment questionnaire, completion transition, Snapshot page, product comparison surface. Snapshot
narrative calls spent: **0** — the one permitted call was not needed and not used.

## P2 backlog — recorded, not fixed
- Order page shows the assessment reference only indirectly; useful for support.
- `product_name` on SQL-seeded owner-acceptance orders reads "OWNER ACCEPTANCE - NON-COMMERCIAL"
  rather than the tier; cosmetic, affects test rows only.
- Dev server terminated mid-run and required a restart; environment, not product.

## Verdict
Customer purchase path and safety minimum are proven. The operator fulfilment half is unproven, and
the production EFT profile is inactive.
