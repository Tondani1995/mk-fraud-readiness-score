# Essential Reliability — Root Cause (zero provider calls)

## Symptom
P06 Run 1 PASS; P06 Run 2 FAILED CLOSED on identical authoritative input.
`Repeated sentence overlap detected:` three 30/60/90 roadmap sentences.

## Root cause — duplicate narrative responsibility across the IMPLEMENTATION → CONCLUSION edge

`src/lib/reports/narrative/report-blueprint.ts:983` builds one chapter that owns **two** jobs:

```
chapter('FIRST-90-DAYS-CONCLUSION', 6,
  'First 90 days and management conclusion',
  'Sequence the first response and close with one useful management conclusion.',
  'Within 90 days the organisation should have accountable ownership, priority controls
   and a repeatable first operating cycle.', ...)
```

The slot plan then also emits a **separate** `MANAGEMENT-CONCLUSION` slot with `narrativeRole: 'CONCLUSION'`.
Both are anchored on the same `pack.roadmap` fact refs.

Measured across four assessments:

| Order | IMPLEMENTATION slot | roadmap refs | CONCLUSION slot | roadmap refs |
|---|---|---|---|---|
| P06 Nimbus | SLOT-08 **FIRST-90-DAYS-AND-MANAGEMENT-CONCLUSION** | 2 | SLOT-09 MANAGEMENT-CONCLUSION | 1 |
| Rivonia | SLOT-10 **FIRST-90-DAYS-AND-MANAGEMENT-CONCLUSION** | 2 | SLOT-11 MANAGEMENT-CONCLUSION | 1 |
| Kestrel | SLOT-10 **FIRST-90-DAYS-AND-MANAGEMENT-CONCLUSION** | 2 | SLOT-11 MANAGEMENT-CONCLUSION | 1 |
| P08 Aurelia (SUSTAINMENT) | SLOT-13 WHAT-MANAGEMENT-SHOULD-PROTECT-AND-STRENGTHEN | 2 | SLOT-14 MANAGEMENT-CONCLUSION | **0** |

Two slots are contracted to write the closing management conclusion from the same roadmap facts. The
writer complies in both. The exact-sentence duplicate detector
(`bounded-section-engine.ts:953`) fires only when the two independently land on identical phrasing —
which is a coin flip. That is precisely why the same input passes once and fails once.

**It is not a repair-budget problem, and raising repairs would not fix it.** The duplication is
authorised by the contract before any provider call.

SUSTAINMENT is unaffected: its implementation chapter does not claim the conclusion, and its conclusion
slot carries 0 roadmap references. Consistent with P08 Essential passing.

## Indicated fix (NOT applied)
Remove the conclusion responsibility from the `FIRST-90-DAYS-CONCLUSION` chapter so the roadmap chapter
sequences only, and the separate CONCLUSION slot owns the close. The engine already requires the
manuscript to end with an approved CONCLUSION slot, so the closing is not lost.

Not applied in this session — see correction-summary.md.
