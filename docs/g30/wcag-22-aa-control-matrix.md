# G30 WCAG 2.2 AA control matrix

**This document does not claim, and must not be used to claim, formal WCAG conformance.** It is an
internal control matrix that maps WCAG 2.2 Level A and AA success criteria onto MK surfaces so
that G30 produces auditable evidence against a recognised standard. A conformance claim requires a
separate, independent evaluation with a full conformance-evaluation report.

Basis SHA: `23d5d7e10b389f98054587c09f44ee846be8172e`.

## Method column

- **AUTO** — asserted by `scripts/g30-device-a11y-browser-tests.mjs` or
  `scripts/g30-static-a11y-contract-tests.mjs`.
- **MANUAL** — human judgement required, any device.
- **DEVICE** — requires real hardware (iPhone/Android) or a real assistive technology.

Automated checks find violations; they never establish conformance. Every AUTO row also carries a
MANUAL confirmation for the criterion as a whole.

## Surfaces

| Code | Surface |
| --- | --- |
| S1 | Landing / product page (J01) |
| S2 | Start page and start form (J02, J03) |
| S3 | Adaptive assessment — gateway and control screens (J04–J11) |
| S4 | Scope-change dialog (J06) |
| S5 | Review screen (J12) |
| S6 | Completion card (J13) |
| S7 | Snapshot / result (J14) |
| S8 | Commercial options and order panels (J15, J16) |
| S9 | Payment return (J17, J18) |
| S10 | Report access error page (J19) |
| S11 | Delivered PDF (J20) |
| S12 | Admin console (reduced scope) |

Note: WCAG 2.2 removed 4.1.1 Parsing; it is not assessed. Criteria 1.2.x (time-based media) are
not applicable — no audio or video exists in any surface.

---

## Perceivable

### 1.1.1 Non-text Content — Level A

| | |
| --- | --- |
| **Surfaces** | S1, S2, S3, S7, S11 |
| **Method** | AUTO + MANUAL |
| **Procedure** | Enumerate every `<img>`, `<svg>`, icon and decorative glyph on each surface. For each, decide whether it conveys information. Confirm informative images have a meaningful `alt`, and decorative ones have `alt=""` or `aria-hidden="true"`. Repeat for the PDF (see the PDF pack). |
| **Pass condition** | No image without an `alt` attribute. No decorative image with a non-empty `alt`. No information conveyed only by an unlabelled glyph. |
| **Notes at this SHA** | `Header`/`Footer` logos carry `alt="MK Fraud Insights"`. `FreeSnapshot` contains no `<svg>`, `<canvas>` or `<table>`. The legacy engine uses a `✓` glyph with `aria-label="Selected"`; the adaptive experience does not use glyph-only state. |
| **Evidence** | Image inventory JSON per surface + reviewer note |
| **Severity if failed** | P2; P1 if an unlabelled control image gates the journey |

### 1.3.1 Info and Relationships — Level A

| | |
| --- | --- |
| **Surfaces** | S2, S3, S4, S5, S7, S8 |
| **Method** | AUTO (structure dump) + MANUAL (judgement) + DEVICE (screen reader) |
| **Procedure** | Dump the heading tree, landmark tree, form-control/label pairs and group (`fieldset`/`legend`, `role=group`) associations per surface. Confirm the visual structure is reflected programmatically. |
| **Pass condition** | Every visually apparent grouping, heading and label has a programmatic equivalent; heading levels do not skip. |
| **Known open** | **G30-D-007** (generic legends), **G30-D-009** (result page has two `<h3>` in 704 lines and uses `<p class="font-semibold">` as section titles) |
| **Evidence** | Structure JSON per surface + VoiceOver rotor screenshot |
| **Severity if failed** | P2 |

### 1.3.2 Meaningful Sequence — Level A

