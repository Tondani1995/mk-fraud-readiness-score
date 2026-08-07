# G30 customer journey test pack

Covers the real MK customer journey at `23d5d7e10b389f98054587c09f44ee846be8172e`.

## Standing constraints

1. **No commercial transaction is executed.** Cases that reach J16 stop at the point where the
   order-request call would be made. The confirm control is inspected, not activated, unless the
   G30 owner has explicitly authorised a disposable order under the G40/G41 fixture régime.
2. **No payment is initiated.** J17 is certified against a payment return URL for an order that
   already exists in the fixture set, or against a stubbed status endpoint.
3. **No AI and no email is invoked.** J18–J20 are certified against an already-produced report
   artefact.
4. The adaptive journey runs only on a Preview deployment bound to Staging Supabase
   (`assertAdaptivePreviewEnvironment`, `src/lib/adaptive/server.ts:41`). Live execution of
   J03–J14 therefore creates Staging assessment rows. That is permitted **only during G30
   execution, after G40/G41 closes**, and every reference created must be listed on the sign-off.

## Case identifier scheme

`CJ-<journey step>[<variant letter>]`, e.g. `CJ-07b`. Variant letters are stable across runs.

---

## J01 — Landing / product page

**CJ-01a — happy path.** Open `/fraud-readiness-score`. The start affordance is visible without
scrolling on VP-390. Activating it reaches the start form. *Pass:* start affordance reachable in
one interaction; no horizontal scroll.

**CJ-01b — deep link.** Open `/fraud-readiness-score#start-score` directly. *Pass:* the start
section is scrolled into view and focus is not stranded above it.

**CJ-01c — reduced motion.** With `prefers-reduced-motion: reduce`, repeat CJ-01b. *Pass:* the
fragment jump is instantaneous. **Known:** `globals.css` sets `scroll-behavior: smooth`
unconditionally — expect this to animate (G30-D-012).

---

## J02 — Assessment start page

**CJ-02a — happy path.** Open `/score/adaptive`. *Pass:* `<h1>` present; the "what to expect"
panel and the start card both render; no horizontal scroll at VP-320.

**CJ-02b — page title.** Inspect the document title. *Pass:* a descriptive, unique title.
**Known:** no `metadata` export exists under `src/app/score/**` (G30-D-002) — expect failure.

**CJ-02c — legacy start parity.** Open `/score/start`. *Pass:* renders the same
`AdaptiveStartForm`; assessment chrome applies here (it matches `assessmentActive`) — record the
contrast with CJ-04b.

**CJ-02d — embed guard.** Open `/score/start?embed=1`. *Pass:* redirects to `/score/start`; no
iframe is rendered anywhere in the resulting document.

---

## J03 — Start form entry, validation and submit

**CJ-03a — happy path.** Complete full name, work email, organisation name, tick the privacy
consent, submit. *Pass:* navigation to the private resume URL; no duplicate submission on a
double-tap.

**CJ-03b — required-field validation.** Submit with every field empty. *Pass:* submission is
blocked; the first invalid field receives focus; the message is perceivable by both sighted and
screen-reader users.

**CJ-03c — email format validation.** Enter `not-an-email`. *Pass:* blocked with a message that
identifies the field.

**CJ-03d — consent omitted.** Complete all fields, leave the privacy consent unticked. *Pass:*
blocked; the checkbox is identified as the cause.

**CJ-03e — server-side rejection.** Force a server error (or observe one naturally). *Pass:* the
`role="alert"` container renders; the message is announced; the form remains populated and
resubmittable.

**CJ-03f — mobile keyboard.** On DB-A and DB-B, tab through every field with the on-screen
keyboard open. *Pass:* the focused field is never obscured by the keyboard; the email field raises
an email keyboard; "next"/"go" moves sensibly.

**CJ-03g — autofill.** Attempt browser/password-manager autofill of name, email and organisation.
*Pass:* fields autofill. **Known:** no `autoComplete` attributes (G30-D-008) — expect failure.

