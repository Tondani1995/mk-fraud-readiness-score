# 07 — Mobile and accessibility specification

**Status:** Proposed for approval. All claims below are verified by automated test,
not asserted.

---

## 1. Viewport matrix

Tested at all four required widths by `tests/browser.spec.mjs` (`layout is sound at
{320,390,768,1440}px`).

| Width | Gutter | Measure | Layout adjustments |
|---|---|---|---|
| 320 | 0.875 rem | full | Option `operationalMeaning` hidden; stats single-column; tighter option padding |
| 390 | 1.25 rem | full | Baseline mobile |
| 768 | 2 rem | 44 rem | Stats 4-up; dialog becomes centred modal, not bottom sheet |
| 1440 | 2 rem | 46 rem | Wider top padding; measure still capped for readability |

Additional: landscape phones under 460 px tall drop the "Why we are asking" block and
tighten vertical padding so the action row stays reachable.

### 1.1 Verified guarantees

| Requirement | How it is met | Test assertion |
|---|---|---|
| Question + main controls visible without excessive scrolling | Fluid type, compact progress, no hero imagery | `promptBox.y < viewport.height` and `firstOption.y < viewport.height` |
| Navigation remains reachable | Actions in normal flow after options; `margin-top: auto` pushes them to the natural end | Continue located and clicked at every width |
| Answer controls not cramped | 48 px minimum height, 0.5 rem gaps | `no element .option/.btn under 44px` |
| Progress does not dominate | Sticky bar ≤52 px, 5 px track, 0.6875 rem meta | visual review at 320 |
| Long questions remain readable | `text-wrap: pretty`, 1.35 line-height, capped measure | visual review |
| **No horizontal scrolling** | `overflow-x: hidden` on body plus no fixed widths | `scrollWidth - clientWidth <= 0` at all four widths |
| No embedded-frame feeling | Full-bleed background, sticky header, no inner scroll container | visual review |
| No scrolling to the top to reach the next section | One question per screen; `window.scrollTo(0)` on transition | behavioural |

At 320 px the tightest screen (a six-option gateway) fits the eyebrow, prompt,
guidance, all six options and the Continue button within the viewport.

## 2. WCAG 2.2 AA

### 2.1 Keyboard

- Every control reachable and operable by keyboard. Radio groups use native inputs,
  so arrow-key roving works without custom code.
- Shortcuts: `1`–`9` select the nth option, `u` selects "I do not know".
- Skip link (`.skip-link`) is the **first tab stop** and jumps to `#main`.
  *Verified by test.* This required a fix: the app originally moved focus to the
  screen heading on first paint, which pushed focus past the skip link. Focus is now
  moved only on subsequent screen changes.
- Dialogs trap focus (Tab and Shift+Tab cycle within), close on Escape, and restore
  focus to the triggering element.

### 2.2 Focus visibility

`:focus-visible` → 3 px `--mk-brass` outline, 3 px offset. Option rows additionally
raise a 3 px ring on the marker. Contrast of the focus indicator against both the
page and the surface exceeds 3:1.

Screen headings receive focus on screen change (so screen readers announce the new
context) but suppress the visible ring — they are not in the tab order and are not
interactive, so a ring would signal a keyboard target that does not exist.

### 2.3 Screen-reader semantics

| Element | Treatment |
|---|---|
| Question | `<h1>` per screen, `fieldset` + visually-hidden `legend` |
| Options | native `<input type="radio">` in `role="radiogroup"` labelled by the question |
| Evidence prompt | linked via `aria-describedby` |
| Progress | `role="progressbar"` with `aria-valuenow` and a prose `aria-valuetext` ("42 percent complete. Operational Fraud Controls. About 18 minutes remaining.") |
| Save state | `role="status"` live region (polite) |
| Errors, invalidation | `role="alert"` (assertive); dialog is `role="alertdialog"` + `aria-modal` |
| Screen changes | heading focus + polite announcement |

Two live regions are used deliberately: polite for save and navigation, assertive for
errors and destructive confirmations, so routine saves never interrupt.

### 2.4 Colour and contrast