| | |
| --- | --- |
| **Surfaces** | S3, S5, S7, S8 |
| **Method** | AUTO + MANUAL |
| **Procedure** | Disable CSS (or read the DOM order) and confirm the reading order still conveys the intended sequence. Pay attention to the CSS-grid sections in `FreeSnapshot` and the flex reordering in the question footer. |
| **Pass condition** | DOM order matches the intended reading order at every breakpoint; no `order`/`flex-direction: row-reverse` that changes meaning. |
| **Evidence** | CSS-disabled screenshot per surface |
| **Severity if failed** | P2 |

### 1.3.3 Sensory Characteristics — Level A

| | |
| --- | --- |
| **Surfaces** | S3, S7, S8 |
| **Method** | MANUAL |
| **Procedure** | Search all customer copy for instructions that depend on shape, size, position or sound ("the button on the right", "the green box"). |
| **Pass condition** | No instruction relies solely on a sensory characteristic. |
| **Evidence** | Copy review note |
| **Severity if failed** | P2 |

### 1.3.4 Orientation — Level AA

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | DEVICE |
| **Procedure** | On DB-A and DB-B, rotate to landscape at each journey step. Confirm no orientation lock and no content loss. |
| **Pass condition** | Every surface is operable in both portrait and landscape; no CSS or manifest orientation lock. |
| **Evidence** | Landscape screenshot per surface |
| **Severity if failed** | P1 |

### 1.3.5 Identify Input Purpose — Level AA

| | |
| --- | --- |
| **Surfaces** | S2, S8 |
| **Method** | AUTO |
| **Procedure** | Enumerate every input that collects information about the user and check for a correct `autocomplete` token. |
| **Pass condition** | `fullName` → `name`; `email` → `email`; `organisationName` → `organization`; `roleTitle` → `organization-title`; enquiry-form contact fields likewise. |
| **Known open** | **G30-D-008** — no `autoComplete` attribute on any start-form field |
| **Evidence** | Input inventory JSON |
| **Severity if failed** | P2 |

### 1.4.1 Use of Color — Level A

| | |
| --- | --- |
| **Surfaces** | S3, S5, S7, S8 |
| **Method** | MANUAL |
| **Procedure** | Convert screenshots of each state-bearing surface to greyscale. Confirm selected answers, error states, progress and option selection remain distinguishable. |
| **Pass condition** | Every state is conveyed by at least one non-colour signal (see MOB-10). |
| **Evidence** | Greyscale screenshot pair per state |
| **Severity if failed** | P2 |

### 1.4.3 Contrast (Minimum) — Level AA

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | AUTO (sampling) + MANUAL (confirmation) |
| **Procedure** | Sample computed foreground/background for every text node class on each surface and compute the contrast ratio. Manually confirm the lowest ten. |
| **Pass condition** | ≥ 4.5:1 for body text; ≥ 3:1 for text ≥ 18.66 px bold or ≥ 24 px. |
| **Palette reference** | `mk-ink`/`mk-charcoal` `#001030`, `mk-muted` `#475569`, `mk-line` `#E2E8F0`, `mk-brass` `#1d3658`, `mk-danger` `#9B2C2C`, `mk-success` `#2F6B4F` on `mk-paper` `#FFFFFF` / `mk-cream` `#F8FAFC`. Explicitly check the low-opacity compositions: `text-white/55`, `text-white/60`, `text-white/70`, `text-white/75` and `text-white/80` on `mk-charcoal`, used in the footer and in the dark start-page card. `white/55` on `#001030` is the weakest and must be measured, not assumed. |
| **Evidence** | Contrast sample JSON + annotated screenshot of any sample below threshold |
| **Severity if failed** | P2; P1 if the failing text is a price, a payment state or an error message |

### 1.4.4 Resize Text — Level AA

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | AUTO + MANUAL |
| **Procedure** | Set browser zoom to 200% at VP-DESK. Confirm all content and functionality remain available. |
| **Pass condition** | No loss of content or function; no clipped controls. |
| **Known risk** | **G30-D-006** — the scope-change dialog may push its buttons out of view at 200%. |
| **Evidence** | 200% screenshot per surface |
| **Severity if failed** | P1 |

