# Verification report

Verified code commit `2c87d81294666055112bfe015bda961268d82db2` on `review/mk-integrated-readiness`, clean working tree, 10 November 2026. The packaged commit adds only these documents. Every check below ran in one scripted pass (`evidence/results/summary.txt`). Two additions are marked where they appear: three repeats of the browser journeys against the same server after the scripted pass, and the baseline captures, which were taken earlier from a production build of the parked commit `75451fc6` served on the same machine with its preview fixtures enabled.

**Later commits.** `392859e` (report input contract) and `6123de1` (database store) were added on 11 November 2026 and checked separately: type-check 0 errors on each commit, lint unchanged, contract tests 23 of 23, the parked suites 30 of 31 (the same one cannot run here), the browser journeys 22 of 22 and the viewport journeys 12 of 12 on the file store after the service change, and the database checks listed in `DATABASE-DESIGN.md`. The full scripted pass below was not rerun for them.

Conditions throughout: Node 24.22, Next.js 15.5.22 production builds, `next start` on localhost, headless Chromium through Playwright 1.63, the fictional local harness with fault injection enabled. No network path, database, physical device or assistive technology was involved. Fictional role links in the packaged results are replaced with `:token`.

Before this run, three full runs on the corrected code were superseded because each found something to correct: a phone placement defect and a test defect (`951ea06`), a management view without a visible result after sending and fixed waits in the scripts (`e6690fc`), and an accessibility scan taken mid-fade (`deb0aa1`). Each is described in `INDEPENDENT-REVIEW-RESPONSE.md` and kept in `evidence/results/re-verification`.

## Summary

| Layer | Check | Result |
|---|---|---|
| Types and lint | `tsc --noEmit`; `next lint` | 0 errors; 1 warning, pre-existing in the parked `src/components/review/AssessmentBenchmark.tsx` |
| Layering | each of the ten correction commits type-checked on its own | 0 errors on every commit (`layer-check.txt`) |
| Contract | `readiness-review-contract-tests.mjs` | 22 of 22 pass |
| Independent review probes | the reviewer's `independent-probes.mjs` and `privacy-probe.mjs`, unchanged | 16 of 16 concurrent starts, none missing from the index; 0 altered records accepted; synthetic credential retained in 0 checks |
| Analytics privacy | the existing suite | 15 of 15 pass |
| Parked regression suites | the parked branch's 31 suites | 30 pass; 1 cannot run here (same on the parked baseline) |
| Builds | review-track build; default build | both succeed |
| Legacy separation | default build served without the flag or harness | `/score/start` 200 with the legacy start form; `/review` 404; `POST /review/api/sessions` 404; Fraud Readiness page links to `/score/start` and does not mention the review |
| Browser journeys | `readiness-review-browser-journeys.cjs`, 22 journeys | scripted pass: 11 pass, 6 fail, all from one stalled answer in J-01 (below); three repeats on the same server, and the two runs beside the probes: 22 of 22 each |
| Viewport journeys | 12 sizes, answering through the page | 12 of 12 pass |
| Settled motion | movement after the transition reports idle | 0px on 6 transitions |
| Phone placement under load | 180 transitions at 320, 375 and 430px beside a journeys run | 0 prompts out of view; 36 placed again as the transition ended |
| Hydration under load | 60 management view loads beside a journeys run | 1 React #418 (open, release blocker B11) |
| Layout sweep | 11 pages at 11 sizes | 121 loads, 0 non-200, 0 sideways overflow; 2 script errors, both React #418 (B11) |
| Homepage companion | 9 desktop sizes | in view at every stage for all heights from 800px; one-column fallback at 700px height, as in the baseline |
| Accessibility (automated) | axe-core 4.12.1, WCAG 2.0, 2.1 and 2.2 A and AA rules | 48 scans at rest, 26 of them interactive or error states: 0 violations; 13 incomplete results, listed below |
| Performance | median of three loads at 1440px | see below |
| Transition timing | 40 answers with motion, 40 with reduced motion | see below, with median, p90 and p95 |
| Recordings | five paced recordings, before and after | 5 of 5 complete, each with a record of its steps and source commit |

## Contract tests

C-01 ruleset hashes; C-02 full interview to the limit replays identically; C-03 respondent channel never serves owner work; C-04 off-screen answers rejected; C-05 export views equal page views and report fields; C-06 no score, band, confidence or predicted field in any view or export; C-07 mixed routes stored as several modes, `["unknown"]` waits for an owner; C-08 all checks selected is not a gap; C-09 to C-11 the V13 recheck defects through the adapter; C-12 owner continuation after the limit; C-13 an owner's "I don't know" ends the question; C-14 another engine build is refused; C-15 stop, resume and the Snapshot; C-16 retry applied once, stale sequence conflict, failed save stores nothing; C-17 role-scoped links; C-18 the public preview is what the engine produces and carries no score.