**CJ-03h — slow network.** Under C-SLOW, submit once. *Pass:* the button enters its `Starting…`
state, a second tap does not produce a second assessment, and the outcome is announced.

---

## J04 — Private resume link opens the assessment

**CJ-04a — happy path.** Open the returned `/score/adaptive/{ref}?token=…`. *Pass:* the first
gateway question renders; `data-adaptive-assessment="true"` is present.

**CJ-04b — assessment chrome.** Inspect the page shell. *Pass:* the assessment shell applies —
no marketing footer, `overflow-x-hidden`, safe-area padding, an exit affordance.
**Known:** `AppChrome` does not match `/score/adaptive/` (G30-D-001) — expect the marketing header
and footer to be present. Capture at VP-390 on DB-A specifically.

**CJ-04c — missing token.** Open `/score/adaptive/{ref}` with no `token` query. *Pass:* the
"Private resume link required" state renders, with no leak of assessment content.

**CJ-04d — invalid token.** Append a malformed token. *Pass:* the "Assessment cannot be opened"
state renders; no stack trace, no internal identifier, no organisation name.

**CJ-04e — expired token.** Use a token past expiry. *Pass:* same safe state; the message tells the
customer what to do next.

**CJ-04f — refresh.** Reload the assessment page mid-way. *Pass:* the saved position and all saved
answers are restored.

---

## J05 — Gateway questions

**CJ-05a — happy path.** Answer each gateway question in turn. *Pass:* one question per screen;
each selection is saved (status shows `Saved`); the heading receives focus on each advance.

**CJ-05b — selected-answer visibility.** After selecting, inspect the chosen option. *Pass:* the
selection is conveyed by more than colour alone (border weight and font weight change, plus the
native radio state).

**CJ-05c — group semantics.** With a screen reader, enter the radio group. *Pass:* the question is
announced as the group label. **Known:** the legend is the generic string `Select one answer`
(G30-D-007) — expect the question to be missing from the group announcement.

**CJ-05d — evidence disclosure.** Expand "Examples of evidence that may support your answer".
*Pass:* keyboard-operable via `<summary>`; expanded state announced; content does not overflow at
VP-320.

---

## J06 — Adaptive branching and scope-change confirmation

**CJ-06a — branch applied.** Choose a gateway answer that excludes a domain. Proceed to J12.
*Pass:* the review screen reports a non-zero excluded count and lists the excluded nodes.

**CJ-06b — oversight redirect.** Choose a gateway answer that redirects a control to its oversight
variant. *Pass:* the redirected count is non-zero and the review screen names the redirect target.

**CJ-06c — scope-change confirmation.** Return to an answered gateway (via Back) and change it so
that saved answers fall out of scope. *Pass:* the confirmation dialog appears; both buttons are
visible and reachable; "Keep current answer" leaves state untouched; "Change scope and continue"
applies the new scope and reports the affected count accurately.
**Known risks (G30-D-006):** at VP-320 and under C-ZOOM200 the dialog may exceed the viewport with
no internal scroll, making the buttons unreachable. Capture this case explicitly at 320 px and at
200%.

**CJ-06d — dialog dismissal.** With the dialog open, press Escape. *Pass:* the dialog closes and
focus returns to the control that opened it. **Known:** no Escape handler (G30-D-006).

**CJ-06e — dialog focus containment.** With the dialog open, Tab repeatedly. *Pass:* focus stays
inside the dialog. **Known:** no focus trap (G30-D-006).

---

## J07 — Answer selection and autosave

**CJ-07a — happy path.** Select a maturity response. *Pass:* status moves `Saving…` → `Saved`;
position is held on the current question (progressive navigation is deliberate — selection does
not auto-advance at this SHA); progress counters update.

**CJ-07b — "I do not know".** Select the uncertainty option. *Pass:* recorded as an applicable
response, not as a skip; the review screen and result reflect it as uncertainty.

