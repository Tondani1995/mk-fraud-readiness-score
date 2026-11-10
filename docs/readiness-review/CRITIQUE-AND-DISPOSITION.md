# Critique and disposition of the parked digital experience

Subject: the parked Codex work at `75451fc69149cf2a5a08a0a0bfa3161ce84ffcf2` on `design/mk-spatial-experience` (spatial website, assessment instrument and scored Snapshot), judged against the rebuilt readiness method (build 1.4, extended additively as engine build 1.5).

Evidence used: the parked tree and its own release-readiness and acceptance reports; a production build of `75451fc6` served locally and swept at 1440 and 390px (`evidence/before-sweep`); the same pages on the candidate (`evidence/after`); axe-core scans of both; the parked regression suites run on both trees. No respondent or usability session was available to either piece of work, so every statement about comprehension below is a judgement, not a measurement.

## Summary

The parked work is a strong presentation layer attached to the wrong measure. Its brand, website narrative and question instrument are worth keeping, and the candidate keeps them. Its scored Snapshot, readiness figure, maturity band and score-led priorities express a self-reported number as if it were a readiness measurement, and they rest on a scoring rule whose own documentation contradicts it (see `LEGACY-UNKNOWN-SCORING.md`). For the review track those are replaced, not restyled. The legacy scored path is retained untouched for the default build and for records already issued.

## Assessment by dimension

### Positioning

The parked homepage tells one connected story, from where exposure sits to what management should decide, with an illustrative companion that follows the narrative on wide screens. "Turn fraud readiness into a management decision" is distinctively MK and suits a professional buyer. The weakness was that the story led to a number: the Fraud Readiness page promised "a private, self-reported Snapshot of your organisation's readiness" and showed an illustrative 74/58/42 profile. That framing invites the reader to treat a self-report as a rating.

Candidate: positioning retained; under the review track the promise becomes what is reported, what is unknown and which material questions remain open, and the preview is a fictional example produced by the engine itself.

### Visual quality

Poppins, the navy-led palette, restrained borders and soft geometry are coherent and credible, with no decorative charts or invented relationships. The instrument (area rail, wide question card, context panel, two-column answers) is the strongest screen in the parked work. The scored Snapshot is visually rich but its richness comes from the scores themselves: bars, a 0 to 100 scale, a banded headline.

One inherited motion defect was found in the shared transition: the stage's 40ms entry duration applies only while the phase is `entering`, so when the phase returns to idle the same CSS animation resumes at the default 240ms and the prompt drifts about 2.3px over roughly 130ms after input unlocks. It is small but it is movement after the flow says it has settled. Measured on the review interview; by reading of the code the legacy flow behaves the same, which could not be observed here.

Candidate: brand and instrument retained exactly; the residual drift is ended in the review interview without touching the protected shared motion rules. The first review interview build missed the instrument structure and rendered the question in the 160px rail column; this was found in the recordings, fixed, and is now guarded by journey J-19 and the viewport journeys. The review Snapshot is honest but text-heavy: each count carries its full definition. It needs a design pass once MK approves the wording (see the release decision).

### Information architecture

Website: services as independently expandable capabilities, a storefront with equal treatment of tiers, and a methodology page. Sound, retained.

Assessment: one question per screen, Back, saved-area navigation and a progress header. Sound, retained. The parked flow had one respondent and no route for questions that person cannot answer.

Snapshot: executive position column, management priorities sorted by critical gaps then score, area profile. This structure depends on scores and is replaced in the review track by four defined counts (reported gaps, waiting for an owner, material scenarios still open, evidence still to review) followed by the lists behind them.

Candidate additions: owner packages per accountable function, a reviewer workspace with queues, a management view grouped by what each item needs next, and a links page for the fictional harness.

### Comprehension

Neither piece of work has been tested with respondents. The parked report prepared a session protocol; it was not run. In the parked flow, "I don't know" was a seventh choice beside six maturity levels, and its effect on the result (excluded from the numeric score, then triggering provisional or withheld status) was not visible to the respondent. In the review track the effect is stated before the interview and at the moment it happens: the question waits for the named function, and the respondent is offered to send the rest of the area.

Open risk: the anchored answer scale for practice questions (Not in place to Embedded and improving, with an ascending bar glyph) still looks like a maturity scale even though the review engine only records what was reported and never aggregates it. Whether to keep the glyph is listed as an MK design decision.

### Accessibility

Parked: 156 automated scans with zero WCAG-tagged axe violations and 69 incomplete colour-contrast results; keyboard, focus return and reduced-motion handling in the instrument were observed; no screen-reader, magnification or physical-device session.

Candidate: zero axe violations on 22 scans of the review track and public pages (11 pages at 1440 and 390px, initial states) and on the 14 baseline scans; keyboard answering with reduced motion at 640px (1280px at 200% zoom), focus on the next prompt after every transition at all brief widths, error states announced with `role="alert"`, save status in a polite live region. Programmatic focus targets no longer show a stray focus ring. Screen-reader output, magnification and physical devices remain outstanding for both.