Added for the independent review: C-19 every waiting item's stated reason matches the action log before dispatch, after dispatch and after owner answers (F1); C-20 24 concurrent starts all resolvable after a restart, no leftover temporary or lock files, an injected index failure leaves no orphan, a damaged index is reported and left untouched, an append race has one winner (F2); C-21 11 of 11 altered records refused and a real contract 1.2.0 record replayed to the identical report digest (F4); C-22 a synthetic credential passed through every telemetry boundary, including the inline analytics bootstrap run against the TypeScript sanitiser, survives in none (F3). Details in `contract-results.json`.

## Parked regression suites

30 of 31 exit 0, the same set as on the parked baseline. `scripts/recovery-postgres-tests.mjs` fails before any test runs: the embedded PostgreSQL `initdb` cannot be executed in this environment (permission denied with install scripts skipped; when made executable it needs `libicuuc.so.60`, which is absent, and it refuses to run as root). Its result is unknown, not passed. `scripts/spatial-integrity-tests.mjs` passes with three reviewed exceptions pinned by SHA-256 (the F3 changes to monitoring privacy, the Sentry scrubber and the analytics URL sanitiser); every other protected file still matches the baseline byte for byte.

## Browser journeys (desktop 1280px, phone 390px, plus 320, 375, 430 and 640px)

| ID | What it proves | Observed (first repeat) |
|---|---|---|
| J-01 | Orientation explains the limit and the handoff; 95 answers through the page; stop at the limit | first question PR-01; 95 screens; stopped at the limit |
| J-02 | Mixed routes chosen on the page are stored as several modes | D5-G-01 and D6-S-02 each stored with two modes |
| J-03 | An unknown profile fact keeps FS-D1-07 open | shown as route-incomplete |
| J-04 | Snapshot page, API and export counts identical and equal to the report | 9 reported gaps, 7 waiting, 43 open scenarios, 47 evidence items in all three |
| J-05 | No score, rating, maturity level or confidence on the Snapshot | none found in rendered text |
| J-06 | After the limit, the owner answers on its own page; a newly opened confirmation follows; respondent screens stay at 95 | PR-06 then D1-L-04 and three more; screens 95 before and after |
| J-07 | Once the owner settles the fact, FS-D1-07 is no longer held open | settled |
| J-20 | Every waiting item on the Snapshot page states its reason, matching the recorded answers and assignments (F1) | 41 items, all "not reached in the interview"; none mismatched; no "I don't know" claimed without one |
| J-08 | A confirmed review with a follow-up and a follow-up alone both become reviewer tasks and management actions | two tasks, two MK reviewer actions |
| J-09 | A reviewer save with nothing to record shows a message and stores nothing | sequence unchanged |
| J-10 | After the respondent changes a reviewed answer, the earlier confirmation is not current and new insufficient evidence does not revive it | not current; no conclusion or follow-up carried |
| J-11 | Reviewer history keeps the earlier version, value and follow-up | present |
| J-21 | Reviewer drafts survive control and queue switches, reload, a forced 503 and a real conflict; discarding asks first; a draft for a changed answer is shown apart and used only on request (F5) | all held |
| J-12 | A failed save keeps the selection, says nothing was recorded, and a retry saves once | one stored entry |
| J-13 | Back shows the saved answer selected; a change is recorded and the interview continues | correct |
| J-14 | Stop is resumable; resume returns to a question | correct |
| J-15 | At 320, 375 and 430px the next prompt is in view and focused after each transition, with no sideways scroll | all in view and focused |
| J-16 | Keyboard answer with reduced motion at 640px (1280px at 200% zoom) | saved, advanced, prompt focused, no sideways scroll |
| J-17 | Unknown links 404; a stale write 409 | correct |
| J-22 | Client errors on review pages reach monitoring with route templates only, nothing goes to another host, no referrer (F3) | 2 posts, routes `/review/s/:token` and `/review/s/:token/snapshot`; 0 carrying a role link; 0 requests to other hosts |
| J-19 | Instrument geometry: rail, card and context at 1280px; full-width card at 390px | rail 160, card 812, context 220; phone card 366 |
| J-18 | No script errors during the journeys, each captured error named with its journey and page | none |

