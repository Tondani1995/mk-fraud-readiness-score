# Commercial reconciliation

The catalogue (`src/lib/commercial/product-catalogue.ts`), storefront presentation, order and entitlement logic and payment code are **unchanged** from `75451fc6`; `git diff 75451fc6 HEAD -- src/lib/commercial src/lib/payments src/app/api supabase` is empty. Prices shown by the review track are read from the catalogue through `storefrontPriceLabel`, never written as literals.

| Tier | Catalogue price | Basis |
|---|---|---|
| Free | R0 | Immediate on-screen Snapshot from the submitted assessment |
| Essential | R7 500 incl. VAT (`ESSENTIAL_PRICE_CENTS = 750_000`; superseded R5 000 kept for older orders) | Automated diagnostic PDF |
| Comprehensive | R35 000 incl. VAT (`COMPREHENSIVE_PRICE_CENTS = 3_500_000`) | Automated in-depth analysis PDF with registers; no evidence validated |
| Advisory | From the catalogue's `priceFromCents`, excl. VAT, scoped per engagement | Manually scoped consulting; evidence validation and reviewer observations belong here |

Each conflict below is specific, says what the candidate does in the meantime, and proposes a change for MK to decide. None is resolved in code.

## 1. Free tier inclusions describe a score

**Conflict.** `FREE.includes` lists "Overall readiness score and maturity position", "Executive interpretation" and "Priority-area preview", and `FREE.summary` says the Snapshot comes "from the submitted assessment". The review Snapshot has no score, maturity position or priority ranking.

**Meanwhile.** The review track's public copy describes the review Snapshot; the catalogue entry is untouched, so any surface that renders `FREE.includes` under the review track would contradict it. The storefront under the review track does not render the Free inclusions.

**Proposed for decision.** Add a separate free entry for the review Snapshot (its own product code; codes are never reused) listing: reported gaps, questions waiting for an owner, material scenarios still open and evidence still to review. Keep `FREE` for the legacy scored Snapshot while that track exists.

## 2. Essential and Comprehensive cannot be produced from a review

**Conflict.** Both paid reports are assembled from a scored assessment run (`src/lib/reports/assemble-report-data.ts` reads the score run, adaptive metrics and gaps). A review session has none of these, so a customer who completes the review has no paid product to buy from it. That removes the free-to-paid path for review customers.

**Meanwhile.** Under the review track the storefront and the Snapshot say plainly that Essential and Comprehensive are produced from the scored assessment and are not available from a review Snapshot while this decision is open. No order can be started from a review session.

**Proposed for decision**, in order of effort:

1. Keep both tracks: the review is free, and a customer who wants a paid report completes the scored assessment as today. Simple, but asks the customer to answer twice and to accept a score MK has moved away from.
2. Route review customers to Advisory only until a review-based report exists. Honest and immediate; narrows the self-service range.
3. Define new, versioned paid products built on the review report (new product codes, report templates, inclusions and prices set by MK). The right end state if the review replaces the scored assessment; needs product, legal and pricing work.

## 3. Owner follow-up is free but uncatalogued

**Conflict.** The review sends "I don't know" questions to accountable functions, who answer outside the 95-screen limit. Candidate copy says this is at no charge. The catalogue's free tier describes only an immediate Snapshot from one submission.

**Proposed for decision.** Confirm owner follow-up as part of the free review (it is what keeps the Snapshot honest instead of guessing), and record it in the new free entry from item 1.

## 4. Evidence review is Advisory work; the free outputs must not imply MK has looked

**Conflict.** The catalogue's Comprehensive note assigns "independent validation of evidence, reviewer observations, sign-off" to Advisory. The review track contains a reviewer workspace, and its management view lists "Evidence still to review". Read without care, a free Snapshot could imply MK will review evidence. Separately, Comprehensive includes "Evidence requirements: what management should hold for each control"; the free review names which controls need evidence but not what that evidence should be.

**Meanwhile.** The Snapshot and management view state "Not reviewed by MK" and that answers are the organisation's own statements unless a reviewer record says otherwise; "Working with MK" describes reviewer conclusions as Advisory, priced from the catalogue.

**Proposed for decision.** (a) Reviewer access is granted only under a scoped Advisory engagement in production. (b) Keep the free outputs to which controls need evidence, leaving what acceptable evidence looks like to paid products.

## 5. Free management actions and Essential's prioritised actions

**Conflict.** Essential sells "Critical weaknesses and false-comfort risks" and "Prioritised management actions and a 30/60/90-day roadmap". The free review management view groups actions by who acts next and lists the reported gaps. It does not prioritise or schedule them, but the boundary is closer than it was.

**Proposed for decision.** Confirm that the free view stays unprioritised (grouped by actor, no ordering by importance, no timeline), and that prioritisation and roadmap remain paid.

## 6. Next-step rules and conversion measurement have no review equivalent

**Conflict.** The legacy next-step rules (`src/lib/snapshot/next-step-recommendation.ts`, C1 to C8) choose Essential or Comprehensive from scores, gaps and unknown share, and the conversion tests and analytics events are built around the scored Snapshot. The review track has no scores and makes no recommendation.

**Meanwhile.** The review Snapshot says it does not recommend a paid engagement and that nothing in it depends on whether one is bought. No conversion event is emitted from review pages.

**Proposed for decision.** Decide whether the review track gives any next-step guidance; if it does, define it from review states (for example, many open material scenarios waiting for owners), not scores, and define the matching analytics events before release.

## 7. Product links into the scored start

**Conflict.** In a review-track build every `/score/start` request redirects to `/review`, including any external link carrying `?product=essential` or `?product=comprehensive` (for example, from earlier campaigns). The buyer's product intent is dropped without explanation. No page in this build renders such a link (`FraudReadinessOptions`, which does, is not used), but links outside the site may.

**Proposed for decision.** When the review track is selected, send product-intent links to the Fraud Readiness products section, which explains availability, instead of the free review.

## 8. Privacy and access claims

**Conflict.** The homepage says "your Snapshot is visible only to your organisation" and the storefront says "No account required". In the review track the reviewer workspace lets an MK reviewer see answers, and owner and reviewer access in production will need sign-in. The fictional harness uses plain links, which are not access control.

**Proposed for decision.** Decide the production access model (who signs in, how owners are invited, when MK reviewers gain access) and then revise both statements for the review track.

## 9. Terms

**Conflict.** The assessment terms (`src/lib/legal/fraud-readiness-terms-content.ts`) refer to the methodology, "scoring rules" and "scoring approach", and were written for one respondent's scored assessment. The review involves several people in the organisation and, under Advisory, MK reviewer records.

**Proposed for decision.** Legal review of the terms and privacy notice for the review track before it is offered to any organisation.

## Preserved without change

- Catalogue prices, product codes, labels, inclusions and the superseded Essential price.
- Order price snapshots and entitlement validation (`order-price-entitlement.ts`).
- Payment verification and fulfilment models.
- The legacy storefront, paid buttons and order journey in default builds.
