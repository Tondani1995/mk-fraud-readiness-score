# G30 preparation defect register

Defects found by reading the certified tree `23d5d7e10b389f98054587c09f44ee846be8172e`.

**None of these are fixed on this branch.** Preparation does not modify product behaviour. Each
entry records where the defect is, what it breaks, how G30 will confirm it on a device, and the
severity it would carry under [defect-severity-model.md](defect-severity-model.md).

Severities are **provisional**. Several depend on device confirmation — a reflow or focus problem
that is a P2 on desktop can be a P1 on a 320px phone. G30 execution assigns the final severity.

| ID | Severity (provisional) | Area | One line |
| --- | --- | --- | --- |
| G30-D-001 | P1 | Mobile UX | Adaptive assessment renders inside marketing chrome |
| G30-D-002 | P1 | A11y (2.4.2) | No page title on any `/score` route |
| G30-D-003 | P2 | A11y (2.4.1) | No skip link |
| G30-D-004 | P1 | A11y + mobile | Report-access error page has no `lang`, `title` or viewport meta |
| G30-D-005 | P2 | A11y (2.4.3) | Focus lost on adaptive submission |
| G30-D-006 | P1 | A11y (2.4.3) + mobile | Scope-change dialog has no focus management and can overflow |
| G30-D-007 | P2 | A11y (1.3.1/3.3.2) | Radio-group legends do not carry the question |
| G30-D-008 | P2 | A11y (1.3.5) | No `autocomplete` on the start form |
| G30-D-009 | P2 | A11y (1.3.1/2.4.6) | Result page has almost no heading structure |
| G30-D-010 | P2 | A11y (4.1.3) | Product-selection panel neither announced nor focused |
| G30-D-011 | P3 | A11y (4.1.3) | Compound `aria-live` announcement on every save |
| G30-D-012 | P3 | Motion | Unconditional `scroll-behavior: smooth` |
| G30-D-013 | P3 | A11y (3.3.1) | Disabled Continue gives no reason |
| G30-D-014 | P3 | Mobile | Payment return polls indefinitely |
| G30-D-015 | P3 | Analytics under reflow | View events may not fire at small viewports |

---

## G30-D-001 — Adaptive assessment renders inside marketing chrome

**Where:** `src/components/layout/AppChrome.tsx:10`

```
const assessmentActive = pathname === '/score/start' || pathname.startsWith('/score/assessment/');
```

**What breaks:** `/score/adaptive/{assessmentRef}` — the certified customer assessment — does not
match, so it renders with the full marketing `Header` and `Footer` instead of the assessment
shell. It loses `min-h-[100dvh]`, `overflow-x-hidden`,
`pb-[env(safe-area-inset-bottom)]`, `pt-[env(safe-area-inset-top)]` and the `min-h-11`
"Exit assessment" control. The legacy `/score/assessment/` journey, which the RC supersedes, keeps
all of it.

On iOS Safari this is the difference between a chrome-free assessment surface and one where the
marketing nav and a full footer sit around every question, the dynamic toolbar can overlap
content, and the safe-area inset is unhandled.

**G30 confirmation:** MOB-01, MOB-02, MOB-05, MOB-13 in
[mobile-ux-test-pack.md](mobile-ux-test-pack.md), executed on iPhone Safari at 390 and 430, and
Android Chrome at 375.

**Provisional severity:** P1 — the primary customer journey does not receive the mobile treatment
the product already implements.

---

## G30-D-002 — No page title on any `/score` route

**Where:** no `metadata` or `generateMetadata` export exists anywhere under `src/app/score/**`,
and `src/app/layout.tsx` exports none either. Only `src/app/(website)/**` sets titles.

**What breaks:** WCAG 2.2 **2.4.2 Page Titled (Level A)**. Every customer-journey page — start,
adaptive assessment, snapshot, report request, payment return — has no descriptive title. Screen
readers announce nothing useful on load; browser tabs, history and bookmarks are unlabelled; a
customer with several assessment tabs open cannot tell them apart.

