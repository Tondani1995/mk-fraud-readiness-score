# Legacy unknown-response scoring discrepancy

Status: **mapped, not resolved.** The policy is an owner-reserved decision (AGENTS.md). Nothing in `src/lib/scoring`, `src/lib/adaptive`, `src/lib/reports` or `src/lib/snapshot` differs from the parked commit `75451fc6`; `git diff 75451fc6 HEAD -- src/lib/scoring src/lib/adaptive src/lib/reports src/lib/snapshot` is empty.

## The three sources that disagree

| Source | What it says or does |
|---|---|
| `src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json` line 50, `uncertaintyOption.excludedFromDenominatorRule: "never"` | Documents that "I don't know" stays in the scored denominator with zero credit. |
| `src/lib/scoring/adaptive-scoring.ts`, `calculateAdaptiveReadinessScore` | Gives an unknown answer no numeric value and leaves it out of both sums, so numeric readiness uses known answers only. Unknown weight is tracked separately as uncertainty. |
| `src/lib/scoring/adaptive-scoring.ts` line 294 | When unknown weight is 20% or more and under 30%, stores the limitation sentence "Unknown responses remain within the scored denominator and limit comparability." That sentence describes the metadata, not the calculation. |

The current calculator is known-only, with a provisional status from 20% unknown weight and overall readiness withheld from 30%, and the sentence it attaches to provisional results says the opposite. Which behaviour each issued result used depends on the calculator version that produced it; historical versions were not inspected for this review.

## Where the sentence reaches people

`limitationReasons` from the calculator flows into these outputs unchanged:

| Output | Path | How it is shown |
|---|---|---|
| Free scored Snapshot page | `src/components/assessment/SnapshotResult.tsx` lines 85 and 144 to 150 | Listed as limitations under the score. |
| Snapshot management view | `src/components/clarity/SnapshotManagementView.tsx` line 46 | Joined into the "Provisional position" notice. |
| Free Snapshot assembly | `src/lib/snapshot/free-snapshot.ts` line 115 | Copied from stored explainability into the Snapshot model. |
| Paid report data | `src/lib/reports/assemble-report-data.ts` line 221 | Copied into the report data for Essential and Comprehensive. |
| Comprehensive scope section | `src/lib/reports/comprehensive/assessment-scope.ts` lines 20, 35 and 94 | Rendered in the assessment scope section when present. |
| PDF report template | `src/lib/reports/templates/report-template.ts` line 295 | "Visibility limitations:" paragraph. |
| Report narrative inputs | `src/lib/reports/narrative/fact-pack.ts` lines 1594 and 1629 | Added to `uncertaintyFacts`, which the narrative is built from. |

So a provisional scored result can show a known-only score beside a sentence saying unknown answers were inside the denominator, on screen and in a paid PDF.

## What the arithmetic difference is

Ten equal-weight controls, every known answer worth 80/100 (worked example from the parked release-readiness review, which ran the unchanged calculator; not re-run for this review):

| Answers | Known-only (executable) | Zero credit (metadata) | Current status |
|---|---:|---:|---|
| 10 known | 80 | 80 | normal |
| 9 known, 1 unknown | 80 | 72 | normal |
| 8 known, 2 unknown | 80 | 64 | provisional, and the contradictory sentence is attached |
| 7 known, 3 unknown | 80 | 56 | overall withheld |
| 10 unknown | none | 0 | overall withheld |

Unknown weight share is rounded to two decimals before the 20% and 30% comparisons, so cases near a boundary need fixtures once the policy is decided.

## How the review track avoids it, and what it does not settle

The review track calculates no score. "I don't know" sends the question to the accountable function and the item stays open until someone who knows answers; it is never counted as absent or as present. The review track therefore has no denominator to disagree about.

That does not resolve the legacy question. Scored results already issued keep whatever policy and wording they were issued with, and the default build still runs the scored assessment.

## Decisions for MK

1. Which policy defines the scored readiness figure: known-only with visibility gates (the executable behaviour, recommended in the parked review) or zero credit across all applicable controls.
2. The corrected limitation wording, and the metadata correction, once the policy is chosen.
3. Whether a completely unconfirmed core area needs its own visibility restriction.
4. How issued records are treated: keep them under the version they were issued with, issue a narrative correction, or run new versioned results. Nothing should be overwritten or silently regenerated.
5. An aggregate inventory, separately approved, of locked runs with unknown weight between 20% and 30% and of issued documents containing the sentence. No customer record was read for this review, so the affected population is unknown.
