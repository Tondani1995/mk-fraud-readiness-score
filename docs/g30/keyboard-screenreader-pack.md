# G30 keyboard and screen-reader pack

Every case here is **manual**. Screen-reader output cannot be asserted from this repository — there
is no assistive-technology automation and none can be added without changing the certified
dependency set.

## Configurations

| Ref | Assistive technology | Browser | Platform | Priority |
| --- | --- | --- | --- | --- |
| AT-1 | VoiceOver | Safari | iOS 17+ (real iPhone) | Required |
| AT-2 | VoiceOver | Safari | macOS 14+ | Required |
| AT-3 | TalkBack | Chrome | Android 13+ (real device) | Required where a device is available; otherwise a written exception |
| AT-4 | None (keyboard only) | Chrome desktop | macOS/Windows | Required |
| AT-5 | None (keyboard only) | Edge desktop | Windows 11 | Required |

**Recording requirement.** Every case produces (a) a screen recording with the assistive
technology's speech captured or its caption panel visible, and (b) a written transcript of what was
announced. A recording without a transcript is not evidence — the reviewer's reading of the
announcement is the finding.

Where a case has a **known open defect**, the expected outcome is stated. Run the case anyway and
record what actually happened; do not assume the prediction.

---

## Part 1 — Keyboard-only cases (AT-4, AT-5; also run under AT-2)

### KB-01 — Full journey by keyboard

**Steps:** from `/score/adaptive`, complete the start form, open the assessment, answer every
gateway and control question, use Back at least twice, correct one answer, reach the review screen
and submit — using Tab, Shift+Tab, Arrow keys, Space and Enter only. No pointer at any point.

**Pass:** the journey completes. Every control is reachable and operable. No dead end.

**Evidence:** one continuous screen recording.

### KB-02 — Tab cost per question

**Steps:** on a control question, press Tab from page load and count the stops before reaching the
first answer option.

**Pass:** ≤ 3 stops, or a skip mechanism is available at the first stop.

**Known open (G30-D-003, G30-D-001):** with no skip link and the marketing header rendered on the
adaptive route, expect roughly 8–10 stops (logo plus six navigation links plus the CTA) before the
question. Record the exact count — it is the measurement that sets the severity of G30-D-003.

### KB-03 — Radio group operation

**Steps:** Tab into an answer group. Move between options with Arrow keys. Select with Space.

**Pass:** arrow keys move and select within the group as a single tab stop (native radio
behaviour); the selection saves; focus remains in the group.

### KB-04 — Evidence disclosure

**Steps:** Tab to "Examples of evidence that may support your answer". Activate with Enter, then
Space. Tab into the revealed content and back out.

**Pass:** `<summary>` is a tab stop, toggles on both keys, and the revealed content joins the tab
order in place.

### KB-05 — Scope-change dialog

**Steps:** trigger the dialog via CJ-06c. Then: (a) note where focus is when it opens; (b) Tab
repeatedly and record every stop; (c) press Escape; (d) Shift+Tab from the first dialog control.

**Pass:** focus moves into the dialog on open; Tab cycles within the dialog; Escape closes it and
returns focus to the trigger.

**Known open (G30-D-006):** expect focus to remain on the trigger, Tab to leave the dialog into the
page behind it, and Escape to do nothing. Record the exact sequence of stops — that list is the
evidence.

### KB-06 — Focus visibility inventory

**Steps:** Tab through every distinct control class on every surface. Screenshot each focused state.

**Pass:** a visible indicator on every control, distinguishable against its background.

**Specific check:** the raw `<input>` elements in the start form have no explicit focus style. In
Safari the default ring is weakest — capture those four inputs on AT-2 specifically.

### KB-07 — Focus after submission

**Steps:** submit from the review screen. Immediately, without touching the keyboard, read
`document.activeElement` from the console, then press Tab once and record where focus lands.

**Pass:** focus is on the completion heading; the next Tab reaches the result link.

**Known open (G30-D-005):** expect `document.activeElement` to be `<body>`.

### KB-08 — Focus after Back

**Steps:** activate Back. Record `document.activeElement`.

**Pass:** focus is on the previous question's heading (the effect keys on `currentId`, so this
should work).

### KB-09 — Commercial surfaces by keyboard

**Steps:** on the snapshot, Tab to each option card, select "Order the full report", then continue
tabbing.

**Pass:** the card is operable; the revealed order summary is the next tab stop after the card, not
somewhere unrelated.

**Known open (G30-D-010):** record where the next stop actually is.

### KB-10 — Admin login and MFA by keyboard

**Steps:** complete admin login and the MFA step using keyboard only. Requires an owner credential.

**Pass:** every field and control is reachable and operable; MFA code entry does not require a
pointer.

**Note:** no agent holds an owner credential. This case requires the named G30 owner.

---

## Part 2 — Screen-reader cases

### SR-01 — Page load announcement (AT-1, AT-2, AT-3)

**Steps:** load each journey surface fresh with the screen reader running. Transcribe the first
five seconds of speech.

**Pass:** the page title is announced and identifies the page.

**Known open (G30-D-002, G30-D-004):** expect no useful title on `/score/**` and none at all on the
report-access error page.

### SR-02 — Landmark and heading navigation (AT-1, AT-2)

