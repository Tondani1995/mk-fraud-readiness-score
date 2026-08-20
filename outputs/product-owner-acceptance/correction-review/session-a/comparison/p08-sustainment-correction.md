# P08 Aurelia — Sustainment Correction

## The contradiction found in owner review
The previous P08 Essential said, on one page:
> Fraud risk is **not yet managed** through a repeatable cycle of ownership, assessment and review.

and on another:
> **These are not weaknesses.** Each one is a capability the assessment shows is working.

## Cause
`DIAGNOSTIC_PATTERNS[].whyItMatters` was a fixed absence claim applied regardless of the
assessed state. Every diagnostic pattern now carries `whyItMattersWhenOperating`, selected
when every contributing domain is Structured or better.

## Result — new P08 Essential
- Absence claims ("not yet managed", "does not exist", "is not in place", "no repeatable"): **0**
- "These are not weaknesses." — still present, correctly, as the drift exhibit's own denial
- Score 66.82, Structured, SUSTAINMENT, 8 pages, 0 layout failures
- 14 calls, 5 repairs, 81,205 tokens, $0.0427, 198s

**The specific owner-review contradiction is removed. No manufactured weakness. The word
"weakness" is not banned — only an unsupported absence claim about an operating capability.**
