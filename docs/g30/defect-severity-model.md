# G30 defect severity model

One model for every G30 finding, whether it comes from automation, manual device testing or a
screen-reader session.

Severity is decided by **customer impact**, not by the effort to fix, the elegance of the cause, or
the WCAG level involved. A Level AAA-adjacent issue that stops a customer paying is a P0; a Level A
issue on an internal admin page is not.

---

## P0 — Blocks a transaction or access, or creates material unsafe behaviour

A customer cannot complete a commercial action, cannot reach something they have paid for, or the
product does something materially unsafe.

**Examples in this product**
- A customer cannot place an order, or the order records the wrong amount or product.
- A verified-payment surface presents an unverified payment as successful.
- A paid customer cannot open their report on a supported device/browser combination.
- A private link exposes another customer's assessment or report.
- A keyboard trap prevents leaving a control (WCAG 2.1.2).
- Assessment answers are silently lost, so the score is computed from incomplete data.

**Release treatment**
- **Blocks G30.** No exception, no waiver, no conditional pass.
- Requires a fix and a full re-run of every affected matrix row.
- Escalate immediately to the G30 owner; do not batch into a report.

---

## P1 — Major customer-journey or accessibility failure

The journey completes, but a significant group of customers is materially impeded, or a Level A/AA
criterion fails on a customer-facing surface in the primary journey.

**Examples in this product**
- The assessment cannot be completed on a supported phone without pinch-zoom.
- Horizontal overflow at 320 px on any customer route.
- No page title on the journey routes (WCAG 2.4.2, Level A) — G30-D-002.
- The report-access error page cannot reflow on mobile and declares no language — G30-D-004.
- A modal's action buttons are unreachable at a supported viewport — G30-D-006.
- Focus visibility absent on a journey control.
- Orientation locked, or content lost in landscape.
- A target below 24 × 24 px on a primary journey control.

**Release treatment**
- **Blocks G30 by default.**
- May be released only as a written exception carrying: the affected customer population, a
  documented workaround, a committed fix release, and the named accepting owner. The accepting
  owner must be the release owner, not the tester.
- Two or more P1s on the same journey step should be treated as a P0 for that step — the combined
  effect is usually a block even when each part is individually survivable.

---

## P2 — Material usability or accessibility degradation

The journey completes and the customer can succeed, but with avoidable friction, or an assistive
technology user gets a materially worse experience than a sighted pointer user.

**Examples in this product**
- Radio-group legends do not carry the question — G30-D-007.
- No skip link — G30-D-003.
- Missing `autocomplete` on the start form — G30-D-008.
- Result page lacks heading structure — G30-D-009.
- Focus lost after submission — G30-D-005.
- A revealed order panel is neither announced nor focused — G30-D-010.
- Component boundary contrast below 3:1.
- Inconsistent navigation between adjacent journey steps.

**Release treatment**
- Does not block G30 on its own.
- Must be recorded on the sign-off with a target release.
- **Three or more P2s on a single journey step escalates that step to P1.** Cumulative friction on
  one screen is a different problem from scattered friction across a journey, and the model has to
  see it.
- P2s affecting the commercial path (J15–J20) carry a shorter fix commitment than P2s elsewhere.

---

## P3 — Cosmetic or minor

Noticeable but with no material effect on a customer's ability to complete the journey or
understand the outcome.

**Examples in this product**
- Chatty `aria-live` announcements on autosave — G30-D-011.
- Unconditional smooth scrolling under reduce-motion — G30-D-012.
- A disabled control with no explanation — G30-D-013.
- Unbounded status polling — G30-D-014.
- Analytics events that may not fire at small viewports — G30-D-015.
- Minor spacing or alignment inconsistency.

**Release treatment**
- Does not block.
- Recorded on the sign-off; scheduled at the owner's discretion.
- No re-test required for release.

---

## Assigning a severity

Answer in order and stop at the first "yes".

1. Does it stop a commercial action, stop access to a paid artefact, present unverified state as
   verified, expose another customer's data, or lose customer input? → **P0**
2. Does it stop a defined customer group completing a journey step on a supported combination, or
   fail a Level A/AA criterion on a primary customer-facing surface? → **P1**
3. Does it make a journey step materially harder, or give assistive-technology users a materially
   worse outcome? → **P2**
4. Otherwise → **P3**

Then apply the escalation rules:

- ≥ 2 P1s on one journey step → treat the step as P0.
- ≥ 3 P2s on one journey step → escalate the step to P1.
- Any P2 or P3 that recurs on **every** question screen of the assessment (rather than once) is
  escalated one level — a 68-question assessment multiplies per-screen friction.

## De-escalating

Severity may be reduced only when the reduction is recorded with a reason. Legitimate reasons:

- The affected combination is outside the supported matrix (say which row).
- A verified, discoverable workaround exists that does not depend on the customer knowing about it.
- The behaviour is an accepted platform limitation with a written owner decision (for example,
  untagged PDF semantics).

"Hard to fix", "low traffic" and "pre-existing" are not reasons to de-escalate. Pre-existing
defects are still defects: G30 certifies the release candidate as it stands, not the delta.

## Recording

Every defect record carries: ID, severity, escalation applied (if any), journey step, matrix row,
device/browser/viewport, WCAG criterion (where applicable), evidence reference per
[evidence-capture-standard.md](evidence-capture-standard.md), and the accepting owner where an
exception is taken.
