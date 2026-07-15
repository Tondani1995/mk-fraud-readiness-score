# Premium assessment experience implementation

## Root causes

The consolidated product page embedded `/score/start?embed=1` in an iframe. A child `ResizeObserver` posted heights to the parent and the parent adjusted a fixed frame. This created two application contexts, iframe-specific header/footer suppression, focus boundaries and a risk of nested/clipped scrolling. The existing engine autosaved draft answers but rendered all domains together, did not require a successful save before progression, and did not persist an active domain/question cursor.

## Native architecture

`/fraud-readiness-score` now renders `StartAssessmentForm` directly. `/score/start?embed=1` redirects to `/score/start`; iframe and height-message components were removed. Active assessment routes use compact MK branding, an exit control, safe-area padding, hidden marketing footer and one document scroll context.

## Save-then-advance

Radio selection updates the visible selected state immediately, disables duplicate taps, sends the draft, and advances only after the server confirms success. The next unanswered question is focused and scrolled into view after 300 ms, with `auto` movement under reduced-motion preference. Failure keeps the current step open, presents an accessible retry action and stores only pending answer values in `sessionStorage`; the respondent token is never placed in browser storage.

Completing the final unanswered question opens the next incomplete domain. Only the active domain is expanded, while completed domains remain directly reachable through compact navigation. Mobile uses a select rather than a wide horizontal tab rail. The progress region announces domain number, percentage, answered counts and last successful save.

## Resume and compatibility

Migration 0025 adds only navigation cursor fields and safe resume events. Answers remain in their established tables. When the independent resume capability is available, every successful save records active domain/question, completion percentage and saved timestamp. A return visit records a resume event, opens the saved or derived incomplete section and scrolls to the pending question. Without 0025 the page derives the same location from saved answers, so completion remains available.

## Accessibility and deterministic boundaries

Questions and exposure factors use semantic fieldsets, legends, labels and native radios. Selected state includes a check mark as well as colour. Controls have visible focus behaviour and large labelled hit areas; errors use `role=alert`; progress uses a labelled `progressbar`; motion honours user preference.

No question, factor, option, weight, gate, threshold, price, entitlement or scoring function changed. Identical persisted answers continue through the existing deterministic scorer.
