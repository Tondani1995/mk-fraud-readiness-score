# G30 — device, browser, mobile and accessibility certification pack

**Status: PREPARATION ONLY. G30 has not been executed and is not complete.**

Basis SHA: `23d5d7e10b389f98054587c09f44ee846be8172e` (certified release candidate, tip of
`feature/adaptive-production-foundation-v1` / PR #52 head at preparation time).

Branch: `parallel/g30-certification-prep`, cut from the certified SHA. This branch is a
preparation artefact. It must not be merged into PR #52, and nothing in it changes product
behaviour.

Execution of G30 is blocked until G40/G41 (Staging Journey 6) closes.

## Contents

| Document | Purpose |
| --- | --- |
| [current-state-audit.md](current-state-audit.md) | What already exists at the certified SHA, classified by reusability |
| [device-browser-matrix.md](device-browser-matrix.md) | Device × browser × viewport × interaction-mode coverage |
| [customer-journey-test-cases.md](customer-journey-test-cases.md) | The MK customer journey, step by step, with variants |
| [mobile-ux-test-pack.md](mobile-ux-test-pack.md) | Objective mobile PASS/FAIL criteria |
| [wcag-22-aa-control-matrix.md](wcag-22-aa-control-matrix.md) | WCAG 2.2 AA criteria mapped to MK surfaces |
| [keyboard-screenreader-pack.md](keyboard-screenreader-pack.md) | VoiceOver, TalkBack and keyboard-only procedures |
| [pdf-accessibility-pack.md](pdf-accessibility-pack.md) | Visual PDF QA vs semantic PDF accessibility QA |
| [defect-severity-model.md](defect-severity-model.md) | P0–P3 definitions and release treatment |
| [evidence-capture-standard.md](evidence-capture-standard.md) | Naming and minimum proof for auditable evidence |
| [open-defect-register.md](open-defect-register.md) | Defects found during preparation — documented, not fixed |
| [execution-runbook.md](execution-runbook.md) | How to run G30 once G40/G41 closes |
| [signoff-template.md](signoff-template.md) | The G30 decision record. Not filled in. |

## Journey step identifiers

Every document in this pack refers to the same journey spine. Use these IDs in test cases,
evidence filenames and defect reports.

| ID | Step | Surface |
| --- | --- | --- |
| J01 | Landing / product page | `/fraud-readiness-score` |
| J02 | Assessment start page | `/score/adaptive`, `/score/start` |
| J03 | Start form entry, validation and submit | `AdaptiveStartForm` |
| J04 | Private resume link opens the assessment | `/score/adaptive/{ref}?token=` |
| J05 | Gateway questions | `AdaptiveAssessmentExperience` gateway screen |
| J06 | Adaptive branching and scope-change confirmation | invalidation dialog |
| J07 | Answer selection and autosave | control question screen |
| J08 | Continue / progressive navigation | Continue control |
| J09 | Back navigation and answer correction | Back control |
| J10 | Validation and error handling | inline `role="alert"` surfaces |
| J11 | Save and resume | reopen link, second tab, save conflict |
| J12 | Review assessed scope | review screen |
| J13 | Submit | submit control and completion card |
| J14 | Score / result / snapshot | `/score/snapshot/{ref}?token=` |
| J15 | Product selection | `FreeSnapshot` option cards |
| J16 | Order placement and confirmation | report-request panel |
| J17 | Payment return and verified status | `/score/payment/return?order_reference=` |
| J18 | Report pending state | order confirmation panel |
| J19 | Secure report access | `/score/report/access/{token}` |
| J20 | PDF download, open and read | delivered PDF |

## Boundaries observed by this pack

- No commercial transaction is executed by anything in this pack.
- No Staging or Production data is created, mutated or deleted by anything in this pack.
- No payment, AI, email or webhook path is invoked by anything in this pack.
- No product behaviour is changed. Defects found during preparation are recorded in
  [open-defect-register.md](open-defect-register.md) and left in place.
- This pack does not constitute, and must not be described as, formal WCAG conformance
  certification. It is an internal control matrix and evidence standard.