**G30 confirmation:** WCAG-2.4.2 in [wcag-22-aa-control-matrix.md](wcag-22-aa-control-matrix.md);
also asserted by `scripts/g30-device-a11y-browser-tests.mjs`.

**Provisional severity:** P1 — Level A, affects every page of the journey.

---

## G30-D-003 — No skip link

**Where:** `src/components/layout/AppChrome.tsx`, `src/components/layout/Header.tsx`,
`src/app/layout.tsx`. Searching the layout components for a skip link or `sr-only` bypass control
returns nothing.

**What breaks:** WCAG 2.2 **2.4.1 Bypass Blocks (Level A)**. Compounded by G30-D-001: because the
adaptive assessment renders the marketing header, a keyboard user tabs through the logo and six
navigation links before reaching the current question — on every question in a 20–30 minute
assessment.

**G30 confirmation:** KB-02 in [keyboard-screenreader-pack.md](keyboard-screenreader-pack.md).

**Provisional severity:** P2. Raise to P1 if G30 confirms the header is present on every adaptive
question screen (i.e. if G30-D-001 is confirmed).

---

## G30-D-004 — Report-access error page has no `lang`, `title` or viewport meta

**Where:** `src/app/score/report/access/[token]/route.ts:33`

```
`<!doctype html><html><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;">`
```

**What breaks:** three things at once on the page a paying customer sees when a report link is
expired, revoked, rate-limited or broken:

- no `lang` attribute → WCAG **3.1.1 Language of Page (Level A)**;
- no `<title>` → WCAG **2.4.2 Page Titled (Level A)**;
- no `<meta name="viewport">` → mobile browsers apply the default ~980px layout viewport, so the
  page renders zoomed out. `max-width:32rem` then occupies roughly half the screen at unreadable
  text size, and pinch-zoom is required to read the support instruction.

**Not a defect:** `technicalReference` is `crypto.randomUUID()` generated server-side
(`src/lib/reports/customer-report-access.ts:86`) and the message strings come from a fixed map, so
the string interpolation into HTML is not attacker-influenced.

**G30 confirmation:** CJ-19b in [customer-journey-test-cases.md](customer-journey-test-cases.md),
on iPhone Safari and Android Chrome.

**Provisional severity:** P1 — it is a paid-customer support surface and it fails two Level A
criteria plus mobile reflow.

---

## G30-D-005 — Focus lost on adaptive submission

**Where:** `src/components/adaptive/AdaptiveAssessmentExperience.tsx`

```
useEffect(() => { headingRef.current?.focus(); }, [currentId, screen]);
```

`submit()` sets `submitted = true`. Neither `currentId` nor `screen` changes, so the effect does
not run. The completion card renders `<CardTitle>` (an `<h2>` with no ref and no `tabIndex`), so
there is no focus target. When the Submit button unmounts, focus falls back to `<body>`.

**What breaks:** WCAG 2.2 **2.4.3 Focus Order**. A keyboard or screen-reader user completing a
20–30 minute assessment is silently returned to the top of the document with no announcement that
submission succeeded, and must re-traverse to find the result link.

**G30 confirmation:** KB-07 and SR-06 in
[keyboard-screenreader-pack.md](keyboard-screenreader-pack.md).

**Provisional severity:** P2.

---

## G30-D-006 — Scope-change dialog has no focus management and can overflow

**Where:** the invalidation dialog in `AdaptiveAssessmentExperience.tsx`:

```
<div className="fixed inset-0 z-50 flex items-center justify-center bg-mk-ink/45 p-5"
     role="dialog" aria-modal="true" aria-labelledby="adaptive-invalidation-title">
  <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"> … </div>