### 1.4.5 Images of Text — Level AA

| | |
| --- | --- |
| **Surfaces** | S1–S11 |
| **Method** | MANUAL |
| **Procedure** | Confirm no text is delivered as a raster image except the logo. |
| **Pass condition** | Only the logo is an image of text. |
| **Evidence** | Reviewer note |
| **Severity if failed** | P3 |

### 1.4.10 Reflow — Level AA

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | AUTO + DEVICE |
| **Procedure** | Render each surface at 320 CSS px width (VP-320, and 400% zoom at VP-DESK). Measure `scrollWidth - innerWidth`. |
| **Pass condition** | `0` horizontal overflow; no two-dimensional scrolling; no clipped content. |
| **Known open** | **G30-D-004** — the report-access error page declares no viewport meta and cannot reflow at all on mobile. |
| **Evidence** | Overflow measurement JSON + screenshot at 320 |
| **Severity if failed** | P1 |

### 1.4.11 Non-text Contrast — Level AA

| | |
| --- | --- |
| **Surfaces** | S2, S3, S4, S5, S7, S8 |
| **Method** | AUTO + MANUAL |
| **Procedure** | Measure contrast of: input borders (`mk-line` `#E2E8F0` on white), unselected option-card borders, the selected-option border (`mk-charcoal`), the progress-bar fill against its track, the focus ring (`mk-brass` `#1d3658`), and checkbox/radio boundaries. |
| **Pass condition** | ≥ 3:1 against adjacent colours for every component boundary and state indicator. |
| **Note at this SHA** | The focus ring `#1d3658` on white measures ≈12.2:1 and is expected to pass comfortably. `mk-line` `#E2E8F0` on `#FFFFFF` measures ≈1.2:1 — an unselected input or option border is therefore **expected to fail** unless the native control boundary carries the requirement. Measure the composite and record it precisely; this is the single most likely genuine AA contrast finding. |
| **Evidence** | Boundary contrast JSON + annotated screenshot |
| **Severity if failed** | P2 |

### 1.4.12 Text Spacing — Level AA

| | |
| --- | --- |
| **Surfaces** | S2, S3, S7, S8 |
| **Method** | MANUAL |
| **Procedure** | Apply the standard override — line height 1.5×, paragraph spacing 2×, letter spacing 0.12em, word spacing 0.16em — and confirm no content is lost or clipped. |
| **Pass condition** | No overlap, no clipping, no loss of function. |
| **Watch** | The fixed-height option labels (`min-h-14`, `min-h-16`) are minimums, so they should grow; confirm they do. |
| **Evidence** | Before/after screenshot per surface |
| **Severity if failed** | P2 |

### 1.4.13 Content on Hover or Focus — Level AA

| | |
| --- | --- |
| **Surfaces** | S1, S3, S7 |
| **Method** | MANUAL |
| **Procedure** | Identify any content that appears on hover or focus. Confirm it is dismissable, hoverable and persistent. |
| **Pass condition** | Satisfied, or no such content exists. |
| **Note at this SHA** | The evidence guidance uses `<details>/<summary>`, which is click/activate-triggered rather than hover-triggered, so this criterion is expected to be not applicable. Confirm rather than assume. |
| **Evidence** | Reviewer note |
| **Severity if failed** | P3 |

---

## Operable

### 2.1.1 Keyboard — Level A

| | |
| --- | --- |
| **Surfaces** | S1–S10, S12 |
| **Method** | AUTO (reachability) + MANUAL (full traversal) |
| **Procedure** | Complete every journey step using keyboard only. See KB-01…KB-10 in the keyboard pack. |
| **Pass condition** | Every function is operable from the keyboard; no pointer-only interaction exists. |
| **Evidence** | Screen recording of a full keyboard journey |
| **Severity if failed** | P1 |

