# G30 mobile UX test pack

Objective PASS/FAIL criteria for the MK customer journey on real phones. Every criterion below is
measurable — no criterion depends on a reviewer's impression.

Devices: DB-A (iPhone Safari) and DB-B (Android Chrome) from
[device-browser-matrix.md](device-browser-matrix.md). Viewports VP-320, VP-375, VP-390, VP-430.

Measurement helpers, run in the browser console or captured by
`scripts/g30-device-a11y-browser-tests.mjs`, are given per case so two reviewers produce the same
number.

---

## MOB-01 — No iframe-like constrained experience

**Applies to:** J02, J04–J14.

**Measurement**

```js
document.querySelectorAll('iframe').length
```

and, for the assessment root:

```js
[...document.querySelectorAll('[data-adaptive-assessment="true"] *')]
  .filter(el => { const s = getComputedStyle(el);
                  return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1; })
  .length
```

**PASS:** iframe count is `0` **and** nested vertical scroll-container count is `0` — the document
itself is the scroller.

**FAIL:** any iframe on a journey route, or any nested scrollable region inside the assessment
that produces a scroll-within-scroll on touch.

---

## MOB-02 — No horizontal overflow

**Applies to:** every journey route, every viewport.

**Measurement**

```js
Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
```

**PASS:** `0` at VP-320, VP-375, VP-390 and VP-430, in both orientations, on every screen class
(gateway question, control question, review, completion, snapshot, option cards, payment return,
report-access error).

**FAIL:** any value `> 0`. Record the offending element:

```js
[...document.querySelectorAll('*')]
  .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
  .map(el => el.tagName + '.' + el.className).slice(0, 10)
```

---

## MOB-03 — Domain and question navigation

**Applies to:** J05–J09.

**PASS:** from any question the customer can, using touch only:
(a) move to the next applicable question, (b) move back to the previous **answered** question, and
(c) reach the review screen once the path is complete — each in a single tap on a control that is
visible without pinch-zoom.

**FAIL:** any of the three requires zooming, scrolling to an off-screen control, or a browser
gesture.