**Steps:** open the VoiceOver rotor (or TalkBack's headings menu) on each surface. Screenshot the
landmark list and the heading list.

**Pass:** every major region is reachable by landmark, and every major section by heading.

**Known open (G30-D-009):** on the snapshot expect a heading list containing roughly three entries
for a page with a dozen sections. Screenshot the rotor list — it is the clearest single piece of
evidence for this defect.

### SR-03 — Question and group semantics (AT-1, AT-2, AT-3)

**Steps:** navigate to a control question by form controls (VoiceOver: forms mode / TalkBack:
control navigation, *not* linear reading). Transcribe what is announced when entering the radio
group.

**Pass:** the question text is announced as the group label.

**Known open (G30-D-007):** expect "Select a maturity response, group". Transcribe verbatim.

### SR-04 — Autosave announcements (AT-1, AT-2)

**Steps:** answer five consecutive questions. Transcribe every announcement.

**Pass:** each save produces at most one concise announcement; the progress figure is not
re-read in full on every save.

**Known open (G30-D-011):** expect the whole status block re-announced per save. Count the words
announced per save and record the number.

### SR-05 — Dialog behaviour (AT-1, AT-2)

**Steps:** trigger the scope-change dialog. Transcribe the announcement. Then attempt to reach the
question content behind the dialog using the screen reader's reading commands.

**Pass:** the dialog is announced with its name; background content is unreachable.

**Known open (G30-D-006):** expect the dialog to be announced correctly while the background
remains fully reachable — record both facts, because the mismatch between the announced role and
the actual behaviour is the defect.

### SR-06 — Submission announcement (AT-1, AT-2, AT-3)

**Steps:** submit the assessment. Transcribe everything announced in the ten seconds after.

**Pass:** completion is announced and the result link is discoverable.

**Known open (G30-D-005):** expect silence, with focus on `<body>`.

### SR-07 — Error announcements (AT-1, AT-2)

**Steps:** trigger each error path from CJ-10a. Transcribe.

**Pass:** each `role="alert"` message is announced once, without focus moving.

### SR-08 — Result page reading (AT-1, AT-2)

**Steps:** read the entire snapshot page linearly, then attempt to reach the commercial options by
heading, then by landmark.

**Pass:** the result is comprehensible read linearly, and the commercial options are reachable
without reading the whole page.

**Known open (G30-D-009):** record how the options were actually reached.

### SR-09 — Product selection announcement (AT-1, AT-2)

**Steps:** activate "Order the full report". Transcribe.

**Pass:** the appearance of the order summary is announced, or focus moves to it.

**Known open (G30-D-010):** expect no announcement.

### SR-10 — Payment status change (AT-1, AT-2)

**Steps:** observe a `PAYMENT_PENDING` → `PAID` transition (against a fixture order) with the
screen reader running. Transcribe.

**Pass:** the change is announced once and clearly.

### SR-11 — Report-access error page (AT-1, AT-3)

**Steps:** open an expired report link on a real phone with the screen reader running. Transcribe
page load and the full read-through.

**Pass:** the page is announced with a title, in a declared language, and the support instruction
is reachable.

**Known open (G30-D-004):** expect no title and an undeclared language, so the screen reader may
apply the system default voice rather than en-ZA.

### SR-12 — PDF reading (AT-1, AT-2)

**Steps:** open the delivered PDF in the platform viewer with the screen reader running. Attempt
to: read the document linearly, navigate by heading, and reach the appendix registers.

**Pass:** the document is readable in a sensible order.

**Expected outcome:** the PDF is produced by Chromium print-to-PDF and is **untagged** — no
structure tree, no document language, no alternative text. Reading therefore depends entirely on
the viewer's heuristics. Record exactly what the reader does with it; this is the primary evidence
for the PDF pack's semantic-accessibility section, and it is a known architectural limitation
rather than a defect to fix inside G30.

---

## Execution record

| Case | AT-1 iOS VO | AT-2 macOS VO | AT-3 TalkBack | AT-4 Chrome kbd | AT-5 Edge kbd |
| --- | --- | --- | --- | --- | --- |
| KB-01 | | ☐ | | ☐ | ☐ |
| KB-02 | | ☐ | | ☐ | ☐ |
| KB-03 | | ☐ | | ☐ | ☐ |
| KB-04 | | ☐ | | ☐ | ☐ |
| KB-05 | | ☐ | | ☐ | ☐ |
| KB-06 | | ☐ | | ☐ | ☐ |
| KB-07 | | ☐ | | ☐ | ☐ |
| KB-08 | | ☐ | | ☐ | ☐ |
| KB-09 | | ☐ | | ☐ | ☐ |
| KB-10 | | ☐ | | ☐ | ☐ |
| SR-01 | ☐ | ☐ | ☐ | | |
| SR-02 | ☐ | ☐ | | | |
| SR-03 | ☐ | ☐ | ☐ | | |
| SR-04 | ☐ | ☐ | | | |
| SR-05 | ☐ | ☐ | | | |
| SR-06 | ☐ | ☐ | ☐ | | |
| SR-07 | ☐ | ☐ | | | |
| SR-08 | ☐ | ☐ | | | |
| SR-09 | ☐ | ☐ | | | |
| SR-10 | ☐ | ☐ | | | |
| SR-11 | ☐ | | ☐ | | |
| SR-12 | ☐ | ☐ | | | |

☐ = required and not yet executed. Blank = not applicable to that configuration.