### 2.1.2 No Keyboard Trap — Level A

| | |
| --- | --- |
| **Surfaces** | S3, S4, S8 |
| **Method** | MANUAL |
| **Procedure** | At every focusable element, confirm focus can move away using standard keys. Test the scope-change dialog specifically. |
| **Pass condition** | No trap. |
| **Note** | The dialog has *no* focus containment (G30-D-006). That is the inverse problem — a leak, not a trap — so 2.1.2 is expected to pass while 2.4.3 fails. Record both accurately. |
| **Evidence** | Screen recording |
| **Severity if failed** | P0 |

### 2.1.4 Character Key Shortcuts — Level A

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | MANUAL |
| **Procedure** | Confirm no single-character shortcut exists, or that one can be remapped or disabled. |
| **Pass condition** | Satisfied. No custom `keydown` shortcut handlers exist at this SHA — confirm. |
| **Evidence** | Reviewer note |
| **Severity if failed** | P2 |

### 2.2.1 Timing Adjustable — Level A

| | |
| --- | --- |
| **Surfaces** | S3, S9, S10 |
| **Method** | MANUAL + DEVICE |
| **Procedure** | Identify every time limit: resume-token expiry, snapshot-token expiry, report-access token expiry, rate-limit windows, and the 3 s payment poll. For each, confirm the customer is warned, can extend, or the limit is essential. |
| **Pass condition** | Every non-essential limit is adjustable or extendable; security token lifetimes qualify for the essential exception but must still be **announced** to the customer before expiry where the customer is mid-task. |
| **Related** | **G30-D-014** (unbounded poll — not a 2.2.1 failure but recorded alongside) |
| **Evidence** | Token-lifetime inventory + screenshot of each expiry surface |
| **Severity if failed** | P1 |

### 2.2.2 Pause, Stop, Hide — Level A

| | |
| --- | --- |
| **Surfaces** | S3, S9 |
| **Method** | MANUAL |
| **Procedure** | Identify any content that moves, blinks, scrolls or auto-updates for more than five seconds. The payment-return auto-poll updates text automatically. |
| **Pass condition** | Auto-updating content can be paused, stopped or hidden, or the update is essential. Verified payment status is arguably essential — record the reasoning explicitly rather than assuming it. |
| **Evidence** | Screen recording ≥ 60 s of the payment return page |
| **Severity if failed** | P2 |

### 2.3.1 Three Flashes or Below — Level A

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | MANUAL |
| **Pass condition** | No flashing content. Expected trivially satisfied. |
| **Evidence** | Reviewer note |
| **Severity if failed** | P0 |

### 2.4.1 Bypass Blocks — Level A

| | |
| --- | --- |
| **Surfaces** | S1, S2, S3, S7, S8 |
| **Method** | AUTO + MANUAL |
| **Procedure** | Tab from page load and confirm a mechanism exists to skip repeated blocks. |
| **Pass condition** | A skip link, or landmark structure sufficient for the assistive technology in use. |
| **Known open** | **G30-D-003** — no skip link anywhere. Compounded by **G30-D-001**: the marketing header repeats on every adaptive question screen. |
| **Evidence** | Tab-order recording from page load |
| **Severity if failed** | P2, raised to P1 if the header repeats per question |

### 2.4.2 Page Titled — Level A

| | |
| --- | --- |
| **Surfaces** | S2, S3, S5, S6, S7, S8, S9, S10 |
| **Method** | AUTO |
| **Procedure** | Read `document.title` on every journey route. |
| **Pass condition** | Every page has a descriptive, unique title. |
| **Known open** | **G30-D-002** (no metadata under `/score/**`) and **G30-D-004** (no `<title>` on the report-access error page) |
| **Evidence** | Title inventory JSON |
| **Severity if failed** | P1 |

### 2.4.3 Focus Order — Level A

