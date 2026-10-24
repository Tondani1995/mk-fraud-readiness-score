# MK Fraud Clarity — product intelligence refinement

24 October 2026 · isolated branch `design/mk-management-clarity` · continued from `49378f15`.

**Recommendation: ready for product review and isolated staging verification; not ready for production release.** No merge, deployment, real payment or customer communication was performed. Inter, the institutional identity, management-decision headline, exposure illustration and component architecture are retained.

## What changed

The Snapshot now leads with a connected management view: **recorded domain signal → existing domain interpretation → management implication**. The same relationship stacks vertically on mobile. It replaces generic priority columns and precedes the unranked full-domain view. There is no new chart, score, finding catalogue, fraud-exposure calculation or AI interpretation.

Each priority shows its recorded score and critical-control count. Expandable control statements appear only when the complete trace projection reconciles with stored aggregate/domain counts and valid response/classification metadata. No aggregate major-gap count is assigned to a domain without that evidence. A control carrying both critical and major classifications is listed once with both labels; counts must not be added to claim a unique total.

Supported foundations use the existing strength rule, which is now disclosed. Provisional status is shown with its limitations. Insufficient visibility suppresses priority/strength conclusions and directs attention to existing visibility-gap prompts and verification actions. Domain figures in that state are explicitly descriptive, not a reliable overall readiness position.

The interpretation now states what self-report cannot establish: actual fraud incidence, financial loss, operating effectiveness or independent assurance. Readiness and exposure are separated. The former strongest/weakest comparison no longer invents an operational handover or dependency. Maturity-cap copy no longer asserts that exactly one critical control caused every cap; existing rules can also depend on counts and core-domain scores.

## Why the example was generic

The real private result route builds/validates/caches its narrative before passing it to the component. The visual-review route supplied no narrative and therefore always rendered the component's minimal safe fallback. That explains the generic headline, strength and priority text in the approved synthetic example.

There was also a customer-facing resilience weakness: the same generic fallback can occur after richer narrative validation fails. The new structured management view is independent of that prose layer and remains useful with the safe fallback. The review route now supplies the **existing validated deterministic builder**, with zero AI calls. Validation has not been bypassed.

The original four snapshots are hand-composed layout projections, not reconciled score-engine outputs. For example, the old score-60 sample says Developing without a cap, whereas the executable threshold places 60 at Structured; its unanswered/unknown counts do not explain its illustrative percentages. Its domain weights/scores also do not form a reliable scoring test. Those samples remain available with a prominent warning and a link to calculated cases. Their display values were not silently corrected to pretend they were engine-derived.

## Evidence and existing rules

Authoritative source paths in the source patch/repository:

| Concern | Existing source / rule | Presentation boundary |
|---|---|---|
| Readiness and caps | `src/lib/scoring/adaptive-scoring.ts`, `maturity-band.ts` | Persisted numeric result, band and cap retained. No rescoring in UI. |
| Domain condition | `commercial-insights.ts`: critical count >0 first; otherwise score <40, <60, <80, >=80 | Existing curated finding and implication, explicitly a domain interpretation of self-report. |
| Priority order | Critical count descending, score ascending, domain weight descending, then original order; first three | Same order, including relative maintenance priorities for a strong result. No invented cross-domain dependency. |
| Supported strengths | Score >=70, stored domain coverage >=70%, critical count 0; score/coverage/weight/order sorting; first two | Existing rule disclosed with its coverage limitation. No claim of verified effectiveness. |
| Exact control flag | Applicable trace; critical flag when critical and response <=2; major flag when hard gate and response <=1 | Existing recorded prompt/response/flags only; unique trace identities, scope/unknown/unanswered counts and domain/aggregate flags must reconcile. Missing/drifted traces withhold attribution. |
| Narrative | `narrative.ts` validated deterministic builder and existing customer cache/provider path | Preview uses deterministic validated output. Structured facts do not depend on generated prose. |
| Domain identity | `commercial-insights.ts` content lookup | Historical reused codes with a different domain name now use the existing defensive content rather than importing another domain's interpretation. |
| New projection | `management-view.ts`, `SnapshotManagementView.tsx` | Presentation and integrity checks only; no score or priority rule replacement. |

