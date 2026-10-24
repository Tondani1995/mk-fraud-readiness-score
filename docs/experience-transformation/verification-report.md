# MK Fraud Clarity — experience verification

24 October 2026 · isolated `design/mk-management-clarity` · baseline `83ae9db4` (continuing the prior refinement of `49378f15`). No merge, push, deployment, real assessment, order, payment, report-generation call or customer communication was performed.

## Delivered experience

One guided questionnaire combines concept C’s purpose-built stage and completion rail with concept B’s spatial response transformation. A/B/C working local prototypes are at `/design-review/concepts`; the expert evaluation is in `concept-decision.md`. This is not participant research.

Shared radius tokens cover page panels (28px), panels (24px), cards (20px), controls (14px), smaller surfaces (12px) and capped tracks. Inter, navy/white identity, headline and exposure illustration remain. Full-width section canvases retain straight page edges. SVG joins/caps are rounded without changing data values.

Native radios retain the existing substantive maturity meanings. Desktop exposes definitions inline; mobile provides native Meaning disclosures before selection. “I do not know” stays distinct. Selection changes immediately; unselected rows fade/translate and physically collapse over 180ms, then their content unmounts. The next server-confirmed question enters over 240ms with fully opaque text to preserve contrast. No timer delays persistence/navigation to showcase motion. Fast saves can overlap or supersede the exit animation; the slow-connection recording makes the complete removal visible. The selected answer resolves in a saved-response capsule. Reduced-motion CSS and system preference remove motion dependencies.

Saving locks input and Back. Failed saves restore all options with the local selection retained and an explicit retry. A stale sequence discards the unapplied delta and reloads the authoritative version with input locked. Back can revisit and correct; “Continue with saved response” advances through the saved path without another write. The last answer opens review and never silently submits. Pending changes trigger a leave-page warning. No answer/token is stored in browser storage for this interaction.

## Performance evidence

Optimized Next.js 15.5.22 build, Node24, embedded Chromium 156 on macOS desktop CPU, 1440×1000 viewport. Same frozen baseline controller and original CSS, same synthetic state fixture, actual gzip HTTP responses, same configured envelopes and native browser rAF probe. Capture-motion mode was off. Baseline resolved panel radius4px; current28px; both Inter. All transitions require the next heading on screen and enabled real response inputs after the authoritative fixture response. Samples use pointer input; rAF measures the first checked paint and first usable next question. JSON contains timings/counts, no answers, tokens or private identifiers.

The HTTP service uses the existing pure delta/path builders, but its process-local synthetic state is **not Supabase persistence**. Envelope delay is latency + actual compressed bytes/bandwidth, including transfer size; fixture Server-Timing is compute, not SQL. This is a mobile-network proxy on desktop CPU, not a physical-phone or browser network-throttling certification. Header/request overhead, radio networks and remote contention are not simulated.

All times below are milliseconds. “Bootstrap” samples reset the early fixture after the normal conceptual gates, not real assessment creation or cold route/bundle readiness.

| Envelope | Version | Transitions | Next usable p50 / p95 / worst | Feedback p95 | HTTP p95 | Bootstrap n: p50 / p95 / worst | rAF interval p95 |
|---|---|---:|---|---:|---:|---|---:|
| 30 ms / 10 Mbps | baseline | 30 | 63.1 / 79.2 / 79.3 | 29.9 | 49.4 | 10: 66.3 / 76.8 / 76.8 | 17.1 |
| 30 ms / 10 Mbps | after | 30 | 61.3 / 62.2 / 62.4 | 12.5 | 46.4 | 10: 78.0 / 78.9 / 78.9 | 18.6 |
| 150 ms / 1.6 Mbps | baseline | 30 | 246.2 / 246.9 / 248.1 | 30.2 | 218.6 | 10: 233.2 / 236.2 / 236.2 | 17.2 |
| 150 ms / 1.6 Mbps | after | 30 | 195.9 / 212.2 / 212.3 | 12.9 | 194.8 | 10: 231.0 / 251.2 / 251.2 | 18.6 |
| 600 ms / 0.75 Mbps | baseline | 15 | 763.0 / 764.2 / 764.2 | 30.9 | 735.3 | 5: 749.9 / 750.3 / 750.3 | 17.4 |
| 600 ms / 0.75 Mbps | after | 15 | 694.6 / 696.9 / 696.9 | 13.6 | 679.3 | 5: 747.6 / 749.5 / 749.5 | 18.6 |

The measured next-question and feedback targets pass within these envelopes. No observed long tasks were reported in these measured windows. rAF intervals around17ms support a smooth desktop observation; they are not a compositor trace or universal60fps guarantee. Raw samples, user agent, p50/p95/worst, fixture compute and response bytes are in the six JSON files. A separate first-route/cold-load benchmark, real Begin-to-question p95, physical mobile CPU and database service/commit p95 remain outstanding.

