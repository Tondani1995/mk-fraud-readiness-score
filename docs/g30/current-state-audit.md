# G30 current-state audit

Audit basis: `23d5d7e10b389f98054587c09f44ee846be8172e`, read from an isolated clone. No file in
the certified tree was modified to produce this audit.

Classification key:

- **EXISTS AND REUSABLE** — present, credential-free or safely parameterised, usable in G30 as-is.
- **EXISTS BUT INCOMPLETE** — present and useful, but does not cover the certified customer
  journey or the G30 acceptance criteria.
- **PARTIALLY EXISTS** — the capability is implemented in the product but has no test coverage,
  or the coverage tests a superseded surface.
- **MISSING** — no implementation and no coverage.
- **REQUIRES MANUAL CERTIFICATION** — cannot be established by automation available to this
  repository; needs a human on real hardware.

---

## 1. Environment constraint that shapes the whole gate

`src/lib/adaptive/server.ts:41` —

```
export function assertAdaptivePreviewEnvironment() {
  if (process.env.VERCEL_ENV !== 'preview') throw new Error('adaptive_preview_only');
  if (configuredSupabaseProjectRef() !== PREVIEW_STAGING_PROJECT_REF) throw new Error('adaptive_staging_project_required');
}
```

It is called from `startAdaptiveAssessment` (`src/lib/adaptive/server.ts:66`) and from
`src/lib/scoring/adaptive-scoring.ts:348`.

Consequences for G30:

1. The certified adaptive customer journey **runs only on a Preview deployment bound to the
   Staging Supabase project**. It cannot be exercised on a local `next dev` server against a
   local database, and it cannot be exercised in Production.
2. Any genuine end-to-end run of J03–J14 therefore **creates Staging data**. Under the isolation
   rule for this branch, that is out of scope for preparation and belongs to G30 execution once
   G40/G41 releases the Staging environment.
3. Automation added on this branch consequently splits into two layers: server-independent
   checks that stub `/score/api/**`, and manual/live execution deferred to the runbook.

This is not a defect. It is the boundary condition the G30 plan is built around.

---

## 2. Area-by-area classification

### 2.1 Responsive tests

**EXISTS BUT INCOMPLETE.**

- `scripts/phase23-assessment-browser-tests.mjs` runs `puppeteer-core` over four viewports
  (320×700, 390×844, 768×1024, 1440×1000), asserts zero iframes, zero horizontal overflow, zero
  nested scroll containers, form visibility, and a minimum control height, and captures full-page
  screenshots. It emulates `prefers-reduced-motion: reduce`.
- `scripts/consolidation-assessment-height-browser.mjs` measures iframe height parity at desktop
  and mobile and stubs `/score/api/assessments/start` with a `422` via request interception, so
  it creates no records.

Gaps: both target `/fraud-readiness-score` and the **legacy** `/score/start` →
`/score/assessment/{ref}` journey. Neither touches `/score/adaptive/{ref}`, which is the
certified customer journey. The viewport set omits 375 and 430. There is no 200% zoom case, no
landscape case and no tablet-landscape case.

### 2.2 Accessibility checks

**MISSING.**

`package.json` at the certified SHA declares no `axe-core`, `pa11y`, `lighthouse`, `playwright`,
`jest`, `vitest`, `@testing-library/*` or `jsdom`. There is no automated accessibility assertion
anywhere in `scripts/`. The only accessibility-adjacent assertions are the reduced-motion media
emulation and minimum-control-height measurement in `phase23-assessment-browser-tests.mjs`.

### 2.3 Browser automation

**EXISTS AND REUSABLE.**

`puppeteer-core@24.34.0` and `@sparticuz/chromium@143.0.4` are production dependencies (they back
PDF rendering), so browser automation is available without adding a dependency. Seven scripts
already use it. The established idiom — `node:assert/strict`, request interception, an evidence
directory, `CHROME_EXECUTABLE` / `VERCEL_PROTECTION_BYPASS` environment overrides — is directly
reusable and is what the G30 scripts on this branch follow.

Constraint: puppeteer drives Chromium only. **Safari and Edge cannot be automated from this
repository.** WebKit-specific and Edge-specific behaviour is manual by construction.

### 2.4 Mobile-specific behaviour

**PARTIALLY EXISTS.**

Implemented in `src/components/layout/AppChrome.tsx`: when `assessmentActive` is true the shell
renders `min-h-[100dvh] overflow-x-hidden`, `pb-[env(safe-area-inset-bottom)]`,
`pt-[env(safe-area-inset-top)]`, a `min-h-16` header and a `min-h-11` "Exit assessment" control.

`assessmentActive` is computed as:

```
pathname === '/score/start' || pathname.startsWith('/score/assessment/')
```

`/score/adaptive/{assessmentRef}` does not match. The certified customer journey therefore does
not receive any of that mobile treatment. Recorded as **G30-D-001**.

Elsewhere: option labels are `min-h-14` / `min-h-16`, inputs are `min-h-12`, the legacy engine
has a `sm:hidden` "Jump to a section" `<select>` for mobile domain navigation. The adaptive
experience has **no** equivalent mobile section navigation — it is strictly one question per
screen with Back/Continue.

