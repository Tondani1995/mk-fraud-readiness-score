# Verification report

Verified code commit `1adf1aaccd4d39fea1ebb4b793bf4f1587147b88` on `review/mk-integrated-readiness`, clean working tree, 10 November 2026. The packaged commit adds only these documents. Every check below ran in one scripted pass (`evidence/results/summary.txt`), except the baseline captures, which were taken from a production build of the parked commit `75451fc6` served on the same machine.

Conditions throughout: Node 24.22, Next.js 15.5.22 production builds, `next start` on localhost, headless Chromium through Playwright 1.63, the fictional local harness with fault injection enabled. No network path, database, physical device or assistive technology was involved.

## Summary

| Layer | Check | Result |
|---|---|---|
| Types and lint | `tsc --noEmit`; `next lint` | 0 errors; 1 warning, pre-existing in the parked `src/components/review/AssessmentBenchmark.tsx` |
| Layering | each layered commit type-checked on its own | Engine, persistence, presentation and public-site commits all 0 errors |
| Contract | `readiness-review-contract-tests.mjs` | 18 of 18 pass |
| Parked regression suites | the parked branch's 31 suites | 30 pass; 1 cannot run here (same on the parked baseline) |
| Builds | review-track build; default build | both succeed |
| Legacy separation | default build served without the flag or harness | `/score/start` 200 with the legacy start form; `/review` 404; `POST /review/api/sessions` 404; Fraud Readiness page links to `/score/start` and does not mention the review |
| Browser journeys | `readiness-review-browser-journeys.cjs` | 19 of 19 pass |
| Viewport journeys | 12 sizes, answering through the page | 12 of 12 pass |
| Settled motion | movement after the transition reports idle | 0px on 6 transitions |
| Layout sweep | 11 pages at 11 sizes | 121 loads, 0 non-200, 0 sideways overflow, 0 script errors |
| Homepage companion | 9 desktop sizes | in view at every stage for all heights from 800px; one-column fallback at 700px height, as in the baseline |
| Accessibility (automated) | axe-core 4.12.1, WCAG 2.0, 2.1 and 2.2 A and AA rules | 22 scans, 0 violations (baseline: 14 scans, 0 violations) |
| Performance | median of three loads at 1440px | see below |
| Transition timing | 24 answers with motion, 24 with reduced motion | see below |
| Recordings | five paced recordings, before and after | produced from the same build |

## Contract tests

C-01 ruleset hashes; C-02 full interview to the limit replays identically; C-03 respondent channel never serves owner work; C-04 off-screen answers rejected; C-05 export views equal page views and report fields; C-06 no score, band, confidence or predicted field in any view or export; C-07 mixed routes stored as several modes, `["unknown"]` waits for an owner; C-08 all checks selected is not a gap; C-09 to C-11 the V13 recheck defects through the adapter; C-12 owner continuation after the limit; C-13 an owner's "I don't know" ends the question; C-14 another engine build is refused; C-15 stop, resume and the Snapshot; C-16 retry applied once, stale sequence conflict, failed save stores nothing; C-17 role-scoped links; C-18 the public preview is what the engine produces and carries no score. Details in `contract-results.json`.

## Parked regression suites

30 of 31 exit 0, the same set as on the parked baseline. `scripts/recovery-postgres-tests.mjs` fails before any test runs: the embedded PostgreSQL `initdb` cannot be executed in this environment (permission denied with install scripts skipped; when made executable it needs `libicuuc.so.60`, which is absent, and it refuses to run as root). Its result is unknown, not passed.

## Browser journeys (desktop 1280px, phone 390px, plus 320, 375, 430 and 640px)