</div>
```

**What breaks:** two distinct failures.

*Keyboard/AT:* `aria-modal="true"` is asserted but nothing implements it. There is no initial
focus move into the dialog, no focus trap, no Escape handler, and the background is neither
`inert` nor `aria-hidden`. A keyboard user can Tab straight out of the dialog into the question
behind it; a screen-reader user is told a modal is open while still able to reach content the
modal claims to have blocked. WCAG 2.2 **2.4.3**, and it undermines **1.3.1** and **4.1.2**.

*Mobile/reflow:* the panel is centred with `items-center` and has no internal `overflow-y: auto`.
The body text is variable-length (`Changing this answer removes N saved response(s)…`). At 320px,
or at 200% zoom on any width, the panel can become taller than the viewport; because it is
vertically centred inside a `fixed inset-0` container with no scroll, the "Keep current answer" and
"Change scope and continue" buttons can be pushed off-screen and become unreachable. That blocks
the branching correction path entirely.

**Why it matters here specifically:** this is the dialog that gates adaptive branching. If a
customer cannot reach its buttons, they cannot correct a gateway answer.

**G30 confirmation:** CJ-06c and MOB-06 at 320px and at 200% zoom; KB-05 and SR-05.

**Provisional severity:** P1 if the unreachable-button case is confirmed on any matrix
combination; otherwise P2 for the focus-management failure alone.

---

## G30-D-007 — Radio-group legends do not carry the question

**Where:** `AdaptiveAssessmentExperience.tsx`

```
<fieldset><legend className="sr-only">Select one answer</legend> …
<fieldset><legend className="sr-only">Select a maturity response</legend> …
```

The question itself is an `<h1>` in the `CardHeader`, outside the `<fieldset>`.

**What breaks:** a screen-reader user who enters the radio group by forms/controls navigation —
the normal way to answer a question — hears "Select one answer, group" and the option labels, but
not the question. Under VoiceOver's forms mode and TalkBack's control navigation the question is
skipped entirely. WCAG **1.3.1 Info and Relationships** and **3.3.2 Labels or Instructions**.

**G30 confirmation:** SR-03 on VoiceOver + Safari and TalkBack + Chrome.

**Provisional severity:** P2.

---

## G30-D-008 — No `autocomplete` on the start form

**Where:** `src/components/adaptive/AdaptiveStartForm.tsx` — `fullName`, `email`,
`organisationName` and `roleTitle` carry `name` but no `autoComplete`.

**What breaks:** WCAG 2.2 **1.3.5 Identify Input Purpose (Level AA)**, which applies to fields
collecting information about the user. Expected values are `autocomplete="name"`,
`autocomplete="email"`, `autocomplete="organization"` and `autocomplete="organization-title"`.
Practically it also removes browser and password-manager autofill on mobile, where typing is
most expensive.

**G30 confirmation:** WCAG-1.3.5; also asserted statically by
`scripts/g30-static-a11y-contract-tests.mjs`.

**Provisional severity:** P2 — Level AA, and it is squarely in scope for a gate that certifies
mobile input.

---

## G30-D-009 — Result page has almost no heading structure

**Where:** `src/components/assessment/FreeSnapshot.tsx` — 704 lines containing two `<h3>` elements
and one `<h2>` (via `CardTitle`). Section titles throughout are `<p className="font-semibold">`
inside `<section aria-label="…">`.

**What breaks:** WCAG **1.3.1** and **2.4.6 Headings and Labels**. The result page carries the
executive interpretation, the critical-control warning, the commercial options and the private-link
instruction. A screen-reader user cannot navigate it by heading — the standard way to skim a long
result page. The `aria-label`ed sections help landmark navigation but do not substitute for
headings, and only three of roughly a dozen sections have them.

**G30 confirmation:** SR-08 (VoiceOver rotor heading list) and the heading-structure assertion in
`scripts/g30-device-a11y-browser-tests.mjs`.

**Provisional severity:** P2.

---

## G30-D-010 — Product-selection panel neither announced nor focused

**Where:** `FreeSnapshot.tsx` — selecting an option card conditionally renders
`ReportOrderSummary` / `OrderConfirmationPanel` / `PersonalisedReportForm` inside a plain `<div>`
with no `aria-live` and no focus move.

**What breaks:** WCAG **4.1.3 Status Messages**. A screen-reader user activates "Order the full
report", hears nothing, and has no indication that a summary and a confirm control appeared below.
On a phone the new panel is also below the fold, so a sighted touch user may not see it either.

**G30 confirmation:** CJ-15, SR-09, MOB-12.

**Provisional severity:** P2 — it sits directly on the revenue path.

---

## G30-D-011 — Compound `aria-live` announcement on every save

**Where:** `AdaptiveAssessmentExperience.tsx` — the status container is
`<div … aria-live="polite">` and contains the progress sentence, the counts sentence, the
`Saving… / Saved / Save needs attention` string and a `role="progressbar"`.

**What breaks:** every autosave mutates the save-state string inside a live region whose subtree
also holds the progress text, so the announcement is the whole block rather than the changed
string. With an autosave on every answer selection this is continuous. WCAG **4.1.3** is
technically satisfied; usability for screen-reader users is not.

**G30 confirmation:** SR-04 — count and transcribe announcements across five consecutive answers.

**Provisional severity:** P3.

---

## G30-D-012 — Unconditional `scroll-behavior: smooth`

**Where:** `src/app/globals.css`

```
html { scroll-behavior: smooth; }
```

with no `@media (prefers-reduced-motion: reduce)` override. `AssessmentEngine` correctly guards
its JS `scrollIntoView` on the media query, but the CSS rule still governs fragment navigation and
programmatic scrolls that do not opt out.

**What breaks:** users who set reduce-motion still get animated scrolling. WCAG 2.2 **2.3.3
Animation from Interactions** is AAA, so this is not an AA failure — it is recorded because the
product already honours reduce-motion elsewhere and this is an inconsistency.

**Provisional severity:** P3.

---

## G30-D-013 — Disabled Continue gives no reason

**Where:** `AdaptiveAssessmentExperience.tsx`

```
<Button … disabled={saveState === 'saving' || !response && !gatewayAnswers[currentNode.nodeId]}
        onClick={() => void continueFromCurrent()}>Continue</Button>