**CJ-07c — save failure.** Force the state POST to fail. *Pass:* an inline `role="alert"` appears
with a "Reload saved state" action; the selection is not silently treated as saved.

**CJ-07d — save conflict.** Open the same assessment in two tabs, save in tab A, then save in
tab B. *Pass:* tab B reports the conflict, reloads the authoritative state, and does not overwrite
tab A.

**CJ-07e — slow network.** Under C-SLOW, select an answer and immediately attempt a second
selection. *Pass:* controls are disabled while saving; no lost or interleaved write.

**CJ-07f — offline.** Disable the network, select an answer. *Pass:* the failure is visible and the
answer is not presented as saved. *Note:* unlike the legacy engine, the adaptive experience has no
`sessionStorage` fallback — record the actual behaviour.

---

## J08 — Continue / progressive navigation

**CJ-08a — happy path.** With an answer selected, activate Continue. *Pass:* advance to the next
applicable node; focus moves to the new `<h1>`; progress increases.

**CJ-08b — Continue without an answer.** Load an unanswered question and inspect Continue.
*Pass:* the customer is told an answer is required. **Known:** the control is disabled with no
explanation and the "Choose an answer before continuing." message is unreachable (G30-D-013).

**CJ-08c — end of path.** Answer the final applicable control. *Pass:* the route to the review
screen is offered and reachable.

---

## J09 — Back navigation and answer correction

**CJ-09a — Back control.** Activate Back from a mid-path question. *Pass:* the previous *answered*
node is shown with its saved answer selected; position is preserved without advancing.

**CJ-09b — browser back.** Use the browser back gesture / hardware back button on DB-A and DB-B.
*Pass:* the customer is not dropped out of the assessment without warning, and no saved answer is
lost. Record the actual behaviour — the experience is a single client-side route, so browser back
is expected to leave the assessment.

**CJ-09c — answer correction.** Go back, change an answer, return forward. *Pass:* the new answer
persists; any dependent scope change triggers CJ-06c.

**CJ-09d — Back at the first node.** *Pass:* Back is disabled and does not strand the customer.

---

## J10 — Validation and error handling

**CJ-10a — error identification.** For each failure surface reachable in the journey, confirm the
message identifies what failed and what to do. *Pass:* no raw error codes, no internal
identifiers, no stack traces.

**CJ-10b — error announcement.** With a screen reader, trigger each error. *Pass:* announced
without moving focus unexpectedly.

**CJ-10c — error visibility on mobile.** Trigger an error while scrolled to the bottom of a long
question at VP-320. *Pass:* the error is brought into view or otherwise made perceivable.

---

## J11 — Save and resume

**CJ-11a — resume after close.** Answer five questions, close the browser entirely, reopen the
private link. *Pass:* all five answers and the position are restored.

**CJ-11b — resume on a different device.** Open the same link on a second device. *Pass:* state
restored; no device binding failure.

**CJ-11c — backgrounded tab (mobile).** On DB-A, background the browser for ten minutes, return.
*Pass:* the page is either intact or cleanly reloaded from server state; no partial or stale UI.

**CJ-11d — network transition.** Switch from Wi-Fi to cellular mid-assessment, then save.
*Pass:* the save succeeds or fails visibly; it never silently no-ops.

**CJ-11e — resume after submission.** Reopen the private link after J13. *Pass:* the completed
state is shown; the assessment cannot be re-edited.

---

## J12 — Review assessed scope

**CJ-12a — happy path.** Reach the review screen. *Pass:* applicable, excluded and redirected
counts are shown and reconcile with the answers given; scope notes list the affected node IDs.

**CJ-12b — integrity signals.** With a path that produces an integrity signal (for example a high
uncertainty share), review the notes. *Pass:* the signal is surfaced in customer-comprehensible
language.

**CJ-12c — edit from review.** Activate "Edit answers". *Pass:* returns to an editable question
with state intact.

**CJ-12d — reflow.** At VP-320 and under C-ZOOM200, inspect the three-column metric grid.
*Pass:* stacks to one column; no clipped numbers; no horizontal scroll.

