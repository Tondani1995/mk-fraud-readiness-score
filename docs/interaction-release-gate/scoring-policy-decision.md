# MK owner decision: unknown responses and readiness denominators

25 October 2026 · **decision pending; executable scoring unchanged**.

## The exact three-way discrepancy

| Source in this checkout | Current statement/behaviour |
|---|---|
| `src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json`, `uncertaintyOption` (also mirrored in `docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json` and the V1 draft) | `uncertaintyTreatment: retained_in_scope_zero_readiness_credit_reported_as_unconfirmed`; `excludedFromDenominatorRule: never`. This describes retaining unknown weight in scope and awarding no numeric readiness credit. |
| `src/lib/scoring/adaptive-scoring.ts`, `calculateAdaptiveReadinessScore` | Unknown has `value=null`. Numerator and denominator contributions are both 0; `accumulator.denominator` and `knownWeight` increase only for a numeric maturity response. A trace records `unknown_response_excluded_from_score_denominator`. Unknown remains applicable and is measured separately as uncertainty. |
| Same calculator, provisional limitation sentence for 20%≤unknown weight share<30% | Stores “Unknown responses remain within the scored denominator and limit comparability.” That sentence contradicts the executable denominator calculation. A report consuming the persisted limitation can therefore describe an included denominator while showing a known-only score. |

The metadata is evidence of a documented intent, not evidence of an owner-approved policy decision. No signed decision resolving this conflict was supplied. It is not safe to silently privilege one text source or to convert unknown to a maturity response of 0.

## Current executable treatment

For a domain, numeric readiness is `Σ(normalised maturity score × known response weight) / Σ(known response weight)`. Unknown contributes 0 to both sums. A numeric 0 response is different: it contributes its weight to the denominator and may trigger a critical/hard-gate rule. Unknown does not itself trigger those numeric gap rules. When no known responses remain, the domain score is null and its contribution is unavailable; the overall aggregation renormalises available scored-domain weights.

Assessment coverage is answered applicable **count** / applicable count, and counts an unknown as answered. Control visibility is known weight / applicable weight. Unknown share is unknown weight / applicable weight. Unknown does not become a deterministic not-applicable exclusion.

Below 20% unknown weight, uncertainty alone does not make a result provisional. At 20–<30%, the current result becomes PROVISIONAL. At ≥30%, it is INSUFFICIENT_VISIBILITY and the overall readiness result is withheld. Other existing integrity, coverage, exclusion and maturity-cap rules can independently affect a result. These thresholds and behaviours have not changed.

## Example calculations

These are isolated arithmetic illustrations within a single domain, not replacement production calculations. All controls in this illustration have weight 1; each known answer is 4/5=80/100. All applicable controls are answered, so unanswered-treatment ambiguity is absent.

| Ten applicable controls | Current known-only denominator | Metadata-described zero-credit denominator | Current unknown visibility gate |
|---|---:|---:|---|
|10 known,0 unknown|800/10=80|800/10=80|NORMAL absent other conditions|
|9 known,1 unknown|720/9=80|720/10=72|10% unknown; no uncertainty-only provisional gate|
|8 known,2 unknown|640/8=80|640/10=64|20% unknown; PROVISIONAL|
|7 known,3 unknown|560/7=80|560/10=56|30% unknown; overall result withheld|
|0 known,10 unknown|null|0/10=0 numerically|100% unknown; overall result withheld|

The right-hand arithmetic assumes only the metadata’s denominator/credit wording. It does **not** approve an issued score, maturity band, gap classification, changed visibility gate or overall aggregation under that interpretation. Those must be decided explicitly. In a real multi-domain assessment, domain weights, distribution of unknowns, missing domains and maturity caps mean the overall change need not equal a simple percentage discount.

## Actual current-calculator observations

`node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/scoring-policy-observations.mjs` executes the unchanged V1.2 graph/calculator using the existing G27 deterministic methodology adapter. All known answers are 4; unknowns replace the first N applicable responses in existing graph order. This is not customer or hosted-methodology data.

| Unknown controls of 68 | Unknown weight | Answer coverage | Known-weight visibility | Current status | Issued score |
|---:|---:|---:|---:|---|---:|
|0|0%|100%|100%|NORMAL|80|
|1|1.97%|100%|98.03%|NORMAL|80|
|14|21.31%|100%|78.69%|PROVISIONAL|80|
|20|31.15%|100%|68.85%|INSUFFICIENT_VISIBILITY|null|
|68|100%|100%|0%|INSUFFICIENT_VISIBILITY|null|

All unknown denominator contributions in these traces are 0. The 14-unknown case reproduces the contradictory stored sentence. Different control weights explain why count shares and weight shares differ. Full JSON is supplied with the decision package.

## Implications for existing reports

Unknown-containing scores may appear higher than a zero-credit-inclusive interpretation; distribution among domains can change comparisons and priorities. A different denominator could cross numeric maturity thresholds or affect caps. All-unknown domains are especially consequential: current null/unavailable treatment and a hypothetical numeric 0 treatment affect available-domain normalisation differently.

Reports may also contain the contradictory limitation sentence, known-only 100% domain scoring-base coverage, and applicable/unknown counts. Locked score rows and issued documents must retain their historical identity and provenance. Correcting narrative without changing a score is distinct from approving a new scoring policy.

The affected customer/report population is **unknown**. No customer records or report artefacts were queried during this task. An approved, access-controlled aggregate inventory is required: graph/calculator version, locked run ID, nonzero unknown weight, status, issued document provenance and whether the contradictory text was rendered. Do not publish identities, private tokens or responses in that inventory.

## Decision required from the MK product owner

1. Approve **known-only numeric readiness plus separate visibility gates**, or approve **unknown retained in the numeric denominator with zero readiness credit**, or provide another formally specified rule. If retaining the current executable treatment, correct metadata and the contradictory limitation sentence under version control.
2. Specify domain/overall treatment when all responses in an area are unknown; behaviour for unanswered applicable controls; the distinction from numeric 0 and gateway exclusions; visibility gates, critical/hard-gate flags, maturity caps, comparisons and management priorities.
3. Approve policy/calculator/graph version identity and acceptance fixtures at 0%, just below 20%,20%, just below 30%,30%, all-unknown-domain and weighted-boundary cases.
4. Decide retrospective handling: retain historical results with clear provenance, issue a narrative correction only, or authorise new versioned score runs/reports. Specify customer-communication and commercial obligations separately. No overwrite, bulk rescore, regeneration or customer notification is authorised by this engineering task.

Recommended decision record: owner/name, approved option and rationale, exact formulas/thresholds, affected versions, acceptance fixtures, effective date, retrospective treatment, report-copy approval and release sign-off. **Release remains blocked on this decision; current scoring is preserved.**