| ID | What it proves | Observed |
|---|---|---|
| J-01 | Orientation explains the limit and the handoff; 95 answers through the page; stop at the limit | first question PR-01; 95 screens; stopped at the limit |
| J-02 | Mixed routes chosen on the page are stored as several modes | D5-G-01 and D6-S-02 each stored with two modes |
| J-03 | An unknown profile fact keeps FS-D1-07 open | shown as route-incomplete |
| J-04 | Snapshot page, API and export counts identical and equal to the report | identical in every run |
| J-05 | No score, rating, maturity level or confidence on the Snapshot | none found in rendered text |
| J-06 | After the limit, the owner answers on its own page; a newly opened confirmation follows; respondent screens stay at 95 | PR-06 then D1-L-04; screens 95 before and after |
| J-07 | Once the owner settles the fact, FS-D1-07 is no longer held open | settled |
| J-08 | A confirmed review with a follow-up and a follow-up alone both become reviewer tasks and management actions | two tasks, two MK reviewer actions |
| J-09 | A reviewer save with nothing to record shows a message and stores nothing | sequence unchanged |
| J-10 | After the respondent changes a reviewed answer, the earlier confirmation is not current and new insufficient evidence does not revive it | not current; no conclusion or follow-up carried |
| J-11 | Reviewer history keeps the earlier version, value and follow-up | present |
| J-12 | A failed save keeps the selection, says nothing was recorded, and a retry saves once | one stored entry |
| J-13 | Back shows the saved answer selected; a change is recorded and the interview continues | correct |
| J-14 | Stop is resumable; resume returns to a question | correct |
| J-15 | At 320, 375 and 430px the next prompt is in view and focused after each transition, with no sideways scroll | all in view and focused |
| J-16 | Keyboard answer with reduced motion at 640px (1280px at 200% zoom) | saved, advanced, prompt focused, no sideways scroll |
| J-17 | Unknown links 404; a stale write 409 | correct |
| J-18 | No script errors during the journeys | none |
| J-19 | Instrument geometry: rail, card and context at 1280px; full-width card at 390px | rail 160, card 812, context 220; phone card 366 |

Earlier pass on the superseded commit `2396884` (kept in `evidence/results/superseded-run-2396884`): J-01 failed once when Playwright reported a multi-select checkbox as not stable and then unchanged after a click, and the J-03, J-06 and J-10 checks that depend on it could not run. The instability matches the post-transition movement found the same day and fixed in `75fdf95`. Three full runs since have passed 19 of 19, but the failure was not reproduced on demand, so its cause is likely rather than proven.

## Viewport journeys

At 1100x900, 1280x900, 1440x900, 1600x900, 1920x900, 1100x768, 1440x700, 1920x700, 320x568, 375x812, 390x844 and 430x932: ten answers through the page including an "I don't know" that raises the area handoff offer, then Back to a saved answer. Every size passed: the next prompt was below the sticky progress header and in view after every transition, focus was on the prompt, there was no sideways scroll, the saved answer was selected on Back, and the layout matched the instrument (rail from 768px, context panel from 1280px, full-width card on phones). Screenshots of the question and the handoff at each size are in `evidence/viewports`.

## Layout sweep and companion

Pages: home, services, Fraud Readiness, Advisory, review start, a mid-interview question, Snapshot, management, reviewer, owner and links, at 1100x900, 1280x900, 1440x900, 1600x900, 1920x900, 1100x768, 1440x700, 320x568, 375x812, 390x844 and 430x932. 121 loads, all 200, no sideways overflow, no script errors, Poppins the only font in use. In `after-sweep.json` the `height` field holds the page's scroll height; the viewport size is in each screenshot's file name.

