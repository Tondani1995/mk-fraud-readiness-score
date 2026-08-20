# Scenario source contract

## One authoritative deterministic presentation

The Fact Pack owns the scenario presentation projection — including the warning-indicator
fallback that the evidence-model objects lack entirely. `assembleComprehensive` now accepts
that projection:

```ts
assembleComprehensive(evidence, { scenarioFacts: pack.scenarios })
```

Both tiers therefore read the same source and cannot diverge in meaning. **There is no
fallback to the evidence-model scenario objects**: omitted, no portfolio is produced, because
a wrong scenario is worse than none.

## Mapping by meaning

| Customer-facing column | Authoritative field |
|---|---|
| How it could begin | `entryPoint` |
| How it could progress | `mechanism` |
| Interruption point | `requiredControlResponse` |
| Warning indicators | `warningIndicators` |
| Traceability | `linkedFindingRefs`, `linkedRiskRefs`, resolved control IDs |

The raw family code is humanised before rendering, so `control_d10_q01` never reaches prose.
Stable IDs appear only in the traceability column.

## Sustainment is a different object, not a relabel

P08's evidence-model scenarios carry `scenarioBasis: "assurance_validation"` and a fraud
sequence opening *"Test whether the self-reported controls would prevent…"*. They are
verification procedures by construction and are **not used**.

The resilience view is built from `sustainmentPriorities`, field for field, and the section is
titled **Control resilience tests** rather than "stress tests" — the methodology supports
dependency failure and a recorded deterioration trigger, not exogenous events, so the heading
promises only what the model contains.