No mobile behaviour has automated coverage.

### 2.5 Keyboard and focus handling

**PARTIALLY EXISTS.**

- `AdaptiveAssessmentExperience` moves focus to a `tabIndex={-1}` `<h1>` on
  `[currentId, screen]` change. This is correct for question-to-question and question-to-review
  transitions.
- All interactive elements are native (`<button>`, `<input type="radio">`, `<input type="checkbox">`,
  `<details>/<summary>`, `<a>`). There are no custom roving-tabindex widgets, so baseline keyboard
  operability is inherited from the platform.
- `Button` applies `focus:outline-none focus:ring-2 focus:ring-mk-brass focus:ring-offset-2`.
  `#1d3658` on white measures ≈12.2:1, comfortably above the 3:1 non-text requirement.
- Raw `<input>` elements in `AdaptiveStartForm` carry no explicit focus style and fall back to the
  user-agent ring.

Gaps: no focus move on submission (**G30-D-005**); no focus trap, initial focus, Escape handler or
background inerting on the scope-change dialog (**G30-D-006**); no skip link (**G30-D-003**). No
automated coverage of any of it.

### 2.6 Screen-reader semantics

**PARTIALLY EXISTS.**

Present: `<html lang="en-ZA">`; `role="alert"` on error surfaces; `role="progressbar"` with
`aria-valuemin/max/now` and `aria-label`; `role="dialog" aria-modal="true" aria-labelledby` on the
invalidation modal; `<fieldset>/<legend>` around radio groups; `aria-live="polite"` on the
assessment status block and the payment-return card; `<section aria-label>` landmarks in
`FreeSnapshot`.

Gaps: generic legends that do not carry the question (**G30-D-007**); near-absent heading
hierarchy on the result page (**G30-D-009**); newly rendered order panels neither announced nor
focused (**G30-D-010**); compound `aria-live` announcements on save (**G30-D-011**); no page
titles on any `/score` route (**G30-D-002**).

No automated coverage. Screen-reader behaviour is **REQUIRES MANUAL CERTIFICATION** regardless —
VoiceOver and TalkBack output cannot be asserted from this repository.

### 2.7 PDF accessibility support

**MISSING for semantics; EXISTS AND REUSABLE for visual and content QA.**

- `scripts/checkpoint-f-pdf-audit.py` is a credential-free rendered-PDF audit with 42 distinct
  failure codes, covering page count, duplicate pages, blank and near-empty pages, visually blank
  rendered pages, TOC presence and page-number accuracy, bookmark presence, required sections,
  forbidden copy, forbidden URLs/emails/secrets/internal identifiers, and visual determinism.
- `src/lib/reports/pdf-navigation.ts` writes a real `/Outlines` bookmark tree and computes TOC page
  numbers from the final layout via a two-pass render.
- `src/lib/reports/templates/report-template.ts:544` emits `<html lang="en-ZA">` and a `<title>`.

The gap is structural: the PDF is produced by Chromium print-to-PDF
(`src/lib/reports/render-pdf.ts`). That path emits an **untagged** PDF — no `/StructTreeRoot`, no
`/MarkInfo`, no document `/Lang`, no artefact marking, no alternative text. Grepping the certified
tree for `StructTreeRoot`, `MarkInfo`, `PDF/UA` or `setLang` returns no production code. The HTML
`lang` and `<title>` do not survive into the PDF as accessibility properties.

Therefore: assistive-technology reading of the delivered PDF depends entirely on the reader
application's own heuristic reflow, not on document semantics. The PDF pack treats this as a
known, recorded architectural limitation rather than a defect to fix inside G30.

### 2.8 Form validation behaviour

**PARTIALLY EXISTS.**

`AdaptiveStartForm` uses native `required` plus `type="email"`, and renders server errors into a
`role="alert"` container. The adaptive question screens gate Continue on an answer being present.
Server-side validation lives in `src/lib/respondent/validation.ts`.

Gaps: no `autoComplete` attributes (**G30-D-008**); errors are not programmatically associated
with the offending field (`aria-describedby` / `aria-invalid` are absent); the disabled Continue
control gives no reason (**G30-D-013**). No automated coverage of validation presentation.

### 2.9 Save and resume

**EXISTS AND REUSABLE (server), MISSING (device coverage).**

Server side is well developed: `expectedSaveSequence` optimistic concurrency with a
`save_conflict` reason, a `gateway_change_confirmation_required` two-phase confirmation, a
`reload()` path, and `src/lib/assessment-experience/resume-capability.ts`. The legacy engine
additionally persists unsaved answers to `sessionStorage` and exposes an offline state; the
adaptive experience does **not** have a sessionStorage fallback.

No test exercises save/resume across a device or browser restart, backgrounded tab, or network
transition. That is the G30 contribution.

### 2.10 Adaptive navigation

**PARTIALLY EXISTS.**

Engine coverage is strong and credential-free where it is unit-level:
`scripts/g25-adaptive-engine-tests.mjs`, `scripts/g27-adaptive-correction-tests.mjs`,
`scripts/g27-adaptive-gateway-audit-tests.mjs`, `scripts/g29-adaptive-branch-matrix-tests.mjs`.
`scripts/g25-adaptive-db-integration.mjs` and `scripts/g24-g28-staging-verification.sql` require a
database.

