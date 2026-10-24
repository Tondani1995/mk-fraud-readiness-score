# Manual interaction and accessibility review

Scope: local optimized preview; synthetic fixtures and existing real UI components; desktop Chromium with viewport changes. No customer data, real creation, payments, report jobs or dispatch. These observations do not certify physical mobile devices, Safari, assistive technologies or legal compliance.

## Interaction evidence

| Check | Observation |
|---|---|
| Three desktop and three mobile transitions | Native captured GIFs show all choices, selected navy response, remaining choices collapsing/removing, then next applicable question. rAF probe observed7→1→7 visible options, with inputs disabled while awaiting save. |
| Mobile definitions | Meaning disclosure opened before selection; Enter closed it. Native radio `aria-describedby` retains the operational definition. Unknown has separate definition and visual treatment. |
| Keyboard selection | Space selected nine successive profile gateways, advanced through server-supplied path and focused the next heading. No extra Next click. |
| Back/change | Back restored the saved response. Changing to unknown saved and advanced. “Continue with saved response” returned to the server’s next unanswered question without a write; it is not a chronological forward-history control. |
| Failed save | HTTP503 restored all choices with response3 retained. Visible retry; Back disabled. Retry committed and reached next question. Mobile clip repeats Back, changing answer, failed save and retry. |
| Rapid choices | Authored synchronous two-click probe produced1save request and1committed write. Native inputs lock immediately; this is not a physical double-click timing sample. |
| Conflict | HTTP409 produced explicit conflict/reload explanation, retained server version and discarded the unapplied local delta; request count2, committed1 after one prior success. Inputs lock during reload. Final change restores question-heading focus after a reload. |
| Gateway invalidation | Revisited cash-handling gateway after answering its affected control. ChoosingNo triggered the existing pure-engine scope confirmation. Shift+Tab wrapped from first to last dialog control; Escape cancelled with0committed writes. Repeating and confirming produced1committed write across3requests (first cancelled preview, second preview, confirmed save) and the server’s next unanswered question. Database history not exercised. |
| Last response/review | Late fixture’s final two answers opened “Your assessment is ready to submit”, with Edit answers and Submit. No automatic submission. Edit restored the final recorded value0. |
| Reduced-motion preview | Computed entry-animation duration0s and exit-transition duration0s. System `prefers-reduced-motion` implementation inspected; actual OS preference and AT remain untested. No navigation depends on transition callbacks. |
| Focus/scroll | Current question heading receives focus on progression/Back. A stable heading anchor and locked pending-stage height limit collapse-induced scroll jumps. Long mobile questions remain readable and scrollable; full answer list may extend below the fold. Domain return restores the selected row. Final correction focuses the revealed mobile detail after it is mounted and makes desktop scroll panes keyboard focusable. |
| Billing/payment | Both invoice forms and payment presentation inspected at narrow widths. Sticky continuation remains available while fields scroll; labels and required fields retained. Payment step3’s existing beforeunload warning prevented moving an audit iframe away; fresh contexts used rather than removing the guard. No order/payment submission. |

## Automated findings corrected

- New completion-node text had contrast4.37:1; darkened the token.
- Executive eyebrow inherited dark text on navy (2.48:1); set explicit light text.
- Desktop detail captions on tinted surfaces were4.3:1 and a row cue4.17:1; darkened both.
- Named generic containers were reported under incomplete ARIA checks. Added meaningful group roles for executive score, domain explorer and product options.
- Desktop/tablet overflowing domain-detail region needed a tab stop; added keyboard focus and focus outline.
- Newly entering text is fully opaque while translating; this removes transient contrast loss during panel entry. Unselected answers still fade and collapse.
- Existing payment support link relied on colour alone; added a permanent underline.

Initial findings and rechecks are retained separately. The final audit matrix spans20routes ×6widths (320,375,390,430,768,1440), with duplicate samples retained where rerun. Final counts are in `accessibility-summary.json`. The scanner checks WCAG2A/AA,2.1AA and2.2AA rules available to axe4.12.1; passing a rule or zero violations is not certification.

## Incomplete checks investigated

- Exposure illustration: axe cannot resolve layered pseudo-element backgrounds. Recorded styles show navy base, very low-opacity light grid, pale labels and dark control chips. Visual inspection retains readable labels across desktop/mobile. Gradient/selected states require a human contrast/AT review; no blanket pass asserted.
- Terms modal: axe reports partially overlapping elements in its scroll region/footer. Navy/muted text on white is retained; inspect scrolling and focus in the real modal. No legal acceptance was submitted during this work. Physical keyboard/zoom/AT confirmation remains pending.
- Decorative completion checks and mobile menu glyph: axe cannot assess non-text symbols. They have accompanying textual completion/name semantics; decorative checks are aria-hidden. Computed colours were inspected, and the interactive menu button retains its accessible name. System/AT verification remains pending.

The audit tool gained a bounded frame-readiness wait to avoid hanging on a missed load event. The payment leave guard is an expected separate constraint: run that route last or in a fresh context.

## Outstanding release evidence

Physical320–430px devices and mobile Safari; virtual keyboard and zoom; VoiceOver/NVDA reading order/announcements; actual OS reduced motion; authenticated fresh-context save/resume; all DB/transaction/delivery matrix rows. Existing completed/scored resume URL recovery and uncertainty-policy ownership remain release blockers. See `staging-verification.md`.