Five local calculated cases invoke the existing adaptive calculator against the existing V1.2 preview graph. The methodology adapter follows the existing G27 test approach, retaining the graph's weights, core flags, control weights and critical/hard-gate flags. It does not establish that the database's deployed methodology matches this adapter; that is a staging assertion.

| Calculated case | Score / recorded band | Critical / major | Coverage / visibility | Observed consequence |
|---|---|---|---|---|
| Mixed controls | 68.4 / Developing, calculated Structured | 5 / 1 | 100% / 100% | D3 (3 critical gaps) precedes D7 (2), despite D7's lower score. Existing cap lowers the band. |
| Critical controls | 20 / Reactive | 19 / 17 | 100% / 100% | Low recorded responses expose flagged statements; overlapping classifications are not summed. |
| Strong controls | 100 / Strategic | 0 / 0 | 100% / 100% | Supported foundations and maintenance implications; no invented gap or paid-tier necessity. |
| Partial coverage | 60 / Structured, provisional | 0 / 0 | 86.76% / 86.56% | Nine unanswered applicable controls remain visible in domain counts. |
| Visibility limited | Not issued | 0 / 0 | 100% / 50.82% | 34 unknown answers still count as answers; 49.18% unknown weight prevents readiness conclusions. |

Full values and historical recommendation outputs are in `calculated-fixture-evidence.json`. Both the four original fixtures and these five cases were examined. Drift/duplicate trace and mismatched-domain tests confirm that unsupported specificity is withheld.

## Coverage: why 87% can coexist with 100%

For the **existing adaptive calculator**:

- **Assessment coverage** is answered applicable controls / all applicable controls, by count. Unknown is an answer; unanswered is not. The calculated partial example is 59 / 68 = 86.76%, displayed as 87% in the fact strip.
- **Control visibility** is known numeric-response weight / all applicable control weight. It is weight-based, so it need not equal count-based coverage. The same example is 86.56%.
- **Unknown share** is unknown-response weight / all applicable control weight. It is not a count percentage and does not include unanswered weight.
- **Domain scoring-base coverage** is completed known-response weight / known-response weight admitted to that domain's score. The current engine increments both together, so a scored adaptive domain generally reports 100%. Unknown/unanswered responses sit outside this denominator. It is not overall completion and is not evidence that every control is implemented or tested.

The UI preserves those stored measures, labels the domain measure honestly, explains the denominators and adds reconciled known/unknown/unanswered counts per domain. Domain percentages must not be averaged to derive overall coverage. The original illustrative 87/100 sample itself cannot be reconciled because its metrics were composed independently; the new partial case demonstrates the genuine arithmetic distinction. Legacy snapshots without adaptive metrics keep their existing stored coverage presentation; adaptive definitions are not retroactively imposed on them.

## Commercial recommendation audit

`next-step-recommendation.ts` has documented deterministic first-match rules, exercised by its existing boundary tests:

| Rule | Condition | Historical output |
|---|---|---|
| C1 | Insufficient visibility | Speak to MK first; no paid recommendation |
| C2 | Cap applied or >=3 critical gaps | Comprehensive |
| C3 | Reactive and >=6 scored areas | Comprehensive |
| C4 | >=1 critical gap and <=3 gap areas | Essential |
| C5 | No critical gaps; Structured/Strategic | Essential |
| C6 | Developing and >=4 major gaps | Comprehensive |
| C7 | Unknown-weight share >25% (legacy uses N/A rate) | Essential |
| C8 | Otherwise | Essential |

These rules are explainable as code, but no documented validation was found establishing that the thresholds imply a structural rebuild or an objectively necessary higher-priced product. Some historical reasons made precisely that inference. Reproducibility alone is insufficient support for the designation.

The customer UI therefore uses a neutral scope comparison, fixed Essential/Comprehensive order and no “Best fit” badge or score-driven paid-tier reason. Essential supports diagnosis and immediate priorities; Comprehensive adds target-state design and an implementation programme. Both remain freely selectable. Insufficient visibility still prompts clarification before commissioning analysis. Earlier customer selection can still be shown. The historical rule function remains intact for compatibility/audit; its purchasing inference is not presented as advice.

