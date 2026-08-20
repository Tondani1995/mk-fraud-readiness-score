# Retired reviewed-engagement panel — removal

`src/components/comprehensive/CustomerOrderStatusWorkspace.tsx`

## What was showing to Comprehensive customers
- **Comprehensive engagement status** — Stage · **Reviewer: Named reviewer assigned / Awaiting
  reviewer assignment** · **Evidence reviewed: n of n** · **Sign-off: Complete / Pending**
- **Submit requested evidence** — file upload, with success copy *"The named reviewer will record
  its validation state."*
- **Evidence submitted** — per-item validation status and *"Reviewer note: …"*

All of it describes the reviewed-engagement model retired in C1. A buyer of the automated
Comprehensive was told a named reviewer was assigned and sign-off was pending for work that is not
part of the product.

## State-dependency check performed before deleting
The **Released Comprehensive package** download card is gated on
`comprehensive.customerAccessToken && comprehensive.releasedArtifacts.length` — it does not read
reviewer state, evidence counts or sign-off. Removing the three retired cards therefore cannot
affect generation, download, delivery or payment eligibility. That card was left untouched.

## What replaced it
- **Your report** — Report: *Ready — download below* / *Being prepared*; Delivery: sent to the
  delivery email held for the order.
- **Independent validation** — states plainly that the report is automated, does not independently
  validate evidence, test operating effectiveness or give an assurance opinion, and that independent
  validation is available **separately through MK Advisory** — the cross-sell framing the mandate
  permits, clearly not underway for this order.

The now-unreachable `uploadEvidence()` function and its `file` / `label` state were deleted rather
than left as dead code.

## Verification
- Typecheck: 0 errors
- Copy gate: **GREEN**, 8 surfaces, 12/12 negative controls, 5/5 positive
- Named reviewer / reviewer assignment / evidence reviewed / sign-off / evidence upload: **0 customer references**

**Limitation:** the available owner-acceptance orders are Essential-product-backed, so the
Comprehensive-specific block does not render for them and the removal could not be observed in a
live Comprehensive state in the browser. Verified by gate and typecheck, not by eye.