| | |
| --- | --- |
| **Surfaces** | S2, S3, S4, S6, S8 |
| **Method** | MANUAL + DEVICE |
| **Procedure** | Record where focus lands after: advancing a question, going back, opening the dialog, closing the dialog, submitting the assessment, and selecting a product option. |
| **Pass condition** | Focus always lands on a meaningful, announced element related to the change. |
| **Known open** | **G30-D-005** (focus lost on submit), **G30-D-006** (no dialog focus management), **G30-D-010** (no focus move to the revealed order panel) |
| **Evidence** | Screen recording + `document.activeElement` capture at each transition |
| **Severity if failed** | P1 |

### 2.4.4 Link Purpose (In Context) — Level A

| | |
| --- | --- |
| **Surfaces** | S1, S6, S7, S9, S10 |
| **Method** | MANUAL |
| **Procedure** | List every link and confirm its purpose is clear from its text or immediate context. |
| **Pass condition** | No bare "click here"/"read more" without context. |
| **Evidence** | Link inventory per surface |
| **Severity if failed** | P2 |

### 2.4.5 Multiple Ways — Level AA

| | |
| --- | --- |
| **Surfaces** | S1, S7 |
| **Method** | MANUAL |
| **Procedure** | Confirm more than one way to locate each page, **or** that the page is a step in a process (which is an explicit exception). |
| **Pass condition** | Assessment screens, review, completion, order and payment return are process steps and take the exception. The landing page and the result page must be reachable by more than one route, or the exception must be argued in writing. |
| **Evidence** | Route note |
| **Severity if failed** | P3 |

### 2.4.6 Headings and Labels — Level AA

| | |
| --- | --- |
| **Surfaces** | S2, S3, S5, S7, S8 |
| **Method** | AUTO + MANUAL |
| **Procedure** | Confirm every heading and label describes its topic or purpose. |
| **Known open** | **G30-D-007** (generic legends), **G30-D-009** (result page section titles are not headings) |
| **Evidence** | Heading/label inventory |
| **Severity if failed** | P2 |

### 2.4.7 Focus Visible — Level AA

| | |
| --- | --- |
| **Surfaces** | S1–S10, S12 |
| **Method** | AUTO + MANUAL |
| **Procedure** | Tab through every focusable element and confirm a visible indicator. |
| **Pass condition** | Every focusable element shows a visible focus indicator against its background. |
| **Note at this SHA** | `Button` sets `focus:outline-none focus:ring-2 focus:ring-mk-brass focus:ring-offset-2` — a strong ring, but bound to `:focus` not `:focus-visible`, so it also appears on mouse activation. That is not a failure. Raw `<input>` elements in `AdaptiveStartForm` carry **no** explicit focus style and rely on the user-agent ring; verify that ring is visible on the white input background in Safari specifically, where the default ring is weakest. |
| **Evidence** | Focus screenshot for every distinct control class |
| **Severity if failed** | P1 |

### 2.4.11 Focus Not Obscured (Minimum) — Level AA *(new in 2.2)*

| | |
| --- | --- |
| **Surfaces** | S2, S3, S4, S8 |
| **Method** | MANUAL + DEVICE |
| **Procedure** | With the on-screen keyboard open (DB-A, DB-B) and with the scope-change dialog open, tab to each control and confirm the focused element is not entirely hidden by other content. |
| **Pass condition** | No focused element is fully obscured by sticky content, the dialog overlay or the mobile keyboard. |
| **Related** | **G30-D-006**; also check `Card`'s `overflow-hidden` against `ring-offset-2` on controls at a card edge. |
| **Evidence** | Screenshot at each obscuring condition |
| **Severity if failed** | P1 |

### 2.5.1 Pointer Gestures — Level A

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | DEVICE |
| **Pass condition** | No multipoint or path-based gesture is required. Expected satisfied — no swipe, pinch or drag interaction exists. Confirm rather than assume. |
| **Evidence** | Reviewer note |
| **Severity if failed** | P1 |