---

## J13 — Submit

**CJ-13a — happy path.** Submit from the review screen. *Pass:* the completion card renders; the
assessment reference is shown; the result link is offered.

**CJ-13b — focus after submit.** Immediately after submission, query the focused element.
*Pass:* focus is on the completion heading. **Known:** the focus effect does not fire on
submission and the completion card has no focusable heading (G30-D-005) — expect focus on `<body>`.

**CJ-13c — announcement after submit.** With a screen reader, submit. *Pass:* completion is
announced.

**CJ-13d — result link pending.** If `snapshotUrl` is not yet available, inspect the fallback.
*Pass:* the "Prepare your result" control is offered and works.

**CJ-13e — double submit.** Activate Submit twice rapidly. *Pass:* exactly one submission; no
duplicate score run.

**CJ-13f — slow network.** Under C-SLOW, submit. *Pass:* the saving state is visible throughout;
no ambiguity about whether submission occurred.

---

## J14 — Score / result / snapshot

**CJ-14a — happy path.** Open `/score/snapshot/{ref}?token=…`. *Pass:* overall score, maturity
band, coverage, critical-control count and the scope panel all render.

**CJ-14b — refresh safety.** Reload the snapshot repeatedly. *Pass:* identical values every time;
no recalculation; no state change.

**CJ-14c — missing token.** Open without a token. *Pass:* the access-error state renders and leaks
no result data.

**CJ-14d — rate limit.** Exceed the snapshot rate limit. *Pass:* the `rate_limited` state renders
safely.

**CJ-14e — insufficient visibility.** Use a path that produces `INSUFFICIENT_VISIBILITY`.
*Pass:* the explanatory copy replaces the score without implying a failure grade.

**CJ-14f — heading navigation.** With a screen reader, list headings on the page. *Pass:* every
major section is reachable by heading. **Known:** two `<h3>` in 704 lines (G30-D-009) — expect
failure.

**CJ-14g — reflow.** At VP-320, VP-390 and under C-ZOOM200, inspect the metric and scope grids.
*Pass:* stack cleanly; no clipping; no horizontal scroll.

**CJ-14h — private-link copy.** Activate "Copy private link" on DB-A and DB-B. *Pass:* the link is
copied and success is conveyed.

---

## J15 — Product selection

**CJ-15a — happy path.** Select "Order the full report". *Pass:* the order summary panel appears
with product name, price, delivery terms and the EFT note.

**CJ-15b — personalised option.** Select "Request a personalised proposal". *Pass:* the enquiry
form appears with focus-area selection.

**CJ-15c — small-viewport analytics.** At VP-320, VP-390 and under C-ZOOM200, record
`/commercial-event` requests while scrolling through the page. *Pass:* the same events fire as at
VP-DESK. **Known:** `IntersectionObserver` threshold `0.5` may never be met on tall sections
(G30-D-015).

**CJ-15d — announcement of the revealed panel.** With a screen reader, select an option.
*Pass:* the appearance of the summary is announced or focus moves to it. **Known:** neither
happens (G30-D-010).

**CJ-15e — keyboard selection.** Select both options by keyboard. *Pass:* both cards are
operable; the revealed panel is in the tab order immediately after the card.

**CJ-15f — option card reflow.** At VP-320, inspect both cards. *Pass:* they stack; all bullets
and the price are fully visible.

---

## J16 — Order placement and confirmation

**No order is created during G30 unless the owner has authorised a disposable fixture order.**

**CJ-16a — pre-submit inspection.** Inspect the confirm control and the summary. *Pass:* the
control is labelled unambiguously; price, product and delivery terms are correct and complete.

**CJ-16b — consent for the personalised path.** Attempt to submit the enquiry form without the
contact consent. *Pass:* blocked with an identified reason.

**CJ-16c — confirmation panel (fixture).** Against a pre-existing fixture order, render the
confirmation panel. *Pass:* order reference is shown, copyable, and the next step is stated.