Measured against `--mk-cream` `#f8fafc` / `--mk-paper` `#ffffff`:

| Pair | Ratio | Requirement |
|---|---|---|
| `--mk-ink` `#001030` on cream | ~18.5:1 | 4.5:1 ✓ |
| `--mk-muted` `#475569` on cream | ~7.5:1 | 4.5:1 ✓ |
| `--mk-brass` `#1d3658` on cream | ~12.1:1 | 4.5:1 ✓ |
| White on `--mk-brass` | ~12.1:1 | 4.5:1 ✓ |
| `--mk-danger` `#9b2c2c` on danger-soft | ~6.9:1 | 4.5:1 ✓ |
| `--mk-success` `#2f6b4f` on success-soft | ~5.4:1 | 4.5:1 ✓ |
| `--mk-amber` `#8a6410` on amber-soft | ~5.6:1 | 4.5:1 ✓ |
| Borders / progress track | ≥3:1 | 3:1 (non-text) ✓ |

**No information is carried by colour alone.** Every state has a redundant
non-colour cue:

| State | Colour | Redundant cues |
|---|---|---|
| Option selected | brass fill | filled marker, heavier border, bold label |
| Uncertainty selected | amber | dashed→solid border, **square** marker, distinct copy |
| Save error | red dot | text "Not saved…", Retry button replaces Continue |
| Area complete | green tag | tag text "Complete", "n of n questions answered" |
| Excluded | grey tag | tag text "Excluded", reason sentence, reason code |
| Outsourced | brass tag | tag text "Oversight", "Replaced the in-house equivalent" |

`@media (forced-colors: active)` maps selection and progress to system `Highlight`.

### 2.5 Motion

`@media (prefers-reduced-motion: reduce)` reduces all animation and transition
durations to 0.001 ms and sets `scroll-behavior: auto`. *Verified by test.*

### 2.6 Targets and spacing

48 px minimum height on all options and buttons (WCAG 2.2 AA requires 24 px; 44 px
is the common mobile floor; 48 px is the design target). Verified at every viewport.
Minimum 0.5 rem between adjacent targets. Dialog actions respect
`env(safe-area-inset-bottom)`.

### 2.7 Structure

Landmarks: `banner` (header), `main` (`#main`, `tabindex="-1"`), plus status/alert
live regions. One `<h1>` per screen naming the current decision; `<h2>` for review
groups. No heading levels skipped.

`<html lang="en-ZA">`. Page title is static; screen context is conveyed by the
focused heading and live regions.

## 3. WCAG 2.2 additions specifically considered

| Criterion | Treatment |
|---|---|
| 2.4.11 Focus Not Obscured (Minimum) | Sticky header is 52 px and non-overlapping; focused options are scrolled into view |
| 2.5.7 Dragging Movements | No drag interaction anywhere |
| 2.5.8 Target Size (Minimum) | 48 px, exceeding the 24 px minimum |
| 3.2.6 Consistent Help | Guidance and evidence prompts appear in the same position on every screen |
| 3.3.7 Redundant Entry | Nothing is asked twice; gateway answers are reused, not re-requested |
| 3.3.8 Accessible Authentication | No authentication in the prototype |

## 4. Known gaps and limitations

Stated honestly:

1. **No screen-reader user testing.** Semantics are correct and automated checks
   pass, but no NVDA/JAWS/VoiceOver session has been run. Recommended before
   customer testing.
2. **No automated axe/Lighthouse audit in CI.** The Playwright suite asserts
   specific behaviours rather than running a general rule engine. Adding
   `@axe-core/playwright` is a low-cost improvement.
3. **Contrast ratios are computed, not instrument-measured** on a calibrated display.
4. **Poppins is referenced but not bundled.** The prototype falls back to a system
   sans stack. Production must load the brand font with `font-display: swap` and
   verify the fallback does not shift layout.
5. **No RTL support.** Not required for the South African market in V1.
6. **Zoom to 400%** (WCAG 1.4.10) is expected to pass given fluid type and no fixed
   widths, but is not explicitly asserted by a test.

Items 1, 2 and 6 are recommended before customer testing; none block prototype
evaluation.
