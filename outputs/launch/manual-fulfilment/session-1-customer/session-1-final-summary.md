# Session 1 continuation — summary

## Completed
**Job 1 — retired review model removed.** See `retired-review-panel-removal.md`. State
dependencies checked first; the download path is independent of reviewer state and untouched.
Copy gate now GREEN across 8 surfaces.

## Not completed
Jobs 2–6 — the desktop questionnaire walk, completion transition, snapshot, product comparison,
order creation, duplicate-protection testing, manual payment instruction quality, and the entire
390px mobile journey.

These remain **UNVERIFIED**. They are not blockers; they are untested.

## Provider usage
Snapshot narrative calls: **0**. The snapshot page was not opened this session, so no narrative
call was spent. Report calls: 0.

## Payment observation (partial, not a verdict)
The order surface shows a payment-instructions block, a payment reference equal to the order
reference, and *"MK confirms payment manually before any deliverable is released."* On the
zero-value owner-acceptance orders it renders *"EFT instructions are not available for this order"*,
which is correct for a R0 record but means the populated instruction path — beneficiary, bank,
amount, VAT treatment — has **not** been observed on a real priced order. No verdict is offered.
