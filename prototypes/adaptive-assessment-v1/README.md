# MK Adaptive Fraud Readiness Assessment — Prototype V1

> **PROTOTYPE ONLY — NOT PRODUCTION.**
> This is a design and interaction prototype for evaluation and customer testing.
> It is not wired into the live MK assessment, and it must not be merged or deployed
> as a customer-facing experience.

## What this is

A self-contained, mobile-first prototype of a **one-question-at-a-time, adaptive**
fraud readiness assessment. It demonstrates how the existing MFRS-V1.0 methodology
(10 domains, 68 questions) can be delivered as a guided consultation that asks only
what applies to a given organisation.

### The scoring and comparability contract

> **Exclusion creates no control credit and no control penalty, but it changes the
> assessed scope. The resulting Fraud Readiness Score is valid only for the
> organisation's declared applicability profile and should not be compared directly
> with an organisation whose fraud exposures or applicable control areas differ
> materially.**

An earlier version of this prototype claimed that "skipping never improves the score".
That was wrong. Where excluded controls leave the denominator, removing a weak area
changes the percentage — measured at **+6.46 points** between journeys J7 and J7-FULL.
The prototype now reports three separate measures and marks every result
scope-specific. See `docs/adaptive-assessment/05-applicability-and-scoring-integrity.md`.

## What this is NOT

- It does **not** connect to Supabase, the live API, Vercel Production, or any MK service.
- It does **not** read, write or collect customer or personal data.
- It does **not** change the scoring methodology, question wording, weights, or report content.
- It does **not** produce a score of record. The figures shown are illustrative only,
  for demonstrating denominator, coverage and visibility behaviour.
- It does **not** use AI at runtime. Every branching decision is a pure function of
  `data/question-graph.json` and the current answers.

## Running it

No build step and no framework. Any static file server works.

```bash
cd prototypes/adaptive-assessment-v1
npm run review
```

`npm run review` starts a zero-dependency local server and prints the URL together with
instructions for switching journeys, inspecting the branch path, simulating save
failure and resetting state. Then open <http://localhost:8899/index.html>.

> It must be served over HTTP, not opened as a `file://` URL — the graph is loaded
> with `fetch`, which browsers block on the file protocol.

## Switching between synthetic organisation journeys

The grey **prototype inspection bar** at the bottom of the page is a development
tool, not part of the customer experience. Use the **Synthetic journey** dropdown
to load any of the eight fabricated organisations:

| ID | Organisation | Shape of the journey |
|----|--------------|----------------------|
| J1 | Professional-services firm | No stock or cash, limited suppliers, outsourced payroll |
| J2 | Retail organisation | Stores, cash, cards, inventory, refunds, temporary staff |
| J3 | Construction business | Subcontractors, procurement, sites, plant, variation orders |
| J4 | Online business | Digital payments, customer data, remote staff, platforms |
| J5 | Small business | Owner-led approvals, no procurement or payroll function |
| J6 | Low-certainty respondent | Answers "I do not know" throughout |
| J7 | Strong controls, weak domain excluded | Methodology stress test: exclusion changes the score |
| J8 | High unknown, high apparent maturity | Methodology stress test: visibility gate |

Selecting a journey pre-fills its **gateway** answers and drops you at the first
methodology question, so you can see the shape of the resulting path immediately.

All eight organisations are invented. No real customer, person or company appears
anywhere in this prototype.

## Inspecting the branching path

Click **Inspect branching path**. This prints the full deterministic evaluation:

- the ordered active path, with the current question marked;
- every excluded question and its `skip_reason_code`;
- every outsourcing redirect (`D7-Q04 → OV-D7-Q04`);
- the audit history of answers invalidated by upstream changes;
- live Assessment Coverage, Control Visibility, unknown share and the applicable
  denominator, plus the report status.

The branching rules themselves are in `data/question-graph.json`. Nothing is hidden
in code: `src/engine.js` contains no question identifiers at all, which is asserted
by a test.

## Resetting state

Click **Reset state**, or run `localStorage.removeItem('mk-adaptive-assessment-prototype-v1')`.
State lives only in this browser and is never transmitted.

## Simulating failure

Click **Simulate save failure** to toggle a forced save error. This surfaces the
save-failed state, the retained-answer message and the retry affordance. Toggle it
off and press **Retry save** to see recovery.

## Tests

```bash
npm install           # only needed for the browser suite
npm test              # 44 engine/journey tests, zero dependencies
npm run test:browser  # 27 browser tests x Chromium, Firefox, WebKit
npm run test:chromium # a single engine
npm run journeys      # prints the synthetic journey matrix
```

The engine suite runs on plain Node with no dependencies. The browser suite needs
Playwright (`npx playwright install chromium firefox webkit`), includes axe-core WCAG
checks and a 400% zoom reflow test, and writes stills to `screenshots/` at 320, 390,
768 and 1440 px. CI runs all three engines on the exact PR head.

## Layout

```
data/question-graph.json   Methodology + gateways + phases + branching rules
src/engine.js              Pure deterministic branching engine (no network, no IDs)
src/assessment-model.js    Five response states, three measures, report status,
                           recommendation classes, integrity signals
src/review-screen.js       Final review / report-preview presentation
src/journeys.js            Eight synthetic organisations + deterministic responders
src/app.js                 UI, screen states, save/resume, invalidation flow
src/styles.css             Design tokens mirroring tailwind.config.ts mk.*
tools/review-server.mjs    Zero-dependency local review server (npm run review)
tests/graph.test.mjs       Engine, journey, recommendation and safety tests
tests/browser.spec.mjs     Keyboard, viewport, axe, zoom, save-failure, screenshots
tests/journey-report.mjs   Journey matrix generator
screenshots/               Captured states at each required viewport
```

## Prototype shortcuts

These are deliberate and must not be carried into production:

- Persistence is `localStorage` with a simulated 420 ms latency.
- The score is computed in the browser for demonstration; production scoring stays
  server-side in the existing engine.
- Gateway questions (`G01`–`G14`), oversight variants (`OV-*`), the uncertainty option,
  block introductions, recommendation templates, evidence prompts and time constants are
  **unapproved placeholder content**. See
  `docs/adaptive-assessment/11-content-decisions-required.md`.
- All report-status and integrity thresholds are proposals —
  **METHODOLOGY DECISION REQUIRED**.
- The inspection bar and `window.__MK_PROTO__` hooks would not ship.