```

`continueFromCurrent()` contains `setMessage('Choose an answer before continuing.')`, but that
branch is unreachable: the button is disabled in exactly the case the message describes.

**What breaks:** a customer who does not realise an answer is required sees a greyed-out button
with no explanation. Screen-reader users hear "dimmed". WCAG **3.3.1 Error Identification** is not
strictly triggered (no submission occurred), so this is a usability defect with dead code behind
it.

**Provisional severity:** P3.

---

## G30-D-014 — Payment return polls indefinitely

**Where:** `src/components/payments/PaymentReturnStatus.tsx`

```
if (['PAYMENT_PENDING', 'PAYMENT_PROCESSING'].includes(body.payment.state)) timer = setTimeout(poll, 3000);
```

No attempt cap, no backoff, no ceiling. If a payment stays pending the page polls every three
seconds for as long as it is open.

**What breaks:** on mobile this is sustained radio and CPU use with no user-visible progress. It
also has no "still waiting, here is what to do" state after a reasonable interval. Relevant to
WCAG **2.2.1 Timing Adjustable** only indirectly — nothing expires — so this is a mobile-behaviour
defect.

**G30 confirmation:** MOB-14 — leave the payment return page open for ten minutes on a phone and
record request count and battery/thermal state.

**Provisional severity:** P3.

---

## G30-D-015 — View events may not fire at small viewports

**Where:** `FreeSnapshot.tsx` `TrackedSection`

```
new IntersectionObserver(…, { threshold: [0.5] })
```

**What breaks:** the observer only fires when at least 50% of the section is visible. The
executive-interpretation and commercial-options sections are taller than a 320px-wide viewport,
and taller still at 200% zoom, so `intersectionRatio` may never reach 0.5 and the corresponding
commercial event never fires. Conversion analytics would then under-report small-screen customers
specifically.

Not an accessibility defect. It is recorded here because the G30 viewport matrix is what surfaces
it, and because it would silently bias commercial data.

**G30 confirmation:** CJ-15c — capture `/commercial-event` network calls at 320px, at 390px and at
200% zoom and compare.

**Provisional severity:** P3.