### 2.5.2 Pointer Cancellation — Level A

| | |
| --- | --- |
| **Surfaces** | S3, S8 |
| **Method** | DEVICE |
| **Procedure** | Press an answer option, drag off it, release. Confirm the action does not fire. |
| **Pass condition** | Actions fire on up-event, not down-event, and are abortable. |
| **Evidence** | Screen recording |
| **Severity if failed** | P2 |

### 2.5.3 Label in Name — Level A

| | |
| --- | --- |
| **Surfaces** | S2, S3, S7, S8 |
| **Method** | AUTO + DEVICE |
| **Procedure** | For each control with visible text, confirm the accessible name contains that visible text. |
| **Watch at this SHA** | `AdaptiveAssessmentExperience` and `AssessmentEngine` both strip identifier prefixes from displayed copy via a `label()`/`publicLabel()` regex. Confirm the accessible name matches the *displayed* string, not the raw one, so voice-control users can say what they see. |
| **Evidence** | Accessible-name inventory |
| **Severity if failed** | P2 |

### 2.5.4 Motion Actuation — Level A

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | DEVICE |
| **Pass condition** | No function is triggered by device motion. Expected satisfied. |
| **Evidence** | Reviewer note |
| **Severity if failed** | P2 |

### 2.5.7 Dragging Movements — Level AA *(new in 2.2)*

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | DEVICE |
| **Pass condition** | No dragging is required. Expected satisfied — no slider, no reorderable list, no drag target exists in the customer journey. Confirm on the admin surfaces too. |
| **Evidence** | Reviewer note |
| **Severity if failed** | P1 |

### 2.5.8 Target Size (Minimum) — Level AA *(new in 2.2)*

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | AUTO + DEVICE |
| **Procedure** | Measure every target's bounding box; see MOB-05. |
| **Pass condition** | ≥ 24 × 24 CSS px, or the spacing exception is met. |
| **Note at this SHA** | Option labels (56–64 px) and inputs (48 px) should pass comfortably. The 16 px checkboxes in `AdaptiveStartForm` are wrapped in a full-width `<label>`, so measure the **label**, which is the actual target. |
| **Evidence** | Target-size JSON per surface per viewport |
| **Severity if failed** | P1 |

---

## Understandable

### 3.1.1 Language of Page — Level A

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | AUTO |
| **Pass condition** | Every document declares a valid `lang`. |
| **Note** | `src/app/layout.tsx` sets `lang="en-ZA"` for the app. |
| **Known open** | **G30-D-004** — the report-access error page emits `<html>` with no `lang`. |
| **Evidence** | `lang` inventory JSON |
| **Severity if failed** | P1 |

### 3.1.2 Language of Parts — Level AA

| | |
| --- | --- |
| **Surfaces** | S1–S11 |
| **Method** | MANUAL |
| **Pass condition** | Any passage in another language carries its own `lang`. Expected trivially satisfied. |
| **Evidence** | Reviewer note |
| **Severity if failed** | P3 |

### 3.2.1 On Focus — Level A

| | |
| --- | --- |
| **Surfaces** | S2, S3, S8 |
| **Method** | MANUAL |
| **Pass condition** | Focusing a control never changes context. |
| **Evidence** | Screen recording of a keyboard traversal |
| **Severity if failed** | P1 |

### 3.2.2 On Input — Level A

| | |
| --- | --- |
| **Surfaces** | S3, S8 |
| **Method** | MANUAL |
| **Procedure** | Select an answer and observe. |
| **Pass condition** | Changing a setting does not automatically change context unless the user was advised beforehand. |
| **Note at this SHA** | The adaptive experience calls `persist(..., preservePosition = true)` on selection — it autosaves but **holds position**, requiring an explicit Continue. That is the conforming behaviour and should pass. The legacy `AssessmentEngine` does auto-advance and scroll on selection; if any legacy route is in the certified journey, assess it separately against this criterion. |
| **Evidence** | Screen recording of five consecutive selections |
| **Severity if failed** | P1 |