**CJ-16d — reflow.** VP-320 and C-ZOOM200 on both the summary and the confirmation panel.
*Pass:* no clipping.

---

## J17 — Payment return and verified status

**CJ-17a — each verified state.** Render `/score/payment/return?order_reference=…` for each of
`PAID`, `PAYMENT_PROCESSING`, `PAYMENT_FAILED`, `PAYMENT_REVIEW_REQUIRED`, `CANCELLED`,
`REFUNDED`, `PAYMENT_PENDING`. *Pass:* each renders its correct title and detail; none implies
payment success when the server has not verified it.

**CJ-17b — missing reference.** Open with no `order_reference`. *Pass:* the "Payment reference
required" state renders with a route back.

**CJ-17c — status unavailable.** Force the status endpoint to fail. *Pass:* the error text renders
in place of the detail and does not claim a payment state.

**CJ-17d — announcement.** With a screen reader, observe a `PAYMENT_PENDING` → `PAID` transition.
*Pass:* the change is announced once, not repeatedly.

**CJ-17e — long-lived pending on mobile.** Leave the page open on DB-A for ten minutes in
`PAYMENT_PENDING`. *Pass:* the customer is given a next step and polling does not run unbounded.
**Known:** polling every 3 s with no cap (G30-D-014).

---

## J18 — Report pending state

**CJ-18a — pending presentation.** With a fixture order in a pending fulfilment state, inspect the
customer-visible surface. *Pass:* the state is unambiguous, gives an expected timeframe, and
offers a support route.

**CJ-18b — reflow.** VP-320 and C-ZOOM200. *Pass:* no clipping.

---

## J19 — Secure report access

**CJ-19a — happy path.** Open a valid `/score/report/access/{token}`. *Pass:* 307 redirect to a
fresh signed URL; the PDF opens; the durable token is never the storage URL.

**CJ-19b — every failure reason.** Exercise `invalid_token`, `expired_token`, `revoked_token`,
`rate_limited`, `report_record_missing`, `report_status_ineligible`, `report_not_current_version`,
`stored_file_missing`, `integrity_failed`. *Pass:* each renders a customer-safe message and a
support route.
**Known (G30-D-004):** the error page has no `lang`, no `<title>` and no viewport meta — on DB-A
and DB-B it will render at desktop layout width and require pinch-zoom. Capture a screenshot per
reason on a real phone.

**CJ-19c — link reuse.** Open a valid link twice. *Pass:* a fresh signed URL is issued each time;
the previous signed URL expires independently of the durable token.

**CJ-19d — freeze state.** With the RC1 operation freeze active for `customer_token`, open a valid
link. *Pass:* the freeze response renders and no report is released.

---

## J20 — PDF download, open and read

See [pdf-accessibility-pack.md](pdf-accessibility-pack.md) for the full criteria. Journey-level
cases only here.

**CJ-20a — open on iOS.** Complete J19 on DB-A. *Pass:* the PDF opens in the iOS viewer, renders
page 1, and is scrollable.

**CJ-20b — open on Android.** As above on DB-B. *Pass:* download completes and the PDF opens.

**CJ-20c — open on desktop.** DB-C, DB-D, DB-E. *Pass:* the browser viewer renders the document.

**CJ-20d — legibility at default zoom on a phone.** *Pass:* body text is readable without
pinch-zoom, or the reader's reflow mode produces readable text.

**CJ-20e — text selection.** Select a paragraph in the delivered PDF. *Pass:* real text is
selected, not an image.

---

## Traceability

| Journey step | Cases | Matrix rows |
| --- | --- | --- |
| J01–J03 | CJ-01a…CJ-03h | M-01 |
| J04–J13 | CJ-04a…CJ-13f | M-02 |
| J14 | CJ-14a…CJ-14h | M-03 |
| J15–J18 | CJ-15a…CJ-18b | M-04 |
| J19–J20 | CJ-19a…CJ-20e | M-05 |