**Note:** the adaptive experience is deliberately one-question-per-screen and has **no** domain
jump control (unlike the legacy engine's `sm:hidden` section `<select>`). Domain-level progress is
shown read-only at the foot of the screen. Certify that this read-only progress grid is visible
and legible at VP-320; do not treat the absence of a jump control as a defect.

---

## MOB-04 — Question progression

**Applies to:** J07, J08.

**PASS:** after selecting an answer, the save state reaches `Saved` and the Continue control
becomes enabled, both within the same viewport without scrolling, and the position is held on the
current question (progressive, not auto-advancing).

**FAIL:** the customer must scroll to discover that the answer saved, or the screen advances
before the save is confirmed, or Continue remains disabled after a confirmed save.

---

## MOB-05 — Tap target size

**Applies to:** every interactive control on every journey route.

**Measurement**, per control:

```js
const r = el.getBoundingClientRect(); [Math.round(r.width), Math.round(r.height)]
```

**PASS (hard):** every target is at least **24 × 24 CSS px** (WCAG 2.2 2.5.8 Level AA), counting
the full clickable label where a `<label>` wraps a small native input.

**PASS (target):** primary journey controls — answer options, Back, Continue, Save now, Submit,
option-card selection, the start-form submit — are at least **44 × 44 CSS px**.

**Reference points at this SHA:** gateway option labels `min-h-14` (56 px); control option labels
`min-h-16` (64 px); start-form inputs `min-h-12` (48 px); `Button` is `py-3 text-sm` (~44 px);
`AppChrome` exit control `min-h-11` (44 px); start-form checkboxes are `h-4 w-4` (16 px) but are
wrapped in a full-width `<label>`, so the effective target is the label.

**FAIL:** any target below 24 × 24, or any target between 24 and 44 px whose neighbours are closer
than 24 px edge-to-edge.

---

## MOB-06 — Sticky and overlaid controls

**Applies to:** J06 (scope-change dialog), and any element with `position: fixed` or `sticky`.

**Measurement:** with the dialog open, at VP-320 and at C-ZOOM200:

```js
const p = document.querySelector('[role="dialog"] > div');
const r = p.getBoundingClientRect();
({ top: r.top, bottom: r.bottom, viewport: window.innerHeight,
   overflows: r.bottom > window.innerHeight || r.top < 0,
   panelScrollable: /(auto|scroll)/.test(getComputedStyle(p).overflowY) })
```

**PASS:** the dialog's action buttons are within the viewport, **or** the dialog scrolls internally
so they can be reached.

**FAIL:** `overflows` is true and `panelScrollable` is false — the buttons are unreachable.
**This is the expected failure at VP-320 and 200% zoom (G30-D-006).** Capture it deliberately.

---

## MOB-07 — Keyboard overlay behaviour

**Applies to:** J03 (start form), J16b (enquiry form notes field).

**PASS:** with the on-screen keyboard open, the focused field and its label are both fully visible;
the submit control is reachable by scrolling without dismissing the keyboard; nothing is clipped
behind the keyboard.

**FAIL:** the focused field is obscured, the page scrolls the field out of view on focus, or the
layout collapses because `100vh` is measured against the pre-keyboard viewport.

**Specific check:** `AppChrome` uses `min-h-[100dvh]` on the assessment shell. Because
`/score/adaptive/` does not enter that branch (G30-D-001), confirm what the adaptive route
actually uses and whether the iOS dynamic toolbar causes a layout jump on focus.

---

## MOB-08 — Scroll restoration

**Applies to:** J07–J09, J11, J14.

**PASS:** advancing to a new question places the customer at the top of that question. Returning
via Back places them on the previous question with the saved answer visible. Reloading mid-journey
restores the saved position, not the top of the document.

**FAIL:** a new question opens mid-scroll; Back returns to an unrelated scroll offset; a reload
loses position.

---

## MOB-09 — Validation visibility

**Applies to:** J03, J07, J10, J16.

**PASS:** when an error is raised, the error text is within the viewport at the moment it appears,
or the page brings it into view. The associated field is identifiable without scrolling away from
the error.

**FAIL:** the error renders above or below the fold with no scroll adjustment.

---

## MOB-10 — Selected-answer visibility

**Applies to:** J05, J07, J15.

**PASS:** a selected option is distinguishable from an unselected one by at least two independent
signals. At this SHA those are: border colour changes to `mk-charcoal`, background changes to
`mk-cream`, font weight changes to semibold, and the native radio renders its checked state — four
signals, so this should pass.

**Measurement:** capture a screenshot of a selected and an unselected option, and confirm the
distinction survives a greyscale conversion.

**FAIL:** the distinction is colour-only, or the native radio is visually hidden and the remaining
signal is colour.

---

## MOB-11 — Progress indication

**Applies to:** J05–J13.

**PASS:** at every question the customer can see, without scrolling: a percentage or fraction of
completion, and the count of remaining applicable controls. The `role="progressbar"` carries
`aria-valuenow` matching the visible percentage.

**Measurement**

```js
const pb = document.querySelector('[role="progressbar"]');
({ valuenow: pb.getAttribute('aria-valuenow'),
   inViewport: pb.getBoundingClientRect().top >= 0 && pb.getBoundingClientRect().bottom <= innerHeight })
```

**FAIL:** progress is off-screen at the top of a question, or `aria-valuenow` disagrees with the
rendered percentage.

---

## MOB-12 — Product-card usability

**Applies to:** J15.

**PASS:** at VP-320, both option cards stack to full width; the title, price, description, every
bullet and the delivery note are fully visible without horizontal scroll or truncation; the
selection control on each card meets MOB-05.

**PASS:** selecting a card brings the revealed summary panel into view, or the panel is within one
short scroll and the customer is given a visible cue that it appeared.

**FAIL:** truncated bullets, a clipped price, or a revealed panel with no cue (see G30-D-010).

---

## MOB-13 — Checkout usability

**Applies to:** J16, J17.

**PASS:** the order summary shows product, price, delivery period and the EFT instruction with no
clipping at VP-320. The confirm control meets MOB-05. On the payment return page, the verified
state title and detail are readable at default zoom, and the state never implies success before
server verification.

**FAIL:** any clipped commercial term, or a state presentation that could be read as "paid" while
the server state is `PAYMENT_PENDING` or `PAYMENT_PROCESSING`.

---

## MOB-14 — Report-access usability

**Applies to:** J19, J20.

**PASS (success path):** the redirect completes and the PDF opens in the platform viewer without an
intermediate error, on both DB-A and DB-B.

**PASS (failure path):** every error reason from CJ-19b renders with body text readable at the
device's default zoom — that is, the page declares a viewport and lays out at device width.

**Measurement on the error page**

```js
({ hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
   lang: document.documentElement.lang || null,
   title: document.title || null,
   layoutWidth: document.documentElement.clientWidth,
   deviceWidth: window.screen.width })
```

**FAIL:** `hasViewportMeta` is false, or `layoutWidth` substantially exceeds `deviceWidth`.
**This is the expected failure (G30-D-004).**

---

## MOB-15 — Long-lived page behaviour

**Applies to:** J17.

**PASS:** a page left open in a pending state for ten minutes does not issue unbounded polling and
gives the customer a next step.

**Measurement:** count requests to `/score/api/payments/*/status` over ten minutes.

**FAIL:** requests continue at a fixed 3 s interval with no cap or backoff
(expected — G30-D-014). Record the observed count.

---

## Execution record

Each case is recorded per device × viewport × orientation, following
[evidence-capture-standard.md](evidence-capture-standard.md).

| Case | DB-A × VP-320 | DB-A × VP-390 | DB-A × VP-430 | DB-B × VP-375 | DB-B × VP-390 |
| --- | --- | --- | --- | --- | --- |
| MOB-01 | | | | | |
| MOB-02 | | | | | |
| MOB-03 | | | | | |
| MOB-04 | | | | | |
| MOB-05 | | | | | |
| MOB-06 | | | | | |
| MOB-07 | | | | | |
| MOB-08 | | | | | |
| MOB-09 | | | | | |
| MOB-10 | | | | | |
| MOB-11 | | | | | |
| MOB-12 | | | | | |
| MOB-13 | | | | | |
| MOB-14 | | | | | |
| MOB-15 | | | | | |

Leave cells blank until executed. A blank cell is an incomplete gate, not a pass.