One earlier sweep (superseded commit) recorded a single React hydration error (#418) on the management view at 1280px. It did not recur in 60 further loads of that page, 132 loads repeating the sweep pattern at 1100 and 1280px, or the final sweep. Its cause was not established; it is listed as open.

Homepage companion: all four stages in view, 104 to 120px from the top, at every width from 1100 to 1920px for heights 800 and 900. At 1440x700 and 1920x700 the composition falls back to one column, identical to the parked baseline.

## Accessibility

Automated: axe-core on initial page states at 1440 and 390px, 0 violations on the candidate (22 scans) and on the baseline (14 scans). The scanner was checked against a page with known violations and reported them.

Exercised in the journeys: keyboard answering, focus moved to each new prompt without a visible ring on the programmatic target, errors announced with `role="alert"`, save status in a polite live region, reduced motion skipping every phase, 200% zoom equivalent at 640px and 400% equivalent at 320px without sideways scroll.

Not done: screen-reader sessions (VoiceOver with Safari, NVDA with Firefox), magnification and contrast modes, physical phones and soft keyboards, and axe scans of interactive states such as the open reviewer form.

## Performance

Median of three loads at 1440x900 on localhost; transfer sizes include fonts and scripts. Baseline pages are the parked build's equivalents (legacy start, visual-review question fixture, calculated Snapshot fixture).

| Page | TTFB ms | DCL ms | Load ms | LCP ms | CLS | KB | Baseline (TTFB/DCL/Load/LCP/CLS/KB) |
|---|---:|---:|---:|---:|---:|---:|---|
| Home | 5 | 63 | 190 | 148 | 0 | 586 | 4/47/164/128/0/583 |
| Services | 4 | 75 | 172 | 136 | 0 | 588 | 5/53/171/136/0/586 |
| Fraud Readiness | 4 | 61 | 199 | 148 | 0 | 587 | 5/92/183/124/0/584 |
| Advisory | 3 | 59 | 160 | 124 | 0 | 594 | 4/51/170/128/0/591 |
| Start (`/review`; baseline `/score/start`) | 8 | 69 | 182 | 136 | 0 | 494 | 10/67/162/116/0/563 |
| Question | 10 | 50 | 179 | 136 | 0 | 510 | 18/72/207/156/0/560 |
| Snapshot | 30 | 107 | 262 | 208 | 0 | 554 | 25/65/191/160/0/570 |
| Management | 17 | 64 | 172 | 128 | 0 | 536 | none |
| Reviewer | 9 | 72 | 182 | 124 | 0 | 514 | none |
| Owner | 12 | 67 | 205 | 172 | 0 | 507 | none |
| Links | 10 | 53 | 157 | 108 | 0 | 511 | none |

Public pages carry 2 to 3 KB more than the baseline (the track switch and review copy). The review start and question pages transfer 50 to 70 KB less than their legacy equivalents. The review Snapshot is the slowest page measured: it replays the full session and renders every list; its LCP was 164ms in the previous sweep and 208ms in this one, so these figures vary by tens of milliseconds between runs. Route JavaScript: `/review/s/[token]` 13.3 kB (204 kB first load), `/review` 1.61 kB, the Snapshot page 1.93 kB.

## Transition timing

From the click on an answer, measured inside the page, single-choice answers without the optional detail panel, 24 each:

| | Save starts | Save round trip | Collapse begins | Confirmed | Next prompt rendered | Settled |
|---|---:|---:|---:|---:|---:|---:|
| Motion, median (p90) | 1 (1) ms | 18 (24) ms | 5 (8) ms | 130 (146) ms | 172 (188) ms | 229 (250) ms |
| Reduced motion, median (p90) | 1 (1) ms | 15 (20) ms | 3 (8) ms | skipped | 22 (26) ms | 22 (26) ms |

Every motion answer showed the full collapsing, confirmed, entering, idle sequence; every reduced-motion answer went straight to idle. The save is never delayed by motion. The settle probe found 0px of movement after idle on six transitions (2.3px before the fix). The journey script's own "answer to next question" figure (median 424ms) includes Playwright's polling and the optional detail panel, and is not a user-facing measure.

## Recordings

`evidence/recordings`: before (parked site, scored start, question and Snapshot fixtures), after (public pages), respondent at 1440px, save failure and retry at 390px, and management, owner and reviewer at 1440px. Paced for a human viewer; they are demonstrations, not tests.

## Not verified

- Durable persistence, authentication, multi-instance behaviour, hosted environments and real networks.
- The Postgres recovery suite.
- Physical devices, screen readers, magnification, contrast modes.
- Respondent comprehension.
- The cause of the one-off hydration error and of the one-off J-01 checkbox failure.