Catalogue prices (**R7,500 / R35,000 incl. VAT**), features, order URLs, token binding, tracking, idempotency and transaction code are preserved. No assurance entitlement was added.

## Manual mobile and accessibility findings

Desktop-browser viewports: 320×740 and 375×812; desktop 1440×1000. The real assessment component was tested with a clearly labelled dev-only in-memory transport. It cannot submit assessments and has no network or durable save. Static review fixtures remain non-mutating.

| Check | Result / limit |
|---|---|
| Selection and progression | Click and Space/arrow selection advanced after simulated acknowledgement; next heading received focus. Added an explicit warning that selecting saves and advances. Real network acknowledgement remains a staging check. |
| Back and long questions | Saved choice retained when returning; long late-stage prompts and all response labels wrapped at 320px. No horizontal overflow. |
| Offline/retry | Failed selection stayed selected; alert and retry visible. Enter on retry recovered and advanced. |
| Save conflict | Current saved state restored. Fixed the previous disappearance of the explanatory message; unsaved selection is now clearly identified as not applied. Failed reload retains its recovery error. |
| Scope dialog | Initial focus on “Keep current answer”; Shift+Tab wrapped to the final action; Escape cancelled, restored saved state and returned focus. This exercised the actual modal with a synthetic response, not backend invalidation. |
| Review/submission | Last question reached review; preview submit visibly states it does not submit. Real completion/private-token issuance not exercised. |
| Snapshot actions/menu | Fixed ineffective sticky positioning to a contextual fixed bottom action; confirmed it appears after the hero, activates by keyboard and hides at product choices. Menu Escape restored trigger focus. Footer clearance added. |
| Invoice branch/focus | At 320px, sticky total/Confirm remained visible; Tab/Shift+Tab reached final field and Back; Yes/No toggled the invoice fields without losing layout. No live order confirmation. |
| ARIA incomplete | `.system-selector` had an `aria-label` without a supported role. Added `role="group"`; the final scans no longer flag that incomplete item. |
| Contrast incomplete | Removed faint Snapshot pseudo-grid that obscured background determination. Remaining SVG-text overlap/non-text-symbol and exposure-grid items were investigated using resolved CSS and alpha composition. Flagged text pairs met their thresholds (minimum measured 7.53:1). This is CSS-composition evidence, not raster sampling or a full accessibility certification. |
| Automated scans | 24 final axe WCAG A/AA-tag scans, across eight pages and 320/375/1440px: zero violations, zero detected horizontal overflow, no visible text below 12px. Remaining contrast incomplete checks are retained in the raw report. |
| Still outstanding | Real iOS/Android keyboard/viewport behaviour; VoiceOver/TalkBack/NVDA speech and reading order; browser/device combinations; high zoom/forced colours and reduced-motion verification; real asynchronous backend recovery. |

## Validation and release gate

21 targeted test commands pass, including consent, legacy scoring/Snapshot, commercial contracts, graph/scoring/correction, launch/security/privacy, presentation contracts, all historical recommendation boundaries and the new management projection cases. Two earlier source-string assertions expected the replaced generic columns; they were updated to require the grounded view. TypeScript and the full Next.js build pass, including lint and static generation. The build retains pre-existing warnings about moved Next.js configuration keys and the missing Sentry global error handler; these are recorded in the build log.

The **staging verification matrix** contains ordered procedures, API payloads, expected assertions and exact evidence requirements for assessment creation, branching, save/resume, completion, private results, both orders, payment failures/confirmation, report generation, private delivery and recovery. The accompanying executable evidence gate intentionally exits 2 until every required result and environment binding is supplied. It is an evidence checker, not an end-to-end test runner or automatic certification.

Production remains **NO-GO** until the isolated staging identity/activation and non-chargeable provider controls are proven, the uncertainty-policy metadata discrepancy is resolved, the full matrix passes on the exact candidate commit, and assistive/mobile-device checks are completed. No score, payment or delivery control should be weakened to clear that gate.
