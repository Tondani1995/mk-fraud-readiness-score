# Scenario semantics — diagnosis (zero provider calls, no code changed)

## What the evidence-model scenario objects actually contain

Runtime inspection of `evidence.scenarios` for P06 and P08:

```
id, scenarioType, scenarioBasis, title, confirmedOperatingContext, entryPoint,
linkedControlWeaknesses, fraudSequence, controlsExpected, concealmentMechanism,
whyControlsMayNotCatchIt, likelyImpact, financialImpact, operationalImpact,
immediateContainment, longerTermResponse, linkedFindingIds, linkedQuestionCodes,
linkedRiskIds, linkedRiskId, evidenceRefs, disclaimer
```

**`earlyWarningIndicators` is undefined on every one of them.** The fact pack references
`source?.earlyWarningIndicators` and falls back to `fallbackWarnings(family)` when absent —
which is why Essential can show real warning indicators and the current Comprehensive column
cannot. My Session B mapping filled that column with `whyControlsMayNotCatchIt` plus
`linkedControlWeaknesses`, which is why it reads as an expected-control description.

## Confirmed defects and their exact sources

| Rendered column | Currently fed by | Why it is wrong |
|---|---|---|
| Warning indicators | `whyControlsMayNotCatchIt` + `linkedControlWeaknesses` | These say *why detection may fail*, not what management would observe. No warning-indicator field exists on these objects. |
| Pathway sub-label | `scenarioType` = `control_d10_q01` | Raw engineering label in customer-facing prose. |
| How it could begin | `entryPoint` = "The recorded control condition is engaged through…" | Phrased as a control condition, not as a beginning. |

Interruption point ← `controlsExpected` is **correct**: that field is the expected control
response, which is what interrupts the pathway.

## P08 stress tests — the owner's suspicion is confirmed by the data

Every P08 scenario carries `scenarioBasis: "assurance_validation"`, and its `fraudSequence`
begins *"Test whether the self-reported controls would prevent, detect and respond…"*.

These are **verification procedures by construction**, not stress conditions. Relabelling
them would be cosmetic.

## The correct deterministic source for real stress tests

`sustainmentPriorities` already carries, per capability:
`dependencies`, `deteriorationTrigger`, `operatingFrequency`, `effectivenessIndicator`,
`proofRetained`.

A genuine Sustainment stress test — stress condition, capability expected to hold, what could
degrade, evidence to inspect, early signal — is derivable from those fields. It should be
built from `sustainmentPriorities`, **not** from the `assurance_validation` scenarios.

That is the fix, and it is grounded rather than invented.