**The stalled answer in the scripted pass.** At the 30th respondent screen (D4-T-02, "Does the organisation outsource any process…"), Playwright clicked "Yes" and the answer did not register; after 20 seconds J-01 timed out, and J-03, J-06, J-10, J-20 and J-21, which continue that session, could not complete. The journey's video (frames in `re-verification/j01-stall-frames.png`) shows the new question placed normally, then the page at the very top with the pointer resting over "Yes", unselected, for the rest of the wait. No script error was captured. The same path, which the journeys answer identically each time, passed in the five other journey runs on this build and in every run on the three commits before it. Instrumented runs of J-01 show the browser moving the page during transitions on desktop as well as phones, with no script call involved, which the end-of-transition placement corrects; what moved the page to the top here, and whether that movement made the click miss, is not established. It is reported as open, not as passed.

## Viewport journeys

At 1100x900, 1280x900, 1440x900, 1600x900, 1920x900, 1100x768, 1440x700, 1920x700, 320x568, 375x812, 390x844 and 430x932: ten answers through the page including an "I don't know" that raises the area handoff offer, then Back to a saved answer. Every size passed: the next prompt was below the sticky progress header and in view after every transition, focus was on the prompt, there was no sideways scroll, the saved answer was selected on Back, and the layout matched the instrument (rail from 768px, context panel from 1280px, full-width card on phones). Screenshots of the question and the handoff at each size are in `evidence/viewports`.

## Probes under load

Two intermittent problems appeared only with the processor busy, so each probe runs beside a second journeys run against the same server; both journeys runs passed 22 of 22.

Phone placement (`readiness-review-phone-placement-probe.cjs`): 12 sessions, 15 answers each with the lowest choices across 320, 375 and 430px, scrolling to the optional detail's Save button where it opens. Every scroll and every script call able to move the page is logged. 180 transitions, 0 prompts out of view, 0 script errors; the page scrolled to place 108 new prompts as they arrived and 36 again as the transition ended. On the uncorrected build the same probe beside the same load found 3 and 5 of 180 out of view.

Hydration (`readiness-review-hydration-probe.cjs`): 60 loads of the management view of a fresh session. 1 load reported React #418. At that failure the document body still equalled the server HTML byte for byte, and React threw while completing the view's three-column grid with none of its children claimed and the document still loading: the same signature as every earlier capture. Rates across runs beside other work have ranged from 0 to 17 in 60; see `INDEPENDENT-REVIEW-RESPONSE.md` and release blocker B11.

## Layout sweep and companion

Pages: home, services, Fraud Readiness, Advisory, review start, a mid-interview question, Snapshot, management, reviewer, owner and links, at 1100x900, 1280x900, 1440x900, 1600x900, 1920x900, 1100x768, 1440x700, 320x568, 375x812, 390x844 and 430x932. 121 loads, all 200, no sideways overflow, Poppins the only font in use. Two loads recorded React #418: the Snapshot at 320px and the management view at 390px (B11). In `after-sweep.json` the `height` field holds the page's scroll height; the viewport size is in each screenshot's file name.

Homepage companion: all four stages in view, 104 to 120px from the top, at every width from 1100 to 1920px for heights 800 and 900. At 1440x700 and 1920x700 the composition falls back to one column, identical to the parked baseline.

## Accessibility

Automated: axe-core at 1440 and 390px on the initial state of 11 pages (22 scans) and on 13 interactive and error states driven through the page (26 scans): interview orientation, question, save failure, optional detail panel, area handoff offer, stop confirmation and completion; reviewer control open, validation error with an unsaved draft, and discard confirmation; management after sending to owners; an owner's question; and an unknown link. Every scan waited until no answer transition and no CSS transition or animation was running; all 48 reached that state. 0 violations. The baseline's initial states (14 scans, earlier run) also had 0 violations. The scanner was checked against a page with known violations and reported them.

Incomplete results (axe could not decide), 13, all colour contrast:

| State | Widths | What axe could not decide |
|---|---|---|
| Interview question, save failure, optional detail panel | 1440, 390 | answer selector glyphs marked `aria-hidden`, which contain no text |
| Management view, before and after sending | 1440, 390 | the status icon glyphs, `aria-hidden`, no text |
| Services | 1440, 390 | the open/closed marker of a capability panel, no text |
| Stop confirmation | 390 | one line of the confirmation whose background could not be determined because it partly overlaps another element |

The glyph results are decorative symbols with no text to read. The stop confirmation line at 390px needs a manual contrast check; it was not done.

