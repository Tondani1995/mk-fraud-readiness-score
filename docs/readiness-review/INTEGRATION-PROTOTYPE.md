# Integration prototype: MK's direction of 11 November (18:33), as delivered

Continued from local commit `ef1e1ac` on `review/mk-integrated-readiness`. Build 1.6 remains accepted for isolated development only: it is not approved for production scoring, commercial integration or customer release, and nothing here changes that. Every organisation is fictional, every number on the revised side is a labelled test fixture, and no production system, shared preview, database, provider, order, payment, entitlement, product, price or fulfilment path was touched. Nothing has been pushed, merged or deployed.

## The eight items

| # | Direction | What was done | Where | Evidence |
|---|---|---|---|---|
| 1 | Correct the standard assessment interface | Reviewer-based completion removed from the Snapshot, the respondent journey, the management view, the landing page and the public preview. Completion is the self-reported interview plus its outstanding information, shown as four separate statements (interview, function packages, information, report eligibility). Declined, unanswered and "I don't know" answers are always outstanding, never resolved. Advisory records are kept in full in a separate section | `STANDARD-ASSESSMENT-STATUS.md`; `view-model.ts` (`assessmentStatusView`), `report-input.ts`, `SnapshotDocument.tsx`, `ManagementDocument.tsx`, `ReviewInterview.tsx` | Standard-status tests 10 of 10 (SS-01 to SS-10); contract tests 23 of 23; screens 9 of 9 at 1440 and 390px; accessibility scan |
| 2 | Correct methodology dispatch | P-5 withdrawn and its patch deleted; no integrity-guard exception requested. A single entry point resolves the calculator from the assessment's recorded mode, methodology version and graph pin, and fails closed on any mismatch. The protected MFRS scorers and routes are unchanged; the revised calculator stays inactive | `VERSION-DISPATCH.md`; `src/lib/scoring/methodology-dispatch.ts` | Dispatch tests 9 of 9 (VD-04 reproduces the withdrawn defect); parity 8 of 8; integrity guard passes |
| 3 | Allow earlier area delegation | The respondent can hand an area to its function at the area's first question. No screen limit was set | `staged-assessment/delegation/DELEGATION-TIMING.md`; engine `stages()`, `respondentView.areaHandoff` | `timing.json`: at area entry the respondent answers 5 to 22 fewer questions than after the core stage, the organisation's total is the same or lower, no duplicate task, outstanding unchanged; SS-07, SS-08, SS-10 |
| 4 | Keep the five confirmations as candidates | Each tested for scheme semantics, routing and distinctness; none applied. Consistency checks and information-gain selection run only in build 1.6 sessions, which exist only in the fictional harness when explicitly requested. Wording now calls them self-reported cross-checks, states the number cross-checked against the eligible population and concludes nothing about the rest; no score or band moves | `objectives/CANDIDATE-CONFIRMATIONS.md`; `harness.ts` (`reviewEngineBuild`); engine `consistencySummary` | `candidate-confirmations.json`; three hold (one route-conditional), two not recommended |
| 5 | Fictional integration through the existing Essential and Comprehensive architectures | The staged assessment feeds the existing evidence model structure, Fact Pack, story plan, blueprint, thesis, validator, renderers, assembly, management model and registers. Three capabilities were reworked in new files where the existing ones discarded the specifics. Numbers come from an explicitly labelled test fixture | `REPORT-COMPARISON.md` section 1; `src/lib/reports/revised/`; `scripts/revised-reports/` | All four revised Essentials pass the existing validator with no internal identifiers; every page carries the fixture banner |
| 6 | Same organisations before and after | Four fictional organisations reported twice, measured on findings, interpretation, recommendations, blueprint specificity, decisions, traceability and what is not better | `REPORT-COMPARISON.md` sections 2 to 4; `report-comparison/` | `comparison.json`, `report-excerpts.md`, 16 HTML and 16 PDF reports |
| 7 | Verification | Complete Git bundle with manifest in the package; the 65 wider-suite failures reconciled against `3f933ac` and classified; completion, declines, unanswered information, reopening, concurrent saves and multi-function assignments retested; mobile and accessibility checks | `verification/SUITE-FAILURE-RECONCILIATION.md`; `VERIFICATION.md`; the package's `MANIFEST.sha256` | 93 pass and 65 fail; the same 65 fail at `3f933ac`, where `meta-tracking-tests` also fails for want of a production build (corrected 12 November); none caused by this delivery |
| 8 | Release discipline | Revised method inactive; commercial paths unchanged; nothing pushed, merged or deployed; B2, B3, B4, B5, B6, B7, B11 and J-01 open | `RELEASE-DECISION.md`, `DECISION-REGISTER.md` | Integrity guard; `git log` shows local commits only |

## Running the demonstration

The reports are rebuilt from the fictional organisations with one command and rendered to PDF with a second (`REPORT-COMPARISON.md` section 7). The interactive journey runs locally against the fictional harness:

```
export MK_READINESS_REVIEW_HARNESS=fictional-local MK_READINESS_REVIEW_ENGINE=1.6 MK_READINESS_REVIEW_HARNESS_DIR=$PWD/.harness
node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-standard-status-seed.mjs seed.json
npx next build && npx next start
```

The seed file holds the respondent and management tokens for four sessions (complete, outstanding, at area entry and with Advisory records), opened at `/review/s/<token>`; `/review` starts a new one. Without both settings the review track serves build 1.5, and in a production runtime it is off whatever the settings say.

## Did the reports get better?

Yes, on the measures MK set, with the exceptions stated. In every revised Essential each signal names a specific control and what was reported for it (none did before); the overstated organisation, which MFRS rates 88.2 Strategic and whose current Essential calls broadly strong, is now reported as having 21 controls relied on that are not supported in practice, with the cross-check population stated; accountable roles rise from 2 or 3 to 7 to 10 and no roadmap action restates its deliverable; outstanding information is counted and owned instead of absent. In the Comprehensive the scheme portfolio grows from 0 to 3 pathways to 11 or 12 named schemes, findings name the function that answered, control designs start from what the organisation reported and dependencies drive sequencing. What is not better is set out in `REPORT-COMPARISON.md` section 4: the retail Comprehensive grows from 47 to 72 pages, process owners need consolidating to the organisation's roles, the small firm gains specificity rather than volume, and neither side has been through the AI manuscript stage.

## Decisions that block further progress

Only three, from `REPORT-COMPARISON.md` section 6:

| # | Decision for MK |
|---|---|
| R-1 | How a paid report presents a headline figure when the same report finds controls reported in place but unsupported (no penalties or caps, as directed) |
| R-2 | Whether a paid report can be issued with information outstanding, and how much; the interface states report eligibility as not determined until this is set |
| R-3 | The editorial bound on the Comprehensive registers |

The five candidate confirmations, the presentation conventions in `evidence-model.ts` and the status wording need MK's sign-off before customer use, but do not block development. Blockers B2, B3, B4, B5, B6, B7, B11 and J-01 remain open and unchanged.