The lossless transfer removes repeated immutable definitions and duplicate node objects while preserving the server’s supplied active-node IDs, full path, flags, counts and responses. Representative mid-state logical bytes109,055→55,425; gzip11,670→6,367. Fingerprint/version checks prevent definition drift; missing/duplicate node IDs reject. Requests without the opt-in or matching fingerprint receive the full representation. Five existing deterministic fixture stages round-trip exactly, including zero and unknown.

The start route now returns already-committed initial state and the controller renders it directly after profile/legal validation, retaining the private resume URL in history. It avoids a redundant route/state read and removes analytics from the critical navigation path. Progress analytics defer until after response. These changes do not move legal acceptance or create a session early. Auth, eligibility, expected save sequence, RPC delta and gateway invalidation remain authoritative. Numeric `Server-Timing` phases (`access`, `load`, `commit`, `projection`) are ready for the permitted staging run. No database performance claim is made.

## Snapshot intelligence and methodology

The circular gauge and independent static domain cards are replaced by one connected management instrument: exact recorded score and calculated/capped band, existing priority order, comparative domain score bars, separate critical-control gap counts, and an interactive interpretation pane. Domain selection exposes reconciled known/unknown/unanswered control counts, existing finding/management implication, and exact flagged statements where validated traces support them. Mobile opens a focused detail section and returns to the selected row. Full interpretation/scope and detailed coverage definitions remain available through disclosures.

Data is drawn from the existing FreeSnapshot, `buildCommercialSnapshotInsights`, `buildManagementView`, reconciled adaptive traces and methodology thresholds. No AI interprets or rewrites scores; no new scoring, risk index, dependency, financial exposure or severity is inferred. Numeric0, null and fractional scores remain distinct. Bars encode actual domain scores on a shared0–100 scale; critical gap counts are separate and major/critical overlap is explicit. A capped maturity band does not falsify the numeric score. Insufficient visibility suppresses reliable priority/strength conclusions.

Five engine-derived fixtures cover mixed controls, critical weaknesses, strong controls, partial coverage and visibility limitation. The uniform synthetic sample naturally repeats domain findings because its inputs/results repeat; the mixed fixture gives specific operational and third-party weaknesses. Any exact control finding shown must reconcile to the existing recorded trace. The previous hand-composed illustration remains labelled as illustrative; it is not evidence of engine output.

Priority ordering is the existing critical-gap count descending, lower raw domain score next, then methodology weight/original order. It is relative attention, not proof that every listed domain failed. Existing strength thresholds/leadership-priority text are retained and explained. Self-report does not independently verify operating effectiveness, fraud incidence, financial loss or control dependencies.

### Coverage reconciled

- **Assessment coverage:** answered applicable control count / applicable control count. In the calculated partial fixture59/68 =86.76%, displayed87%.
- **Control visibility:** known-response weight / total applicable weight. The same fixture86.56%, displayed87%.
- **Unknown weight share:** unknown-response weight / applicable weight, separately recorded; unanswered is not automatically unknown.
- **Domain scoring-base coverage:** score denominator / known-response weight in the existing engine. It can be100% for a domain whose known answers all enter its score while other applicable controls remain unanswered. It does not mean all applicable controls were answered, evidenced or tested. The domain count strip exposes that missingness separately.

Thus overall87% and domain100% can coexist. No averaging of those percentages is valid. Candidate metadata saying unknown is never excluded conflicts with the executable calculator’s treatment; owner reconciliation remains a release prerequisite. This work preserves the calculator.

### Commercial logic

There is no documented result-to-tier rule sufficient to justify “Best fit for your result.” The neutral presentation from the previous refinement remains: Essential for diagnosis/priorities (R7,500 incl.VAT), Comprehensive for target-state design/implementation (R35,000 incl.VAT). Neither is declared objectively necessary from the score. Catalogue prices, entitlements, payment-before-generation and order logic are unchanged. Only the support-link underline and shared rounded controls affect commercial presentation.

## Verification limits and release decision

See `manual-qa.md`, `accessibility-results.json`, the screenshot gallery, actual motion GIFs and `test-results.txt`. Automated checks cannot establish full accessibility. Browser keyboard/layout checks cannot certify VoiceOver/NVDA, physical touch keyboards, mobile Safari or system-level reduced motion.

**Production recommendation: NO-GO pending staging and device/assistive verification.** Follow `staging-verification.md` and the full existing transaction matrix. In addition to absent isolated staging credentials, the existing completed-resume flow can show a preparation message without recovering a private URL; the submit endpoint rejects an already-scored locked result. A reviewed authenticated recovery path and real staging evidence are required. Do not work around it by rescoring or replaying notifications.