Exercised in the journeys: keyboard answering, focus moved to each new prompt without a visible ring on the programmatic target, errors announced with `role="alert"`, save status in a polite live region, reduced motion skipping every phase, 200% zoom equivalent at 640px and 400% equivalent at 320px without sideways scroll.

Not done: screen-reader sessions (VoiceOver with Safari, NVDA with Firefox), magnification and contrast modes, physical phones and soft keyboards.

## Performance

Median of three loads at 1440x900 on localhost; transfer sizes include fonts and scripts. Baseline pages are the parked build's equivalents (legacy start, visual-review question fixture, calculated Snapshot fixture), measured in the earlier baseline capture.

| Page | TTFB ms | DCL ms | Load ms | LCP ms | CLS | KB | Baseline (TTFB/DCL/Load/LCP/CLS/KB) |
|---|---:|---:|---:|---:|---:|---:|---|
| Home | 4 | 52 | 186 | 136 | 0 | 587 | 4/47/164/128/0/583 |
| Services | 6 | 67 | 189 | 140 | 0 | 589 | 5/53/171/136/0/586 |
| Fraud Readiness | 4 | 54 | 185 | 124 | 0 | 588 | 5/92/183/124/0/584 |
| Advisory | 3 | 50 | 185 | 136 | 0 | 595 | 4/51/170/128/0/591 |
| Start (`/review`; baseline `/score/start`) | 9 | 76 | 172 | 100 | 0 | 453 | 10/67/162/116/0/563 |
| Question | 10 | 67 | 219 | 148 | 0 | 473 | 18/72/207/156/0/560 |
| Snapshot | 33 | 155 | 249 | 188 | 0 | 524 | 25/65/191/160/0/570 |
| Management | 26 | 74 | 200 | 144 | 0 | 502 | none |
| Reviewer | 14 | 60 | 218 | 136 | 0 | 477 | none |
| Owner | 8 | 68 | 186 | 136 | 0 | 469 | none |
| Links | 8 | 55 | 173 | 116 | 0 | 474 | none |

Public pages carry 2 to 4 KB more than the baseline (the track switch and review copy). Review pages now load no analytics (F3), so the start and question pages transfer about 90 to 110 KB less than their legacy equivalents, and about 40 KB less than in the previous candidate. The Snapshot remains the slowest page: it replays the full session and renders every list, and its timings vary by tens of milliseconds between runs. Route JavaScript: `/review/s/[token]` 14.8 kB (206 kB first load), `/review` 1.49 kB, the Snapshot page 1.93 kB.

## Transition timing

From the click on an answer, measured inside the page, single-choice answers without the optional detail panel, 40 each. Percentiles are nearest rank.

| | Save starts | Save round trip | Collapse begins | Confirmed | Next prompt rendered | Settled |
|---|---:|---:|---:|---:|---:|---:|
| Motion, median / p90 / p95 ms | 1 / 1 / 1 | 19 / 29 / 33 | 5 / 8 / 10 | 129 / 137 / 147 | 171 / 174 / 189 | 230 / 235 / 251 |
| Reduced motion, median / p90 / p95 ms | 0 / 1 / 1 | 15 / 22 / 25 | 4 / 6 / 7 | skipped | 24 / 29 / 33 | 24 / 29 / 33 |

Every motion answer showed the full collapsing, confirmed, entering, idle sequence; every reduced-motion answer went straight to idle. The save is never delayed by motion. The settle probe found 0px of movement after idle on six transitions. The journey script's own "answer to next question" figure (median 465ms, p95 1,559ms in the first repeat) includes Playwright's polling and the optional detail panel, and is not a user-facing measure.

## Recordings

`evidence/recordings`: before (parked site, scored start, question and Snapshot fixtures), after (public pages), respondent at 1440px, save failure and retry at 390px, and management, owner and reviewer at 1440px. Each clip has a JSON record with its status, steps, timing, base URL and source commit (`2c87d81`); a walkthrough error fails the clip and the run, and every page load must return 200. The baseline's fixture pages returned 200 before recording. The management clip now shows which functions hold questions after sending. Paced for a human viewer; they are demonstrations, not tests.

## Not verified

- Durable persistence, authentication, multi-instance behaviour, hosted environments and real networks.
- The Postgres recovery suite.
- Physical devices, screen readers, magnification, contrast modes, and a manual contrast check of the stop confirmation at 390px.
- Respondent comprehension.
- The cause of the intermittent hydration error (B11), of the stalled J-01 answer in the scripted pass, and of the one-off J-01 checkbox failure on the superseded commit `2396884`.
