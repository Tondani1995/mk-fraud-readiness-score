# Session 1 — customer purchase journey

Walked the real Staging journey in the browser at desktop width. Not inferred from source.

## Fixed in this session

**Entry page `/score/start`**
- *"the areas that deserve deeper **MK review**"* → *"…that deserve management attention."*
  A human-review promise on the very first customer screen.
- *"Start with the fraud readiness **health check**"* → *"Start with the free readiness snapshot."*
- *"request the detailed MK report or a fuller **Fraud Health Check**"* → replaced with the approved
  ladder wording. "Fraud Health Check" is not a product; naming the entry point after one confuses
  the customer before they begin.

**Post-purchase `/score/order/[ref]`**
- *"MK will make the report available through the **private access authority** after **quality
  review**."* → *"Once payment is confirmed, MK Fraud Insights prepares your report and sends it to
  the delivery email held for this order."* Removed both an internal term and a false review promise,
  and set an expectation that matches manual fulfilment without exposing that it is manual.
- Header *"A focused view of payment and, for Comprehensive, **evidence-review progress**. **No
  customer portal is created here.**"* → *"Your order, its payment status and what happens next."*

**Copy gate** extended from 5 surfaces to 8, now covering the entry page, the order page and the
customer order workspace. 12 negative controls (every real defect phrase found), 5 positive controls.

Also fixed a defect in the gate itself: the `denial` exemption existed so *"no assurance opinion is
provided"* passes, but it was also excusing internal language that merely contained "no" — which is
how *"**No** customer portal is created here"* escaped. Exemptions now apply only to promise-type
findings, never to internal-language or unapproved-product findings.

## Structural finding
`/score/order/[assessmentRef]` is **not** an order form. It is the post-purchase status workspace and
requires both `token` and `orderReference`, redirecting to the result page otherwise. Order creation
happens from the Snapshot CTA via `/score/api/assessments/[ref]/paid-order`. Access control on both
the order and snapshot surfaces correctly refuses a bare reference without the private token.

## BLOCKER — retired reviewed-engagement panel shown to Comprehensive customers

`src/components/comprehensive/CustomerOrderStatusWorkspace.tsx`

- line 63: *"Evidence uploaded securely. **The named reviewer** will record its validation state."*
- line 94: *"**Reviewer:** Named reviewer assigned / Awaiting reviewer assignment"*
- adjacent: *"Evidence reviewed: n of n"*, *"Sign-off: Complete / Pending"*, plus an evidence upload

This is the retired reviewed-engagement model, migrated away in C1, still rendering to customers. A
Comprehensive buyer would be told a named reviewer is assigned and sign-off is pending for a product
that includes no reviewer, no evidence intake and no sign-off.

**Not fixed here.** Removing the panel is a functional change to a component whose Comprehensive
states I could not exercise in the browser this session, and I would not ship that unverified. The
copy gate is deliberately left **red** on these two lines so the defect cannot pass unnoticed.

## Not covered
Questionnaire UX, completion transition, snapshot conversion pass, product comparison surface, order
creation and duplicate protection, manual payment instruction quality, and the full 390px mobile
journey. **UNVERIFIED**, not passing.