### Performance

Parked: transitions measured with all four phases, p95 below one second, on a fixture transport.

Candidate, same machine and conditions (local production build, localhost, median of three loads at 1440px): public pages within 3 KB of the baseline transfer (home 586 KB against 583 KB); the review question page loads 510 KB against 560 KB for the legacy question fixture; LCP for every page between 108 and 208 ms, the review Snapshot being the slowest; CLS 0 throughout. In-page transition timing from the click: the save starts within 1 ms, the save round trip has a median of 18 ms, and the next prompt is rendered at a median of 172 ms with motion and 22 ms with reduced motion. These are local numbers and say nothing about a deployed network path.

### Maintainability

Parked: `clarity.css` is 5,443 lines with acknowledged unused selectors; review laboratories live inside the app (`/design-review/*`, `/score/visual-review/*`) and return not found only by runtime environment checks; the QA recovery routes under `src/app/score/api/qa/` run on preview deployments with the service-role Supabase client while preview and production share one Supabase project. That last point predates the presentation work and belongs with the security owner; it is not changed here.

Candidate: the review track is self-contained (`src/lib/readiness-review`, `src/components/readiness-review`, `src/app/review`), adds no stylesheet rules, reuses the existing instrument classes, pins its ruleset by hash and has its own contract tests. The engine is vendored byte-identical so its hash can be checked, which means engine fixes arrive as new builds rather than edits.

### Commercial journey

Parked: Free, Essential (R7 500), Comprehensive (R35 000) and Advisory are presented with equal treatment; the legacy next-step rules (C1 to C8) choose a paid tier from scores and gap counts but the page does not render a "best fit" badge. The paid reports are built from the scored assessment.

Candidate: prices, entitlements and payment logic untouched. Under the review track the paid tiers are shown as not yet available from a review Snapshot, because they cannot be produced from one. That is a real revenue gap and is set out with options in `COMMERCIAL-RECONCILIATION.md`.

### Methodological honesty

Parked: careful in many places (illustrative labels, self-report limitation kept visible, no invented findings), but the central figure is a score computed from known answers only while a stored sentence says unknown answers were in the denominator. A 68.4/100 "Developing" headline on self-reported answers reads as a measurement.

Candidate: no score, band, rating, confidence or predicted state in any view or export (C-06, J-05); unreached and unknown items are listed as open, never as present or absent; every reviewer record is tied to the answer version it examined and becomes not current when the answer changes (C-10, J-10, J-11); the public preview is generated by the engine and checked against it (C-18).

## Disposition

| Parked element | Disposition | What the candidate does |
|---|---|---|
| Brand direction (Poppins, navy, geometry, motion language) | Retain | Unchanged. |
| Homepage narrative and companion | Retain | Unchanged layout; review-track copy and preview only when the build selects the review track. |
| Services page and capability disclosures | Retain | Unchanged. |
| Fraud Readiness storefront | Improve | Same layout; review-track hero, steps and product notes; prices from the catalogue. |
| Methodology and trust copy | Replace (review track) | Describes one versioned ruleset, nothing scored, traceable entries, reviewer records kept separate. Legacy copy kept for the default build. |
| Illustrative scored Snapshot preview | Replace (review track) | Fictional engine-generated example with four counts. |
| Question instrument, response canvas, transition and prompt positioning | Retain | Reused by the review interview, including the area rail and context panel. |
| Adaptive scored engine and scoring | Retain for legacy only | Untouched; not used by the review track. |
| Scored Snapshot, readiness score, maturity band, score-led priorities | Replace (review track); retain for issued records | Unscored Snapshot with defined counts and lists. |
| Next-step tier rules C1 to C8 | Retire from the review track | No recommendation is made from a review Snapshot. Kept for the legacy track. |
| Paid report generation from score runs | Retain for legacy; decision needed for review | See commercial reconciliation. |
| Review laboratories in app routes | Retire before release | Not used by the review track. Recommend moving them out of the production build. |
| QA recovery routes using the service-role client on preview | Escalate | Security owner decision, together with staging isolation. Not part of this change. |
| `clarity.css` unused selectors | Improve later | No rules added. |

## Weaknesses of the candidate itself

- The review Snapshot and management view are long and text-dense. Definitions, reasons and suggested roles are correct but need editorial and visual compression once MK approves the wording.
- The interview's area introductions use the bank's module names, which read as internal labels in places.
- At 1440x700 and 1920x700 the homepage companion falls back to one column, as in the baseline; it is not a regression but is not ideal on short laptop screens.
- A multi-select question answered with every option is covered by contract test C-08 but was not reached through the page in the journeys.
- Everything runs on a fictional file harness with links standing in for sign-in. That is enough to exercise the interface; it is not persistence or access control.