### 3.2.3 Consistent Navigation — Level AA

| | |
| --- | --- |
| **Surfaces** | S1–S9 |
| **Method** | MANUAL |
| **Pass condition** | Repeated navigation appears in the same relative order across pages. |
| **Watch** | **G30-D-001** produces an inconsistency: `/score/start` renders the assessment shell while `/score/adaptive/{ref}` renders the marketing shell, so navigation changes between two adjacent steps of the same journey. |
| **Evidence** | Side-by-side screenshots of consecutive journey steps |
| **Severity if failed** | P2 |

### 3.2.4 Consistent Identification — Level AA

| | |
| --- | --- |
| **Surfaces** | S2–S9 |
| **Method** | MANUAL |
| **Pass condition** | Components with the same function are labelled consistently across the journey ("Save now", "Continue", "Back"). |
| **Evidence** | Label inventory across surfaces |
| **Severity if failed** | P3 |

### 3.2.6 Consistent Help — Level A *(new in 2.2)*

| | |
| --- | --- |
| **Surfaces** | S1–S10 |
| **Method** | MANUAL |
| **Procedure** | Identify every help mechanism (contact email, support instruction). Confirm it appears in the same relative order wherever it appears. |
| **Pass condition** | Consistent placement, or help is offered on only one page. |
| **Note** | `hello@mkfraud.co.za` appears in the start-form error copy and in the footer; the report-access error page says "Contact support" with no address. Assess whether that is a consistency failure or an absence. |
| **Evidence** | Help-mechanism inventory |
| **Severity if failed** | P2 |

### 3.3.1 Error Identification — Level A

| | |
| --- | --- |
| **Surfaces** | S2, S3, S8, S9 |
| **Method** | MANUAL + DEVICE |
| **Procedure** | Trigger every error path in the journey pack (CJ-03b…f, CJ-07c, CJ-07d, CJ-10a…c, CJ-16b, CJ-17c). |
| **Pass condition** | The error is described in text and the item in error is identified. |
| **Known open** | **G30-D-013** — the disabled Continue control gives no reason. Errors are also not associated with fields via `aria-invalid`/`aria-describedby`. |
| **Evidence** | Screenshot + screen-reader transcript per error path |
| **Severity if failed** | P1 |

### 3.3.2 Labels or Instructions — Level A

| | |
| --- | --- |
| **Surfaces** | S2, S3, S8 |
| **Method** | AUTO + DEVICE |
| **Pass condition** | Every input has a label; groups carry instructions where needed. |
| **Known open** | **G30-D-007** |
| **Evidence** | Label inventory + screen-reader transcript |
| **Severity if failed** | P1 |

### 3.3.3 Error Suggestion — Level AA

| | |
| --- | --- |
| **Surfaces** | S2, S3, S8, S9 |
| **Method** | MANUAL |
| **Pass condition** | Where a correction is known, it is suggested — for example "Enter a work email address in the form name@organisation.co.za", not just "Invalid email". |
| **Procedure** | For every message in CJ-10a, judge whether a correction is offered. |
| **Evidence** | Message inventory with a per-message judgement |
| **Severity if failed** | P2 |

### 3.3.4 Error Prevention (Legal, Financial, Data) — Level AA

| | |
| --- | --- |
| **Surfaces** | S8, S9 |
| **Method** | MANUAL |
| **Procedure** | For the order submission, confirm it is reversible, checked, or confirmed. |
| **Pass condition** | The order summary presents the full commercial terms and requires an explicit confirm step, and the customer can review before committing. |
| **Related** | The scope-change dialog is the equivalent control for destructive answer invalidation and must be assessed here as well (**G30-D-006** blocks it on small viewports). |
| **Evidence** | Screen recording of the confirm sequence |
| **Severity if failed** | P0 if an order can be placed without a review step; otherwise P1 |

