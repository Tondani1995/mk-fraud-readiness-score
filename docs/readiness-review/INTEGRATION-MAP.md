# Integration map

How each part of the rebuilt readiness method reaches a person, and what it reuses from the parked digital experience. Paths are relative to the repository root.

## Layers

```
vendored engine build 1.5 + bank 1.3 + coverage map        src/lib/readiness-review/vendor, data   (pinned by SHA-256)
        │  createReviewEngine (95-screen ceiling)            src/lib/readiness-review/engine.ts
        ▼
session replay and actions                                  src/lib/readiness-review/session.ts
        ▼
views derived from one engine report                        src/lib/readiness-review/view-model.ts, labels.ts
        ▼
service: roles, links, sequence, idempotency                src/lib/readiness-review/service.ts
fictional file store, harness switch, HTTP mapping           store.ts, harness.ts, http.ts
        ▼
API routes                                                  src/app/review/api/**
pages and components                                        src/app/review/**, src/components/readiness-review/**
public site (only when the build selects the review track)  src/lib/website/readiness-track.ts, review-track-copy.ts
```

The legacy scored path (`src/lib/adaptive`, `src/lib/scoring`, `src/lib/snapshot`, `src/lib/reports`, `/score/**`) is a separate stack and is not imported by any review file.

## Concept to surface

| Method concept | Engine and adapter | Route and component | API | Record | Output |
|---|---|---|---|---|---|
| One versioned ruleset | `contract.ts` hashes; `engine.ts` | every review page shows the harness notice; export names the ruleset | `/review/api/s/{t}/export` | `engineSha256`, `bankVersion`, `contractVersion` on the session | export `contract`, `engine`, `bank`, `coverage`, `approval` |
| Profile and applicability | engine `next()` profile phase | `/review/s/{respondent}` → `ReviewInterview`, `ReviewQuestion` | GET/POST `/review/api/s/{t}` | `respondent.answer` | Snapshot "Scope and assumptions" |
| 95-screen respondent limit | `ceiling: 95`; `respondentScreens()` | progress header and context panel ("N / 95 interview screens used"); done screen | `status.screensUsed`, `status.limit` | count of `respondent.answer` | Snapshot status panel; management view |
| Question served is the question answered | `respondent.serve` recorded; `ensureRespondentServed` | page renders `view.step` only | 422 `stale_question` otherwise | `respondent.serve` | none |
| "I don't know" routes to an owner | engine waiting list; `functionOf(owner)` | answer card "I don't know"; area handoff offer | `lastSaved.unknownArea` | `respondent.answer` with `unknown`; `respondent.assignArea` | Snapshot "Waiting for an owner"; owner packages |
| Optional detail (where it falls short, tested, record) | `stepView.detailFor` | detail panel in `ReviewQuestion` | `detail` on `respondent.answer` | stored with the answer | reviewer workspace answer details |
| Answer provenance and versions | engine answer log, `via`, `stale` | Back and "Review or change an answer"; reviewer history | `history[].changeable`; reviewer `answerVersion`, `answerHistory` | `respondent.correct` keeps earlier value | reviewer history; export `report.log` |
| Owner follow-up outside the limit | `nextOwner(fn)`, `ownerReturn` | `/review/s/{owner}` → `OwnerPackage` | owner view | `owner.serve`, `owner.answer` | Snapshot status "further answers came from accountable functions" |
| Send to owners | `planFollowUp` | `SendToOwners` on Snapshot and management view | POST `organisation.sendToOwners` | `organisation.sendToOwners` | owner packages created; links page |
| Evidence state | `setEvidence` | `/review/s/{reviewer}` → `ReviewerWorkspace` form | POST `reviewer.evidence` | `reviewer.evidence` bound to answer version | reviewer queues; management "Needs evidence" |
| Reviewer conclusion and follow-up | `setReview` | same form; follow-up can be saved alone | POST `reviewer.review` | `reviewer.review` bound to answer version | reviewer tasks; management "Who acts next" |
| Re-review after a changed answer | engine `reReview`, `stale` | "Needs re-review" queue; earlier records marked not current | reviewer view | none extra | management finding shows no current conclusion |
| Why a question is waiting | engine assignment origin, `ownerFollowup`, `waiting-scope`, answer log; `waitingProvenance` | Snapshot waiting section and breakdown; management "needs an answer" | snapshot view `waiting[].provenance`, `waitingBySource` | derived from the log | Snapshot, management view, export |
| Reviewer drafts | none (client only) | `ReviewerWorkspace`: drafts per control and answer version, kept in the tab | none until saved | none until saved | none |
| Complete ruleset of a record | `currentRuleset`, `validateRecordRuleset`, `loadedRulesetProblem` | refusal page `ReviewProblem` | 410 `incompatible`, 503 `ruleset_unavailable` | `ruleset` on the session | export `ruleset` |
| Telemetry privacy | `src/lib/monitoring/credential-paths.ts` | `ReviewAnalyticsGuard` in the review layout; full page loads in and out | monitoring intake redacts | none | none |
| Unscored Snapshot | engine `report()` | `/review/s/{t}/snapshot` → `SnapshotDocument` | `/review/api/s/{t}/snapshot` | derived | four counts with denominators and lists |
| Management actions | `managementView` | `/review/s/{management}` → `ManagementDocument` | management view | derived | needs an answer, evidence, remediation; who acts next; completion conditions |
| Public explanation | fixture from the engine | home, Fraud Readiness, methodology (review build only) | none | `fixtures/preview-example.json` | Snapshot preview, journey steps, methodology points |

## What the review track reuses from the parked work

| Reused | From | How |
|---|---|---|
| Instrument shell, area rail, context panel | `assessment-instrument`, `instrument-layout`, `domain-completion`, `assessment-contextual` classes in `src/app/clarity.css` | same classes and `data-adaptive-assessment` scope; new content only (`ReviewAreaPanels.tsx`) |
| Response canvas | `src/components/adaptive/AdaptiveResponseCanvas.tsx` | imported unchanged |
| Question transition | `src/lib/adaptive/question-transition.ts` | `createQuestionTransition`, `waitForQuestionMotion` unchanged |
| Prompt positioning | `src/components/adaptive/question-scroll.ts` | `questionScrollDelta` unchanged |
| Buttons, tokens, Poppins | `src/components/ui`, `tailwind.config.ts` | unchanged |
| Catalogue prices | `src/lib/commercial/storefront-presentation.ts` | `storefrontPriceLabel` only |

## Track selection

| Build | `/score/start` | Public copy | `/review` |
|---|---|---|---|
| Default (no flag) | legacy scored assessment | legacy | not found unless the harness is enabled |
| `NEXT_PUBLIC_MK_READINESS_TRACK=review` | redirects to `/review` | review track | served when `MK_READINESS_REVIEW_HARNESS=fictional-local` |
| Any build with `VERCEL_ENV=production` | as above | as above | always not found |

Issued scored records, reports and orders are read only by the legacy stack and are not migrated, reinterpreted or regenerated.
