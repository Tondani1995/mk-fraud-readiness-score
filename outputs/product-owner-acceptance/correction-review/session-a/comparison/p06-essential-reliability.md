# P06 Essential Reliability — 4 independent generations

Root cause (fixed in cff25d5): the implementation chapter was titled "First 90 days and
management conclusion" and the CONCLUSION slot was granted every roadmap fact plus that
chapter's 30/60/90 takeaway. Two slots were contracted to write the same close, and the
exact-sentence check fired whenever they independently matched — a coin flip.

| Attempt | Result | Calls | Repairs | Tokens | Cost | Time | Pages | Layout |
|---|---|---|---|---|---|---|---|---|
| 1 | **PASS** | 9 | 5 | 79,956 | $0.0385 | 152s | 8 | 0 failures |
| 2 | **PASS** | 9 | 2 | 61,563 | $0.0225 | 126s | 8 | 0 failures |
| 3 | **PASS** | 9 | 2 | 64,119 | $0.0239 | 142s | 8 | 0 failures |
| 4 | **PASS** | 9 | 0 | 50,675 | $0.0163 | 113s | 8 | 0 failures |

**Delivered 4/4. No failed-closed generation.**

## Deterministic equality
Score 40.71, maturity Developing, mode REMEDIATION in all four. Every domain score
(5.71, 18.67, 25.88, 33.33, 33.89, 35.90, 37.71, 49.33, 70.48, 72.35) present in all four.
Roadmap windows identical in all four (2×30 days, 1×60 days, 2×90 days).
**Deterministic differences: 0.**

## The specific defect
Repeated long sentences per report: **0, 0, 0, 0.** The failure mode that produced
"Bounded manuscript failed closed: Repeated sentence overlap detected" did not recur.

Repair counts fell across the run (5 → 2 → 2 → 0), consistent with removing an authorised
duplication the writer previously had to be repaired out of.