### 3.3.7 Redundant Entry — Level A *(new in 2.2)*

| | |
| --- | --- |
| **Surfaces** | S2, S3, S8 |
| **Method** | MANUAL |
| **Procedure** | Complete the start form, resume the assessment, then reach the order surfaces. Confirm previously entered information is not re-requested. |
| **Pass condition** | No information is asked for twice in the same process unless re-entry is essential. |
| **Evidence** | Screen recording of the full journey |
| **Severity if failed** | P2 |

### 3.3.8 Accessible Authentication (Minimum) — Level AA *(new in 2.2)*

| | |
| --- | --- |
| **Surfaces** | S3, S10 (customer), S12 (admin) |
| **Method** | MANUAL |
| **Procedure** | Identify every authentication step. |
| **Pass condition** | No cognitive function test without an alternative. |
| **Note** | The customer journey has **no** authentication — possession of the private URL is the access control, which means no cognitive function test exists and the criterion is satisfied by construction for S3 and S10. Record that reasoning explicitly. The **admin** console does authenticate and uses MFA; assess the MFA step (code entry is permitted; a puzzle or transcription test would not be). |
| **Evidence** | Authentication inventory + admin MFA recording |
| **Severity if failed** | P1 |

---

## Robust

### 4.1.2 Name, Role, Value — Level A

| | |
| --- | --- |
| **Surfaces** | S2, S3, S4, S5, S7, S8, S9 |
| **Method** | AUTO + DEVICE |
| **Procedure** | Dump the accessibility tree per surface. Confirm every interactive element exposes a correct name, role and current value/state. |
| **Pass condition** | Radios expose checked state; the progress bar exposes `aria-valuenow`; the dialog exposes `dialog` with a name; disabled controls expose disabled; `<details>` exposes expanded/collapsed. |
| **Known open** | **G30-D-006** — `aria-modal="true"` is asserted but not honoured, which misrepresents the dialog's actual behaviour to assistive technology. |
| **Evidence** | Accessibility-tree JSON per surface |
| **Severity if failed** | P1 |

### 4.1.3 Status Messages — Level AA

| | |
| --- | --- |
| **Surfaces** | S3, S8, S9 |
| **Method** | DEVICE |
| **Procedure** | With a screen reader, trigger: an autosave, a save failure, a save conflict, submission, product selection, and a payment-state change. |
| **Pass condition** | Each status change is announced without moving focus, exactly once, and comprehensibly. |
| **Known open** | **G30-D-010** (no announcement on product selection), **G30-D-011** (compound announcement on every save) |
| **Evidence** | Screen-reader transcript per status change |
| **Severity if failed** | P2 |

---

## Summary of criteria expected to fail at this SHA

Based on source reading only. **These are predictions to be confirmed or refuted by execution, not
results.**

| Criterion | Level | Expected finding | Defect |
| --- | --- | --- | --- |
| 2.4.2 Page Titled | A | Confirmed absent across `/score/**` | G30-D-002, G30-D-004 |
| 3.1.1 Language of Page | A | Absent on the report-access error page | G30-D-004 |
| 2.4.1 Bypass Blocks | A | No skip mechanism | G30-D-003 |
| 2.4.3 Focus Order | A | Focus lost on submit; dialog unmanaged | G30-D-005, G30-D-006 |
| 1.3.5 Identify Input Purpose | AA | No `autocomplete` tokens | G30-D-008 |
| 1.4.10 Reflow | AA | Report-access error page cannot reflow | G30-D-004 |
| 1.4.11 Non-text Contrast | AA | `mk-line` borders ≈1.2:1 — measure and confirm | new if confirmed |
| 2.4.6 Headings and Labels | AA | Result page lacks headings; legends generic | G30-D-007, G30-D-009 |
| 4.1.3 Status Messages | AA | No announcement on product selection | G30-D-010 |