None of these render the UI. Branching is verified as data, never as a screen a customer sees on
a device. Progressive navigation semantics — selecting an answer autosaves and *holds position*
(`preservePosition = true` in `chooseGateway`/`chooseControl`), then Continue advances — have no
UI-level coverage at all.

### 2.11 Result page

**PARTIALLY EXISTS.**

`FreeSnapshotCard` (704 lines) is rendered by both `/score/snapshot/{ref}` and the legacy engine's
post-submit state. It has `<section aria-label>` grouping and responsive grids
(`md:grid-cols-5`, `md:grid-cols-4`, `lg:grid-cols-3`), which is a reasonable reflow starting
point. It contains no `<table>`, `<svg>` or `<canvas>`, so there is no chart or data-table
accessibility surface to certify on this page.

Gaps: heading structure (**G30-D-009**), and the `TrackedSection` `IntersectionObserver` threshold
of `0.5` — a section taller than the viewport at 320px or 200% zoom may never reach 50% visibility,
so its commercial-view event may not fire. That is an analytics-fidelity risk under the G30
viewport matrix, recorded as **G30-D-015**.

### 2.12 Purchase flow

**PARTIALLY EXISTS — and must not be executed by G30 automation.**

`FreeSnapshot` renders two option cards, a report-order summary, an order-confirmation panel and a
personalised-report enquiry form. `POST /score/api/assessments/{ref}/report-request` and
`/personalised-report-request` create real commercial records. `/score/api/payments/...` and the
Stitch adapter execute real payment operations.

`scripts/phase23-payment-assessment-tests.mjs`, `scripts/g29-payment-verification-contract-tests.mjs`
and the `g29-disposable-payment-fixture*.sql` pair cover the payment contract, but they are
database-bound.

For G30 the purchase flow is a **presentation and device** certification only: card layout, option
selection, tap targets, keyboard operability, announcement of the revealed panel, and the payment
return status surface. Order creation and payment execution remain outside the gate.

### 2.13 Customer report access

**PARTIALLY EXISTS.**

`src/app/score/report/access/[token]/route.ts` validates the durable token, issues a fresh
short-lived signed URL per access and 307-redirects to it. `scripts/g29-customer-report-access-tests.mjs`
and `scripts/phase14-report-access-eligibility-tests.mjs` cover eligibility logic.

The customer-visible **failure** surface is a hand-built HTML string with no `lang`, no `<title>`
and no viewport meta (**G30-D-004**). On a phone it renders at desktop width. This is the page a
paying customer sees when a link expires, and it has no coverage.

### 2.14 Admin login and report controls

**EXISTS BUT INCOMPLETE, and deliberately deprioritised.**

`AdminShell`, `AdminLoginForm`, `MfaEnrollment`, `ProtectedAdminPage`, `FulfilmentActions`,
`FulfilmentReviewPanel`, `DeliveryAccessPanel`, `OperationalAlertsControl` exist, plus route-level
access control documented in `docs/v1/security/route-access-control-matrix.md`.

Admin surfaces are internal, desktop-first and credential-gated. G30 covers them at a reduced
scope: desktop Chrome and desktop Safari, keyboard operability of the login and the fulfilment
controls, and no mobile or screen-reader certification. Executing them requires an owner
credential, which no agent holds.

---

## 3. Summary table

| Area | Classification |
| --- | --- |
| Responsive tests | EXISTS BUT INCOMPLETE |
| Accessibility checks | MISSING |
| Browser automation | EXISTS AND REUSABLE (Chromium only) |
| Mobile-specific behaviour | PARTIALLY EXISTS |
| Keyboard / focus handling | PARTIALLY EXISTS |
| Screen-reader semantics | PARTIALLY EXISTS / REQUIRES MANUAL CERTIFICATION |
| PDF accessibility (semantic) | MISSING |
| PDF quality (visual/content) | EXISTS AND REUSABLE |
| Form validation behaviour | PARTIALLY EXISTS |
| Save / resume | EXISTS AND REUSABLE (server) / MISSING (device) |
| Adaptive navigation | PARTIALLY EXISTS (engine only, never rendered) |
| Result page | PARTIALLY EXISTS |
| Purchase flow | PARTIALLY EXISTS — presentation only within G30 |
| Customer report access | PARTIALLY EXISTS |
| Admin login / report controls | EXISTS BUT INCOMPLETE — reduced G30 scope |
| Safari / Edge behaviour | REQUIRES MANUAL CERTIFICATION |
| VoiceOver / TalkBack behaviour | REQUIRES MANUAL CERTIFICATION |
| 200% zoom, orientation, touch | REQUIRES MANUAL CERTIFICATION (partially automatable) |

---

## 4. What this audit does not establish

- It does not establish that the certified SHA passes G30. Nothing has been executed.
- It does not establish WCAG conformance of any kind.
- It reads the certified tree only. It does not read the deployed Preview, Staging data,
  Production data or Vercel configuration.
