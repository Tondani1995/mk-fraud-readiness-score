# Customer-experience requirements reconciliation — SHA eb7fef4

## First, a correction the owner needs

**There is no A01–A21 requirement set in this repository, in git history, or anywhere in this
engagement's instructions.** I searched `docs/`, `outputs/`, all markdown, and every commit message.
The only requirements-titled artefact is `docs/safe-launch/31-rc1-go-evidence-requirements.md`, which
is RC1 go-evidence and unrelated.

I have not reconstructed a 21-item list from inference. A fabricated mapping of requirement IDs to
evidence is exactly the kind of artefact that gets trusted for a launch decision and should not exist.
If the A01–A21 set exists outside this repository, provide it and the reconciliation below can be
re-expressed against those IDs in minutes.

What follows reconciles the acceptance criteria actually stated across this engagement's mandates
against the evidence actually produced.

## Carry-forward rule applied

Prior PASS evidence is carried forward where the implementing source has not changed. Verified by
diff, not by assertion.

**Changed since `47ad61b` (accepted final PDF SHA) — 3 files only:**
`score/order/[assessmentRef]/page.tsx`, `score/start/page.tsx`,
`components/comprehensive/CustomerOrderStatusWorkspace.tsx` — all customer-journey copy, all covered
by the green storefront gate.

**`src/lib/snapshot/commercial-insights.ts` is unchanged since its c470f28 verification**, so the
Snapshot's score, maturity, exposure implication and contract evidence carries forward intact.

## PROVEN on current implementation

| Requirement | Evidence |
|---|---|
| Report products frozen, no analytical drift | Essential 11/11; Comprehensive gates green; 0 `src/lib/reports` changes since 47ad61b |
| Snapshot analytics: score, maturity, exposure implication, no false claims | c470f28 live render; implementing file unchanged since |
| Storefront contract: no review/validation/assurance/costed promises | Gate green, 8 surfaces, 12/12 negative, 5/5 positive |
| Retired reviewer/evidence/sign-off model absent | Browser-verified on live Comprehensive order `MKORD-2026-30828BF2` |
| Order creation, correct tier and price | Real API: Comprehensive, R35 000,00 ZAR, `awaiting_payment` |
| EFT instructions complete | Bank, holder, account, branch, currency, type, reference, instruction all render |
| Payment reference visible to customer | Fixed at eb7fef4; shows `MKORD-2026-30828BF2` then guidance |
| Duplicate-order protection | 3 identical POSTs → `created:false`, same reference |
| Post-order state in plain English | "Awaiting manual payment verification"; no raw DB status |
| Admin protected | `/score/admin`, `/orders`, `/orders/[ref]` → 307 to login |
| Cross-customer access denied | P08 token against P06 assessment refused |
| Bare order reference denied | Redirected without token |
| 390px commercial path | Order/payment: 0 horizontal overflow, readable prices and bank details |
| **390px assessment (new this run)** | 0 overflow; progress "0 of 42 applicable controls"; domain context; 56×292px option targets; selection state visible; Back correctly disabled on Q1; Continue/Save 44px |

## GENUINELY UNPROVEN — the complete list

1. **Operator/admin fulfilment journey** — confirm payment → generate → feedback → download → open
   PDF → recipient → delivery email → mark delivered. Requires an owner-authenticated admin session.
   *Known live gap.*
2. **Generation failure preserves order and permits retry** — requires the same admin session.
3. **Full questionnaire completion through all 42 controls, and the completion → Snapshot
   transition.** Entry, progress, navigation and selection are proven this run; the remaining 41
   answers and the hand-off were not walked.
4. **Snapshot page live render at eb7fef4** — `FreeSnapshot.tsx` changed once since its last browser
   render (the "Validate and mobilise" → "Design and mobilise" tagline). Covered by the green gate;
   not re-rendered because doing so spends a provider narrative call for a one-word copy change.

Items 1 and 2 are one owner-authenticated sitting. Items 3 and 4 are minutes of work but 3 needs ~41
more answers and 4 needs authorisation for one narrative call.

## Not a code defect
Production EFT-profile activation is a launch switch: the real FNB profile exists at
`eft_settings.is_active = false` behind an active staging test profile. Treated as such, per owner
direction.
