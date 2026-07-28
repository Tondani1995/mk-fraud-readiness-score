# MK Adaptive Fraud Readiness Assessment — Prototype V1

> **PROTOTYPE ONLY — NOT PRODUCTION.**
> This is a design and interaction prototype for evaluation and customer testing.
> It is not wired into the live MK assessment, and it must not be merged or deployed
> as a customer-facing experience.

## What this is

A self-contained, mobile-first prototype of a **one-question-at-a-time, adaptive**
fraud readiness assessment. It demonstrates how the existing MFRS-V1.0 methodology
(10 domains, 68 questions) can be delivered as a guided consultation that asks only
what applies to a given organisation — without letting respondents shorten the
journey in ways that flatter their score.

## What this is NOT

- It does **not** connect to Supabase, the live API, Vercel Production, or any MK service.
- It does **not** read, write or collect customer or personal data.
- It does **not** change the scoring methodology, question wording, weights, or report content.
- It does **not** produce a score of record. The provisional figure shown in the
  inspector is illustrative only, for demonstrating denominator behaviour.
- It does **not** use AI at runtime. Every branching decision is a pure function of
  `data/question-graph.json` and the current answers.

## Running it

No build step and no framework. Any static file server works.

```bash
cd prototypes/adaptive-assessment-v1
python3 -m http.server 8899
```

Then open <http://localhost:8899/index.html>.

> It must be served over HTTP, not opened as a `file://` URL — the graph is loaded
> with `fetch`, which browsers block on the file protocol.

## Switching between synthetic organisation journeys

The grey **prototype inspection bar** at the bottom of the page is a development
tool, not part of the customer experience. Use the **Synthetic journey** dropdown
to load any of the six fabricated organisations:

| ID | Organisation | Shape of the journey |
|----|--------------|----------------------|
| J1 | Professional-services firm | No stock or cash, limited suppliers, outsourced payroll |
| J2 | Retail organisation | Stores, cash, cards, inventory, refunds, temporary staff |
| J3 | Construction business | Subcontractors, procurement, sites, plant, variation orders |
| J4 | Online business | Digital payments, customer data, remote staff, platforms |
| J5 | Small business | Owner-led approvals, no procurement or payroll function |
| J6 | Low-certainty respondent | Answers "I do not know" throughout |

Selecting a journey pre-fills its **gateway** answers and drops you at the first
methodology question, so you can see the shape of the resulting path immediately.

All six organisations are invented. No real customer, person or company appears
anywhere in this prototype.

## Inspecting the branching path

Click **Inspect branching path**. This prints the full deterministic evaluation:

- the ordered active path, with the current question marked;
- every excluded question and its `skip_reason_code`;
- every outsourcing redirect (`D7-Q04 → OV-D7-Q04`);
- the audit history of answers invalidated by upstream changes;
- live coverage, uncertainty share, and the provisional denominator.

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
npm install          # only needed for the browser suite
npm test             # 25 engine/journey tests, zero dependencies
npm run test:browser # 19 Playwright tests + screenshot capture
npm run journeys     # prints the synthetic journey matrix
```

The engine suite runs on plain Node with no dependencies. The browser suite needs
Playwright (`npx playwright install chromium`) and writes stills to `screenshots/`
at 320, 390, 768 and 1440 px.

## Layout

```
data/question-graph.json   Methodology + gateways + branching rules (the source of truth)
src/engine.js              Pure deterministic branching engine (no network, no IDs)
src/journeys.js            Six synthetic organisations + deterministic responders
src/app.js                 UI, screen states, save/resume, invalidation flow
src/styles.css             Design tokens mirroring tailwind.config.ts mk.*
tests/graph.test.mjs       Engine, journey, integrity and safety tests
tests/browser.spec.mjs     Keyboard, viewport, save-failure, resume, screenshots
tests/journey-report.mjs   Journey matrix generator
screenshots/               Captured states at each required viewport
```

## Prototype shortcuts

These are deliberate and must not be carried into production:

- Persistence is `localStorage` with a simulated 420 ms latency.
- The provisional score is computed in the browser for demonstration; production
  scoring stays server-side in the existing engine.
- Gateway questions (`G01`–`G14`) and oversight variants (`OV-*`) are **unapproved
  placeholder content**. See `docs/adaptive-assessment/11-content-decisions-required.md`.
- The inspection bar would not ship.
