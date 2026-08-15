# A01–A21 reconciliation — SHA d0385406402a87bae9b5f3fbe4babe7a95eb54e2

## Source inventory (corrected)
The A01–A21 set lives in the project's **external requirements artefacts**, not this repository.
My previous search of `docs/`, `outputs/`, markdown and git history correctly found nothing here;
the conclusion that the set did not exist was wrong. The authoritative list was supplied by the
owner and is used verbatim below. No reconstruction or inference was applied.

Carry-forward rule: prior PASS evidence stands where the implementing source has not materially
changed, verified by diff. Since `47ad61b` only three files changed, all customer-journey copy
covered by the green storefront gate. `src/lib/snapshot/commercial-insights.ts` is unchanged since
its c470f28 verification.

## Dispositions

| ID | Requirement | Disposition | Evidence |
|---|---|---|---|
| A01 | Native flow, no iframe | **PROVEN ON CURRENT SHA** | 0 iframes on the live assessment |
| A02 | No nested-scroll failure | **PROVEN ON CURRENT SHA** | 0 nested scroll containers |
| A03 | Responsive progression | **PROVEN ON CURRENT SHA** | 320×700, 390×844, 768×1024, 1440×1000 — 0 horizontal overflow at every width |
| A04 | Save before advance | **PROVEN ON CURRENT SHA** | 3 gateway answers persisted, `save_sequence` 7; answers survive reload |
| A05 | Mobile product presentation | **PRESERVED + PREVIOUSLY PROVEN** | Tier cards verified live at c470f28; only the Comprehensive tagline changed since, gate-covered |
| A06 | Mobile product selection | **STILL NEEDS ONE LAUNCH CHECK** | Order creation proven by API; the mobile "Choose Comprehensive" tap not exercised |
| A07 | Payment hand-off | **PROVEN ON CURRENT SHA** | Order → full EFT instructions, payment reference = order reference |
| A08 | No silent skip of required answers | **PROVEN ON CURRENT SHA** | `visited_question_ids` = [G01,G02,G03] contiguous; 3 rapid taps advanced exactly one question |
| A09 | Save failure retry | **STILL NEEDS ONE LAUNCH CHECK** | No save failure induced; "Save now" control present |
| A10 | Reload and resume cursor | **PROVEN ON CURRENT SHA** | Cursor = last saved position (G03), answers retained across reload |
| A11 | Free score snapshot | **PRESERVED + PREVIOUSLY PROVEN** | c470f28 live render; implementing analytics file unchanged |
| A12 | Paid report request | **PROVEN ON CURRENT SHA** | `MKORD-2026-30828BF2`, Comprehensive, R35 000,00 |
| A13 | Secure customer report access | **PROVEN ON CURRENT SHA** | Token required; cross-customer token refused; bare reference redirected |
| A14 | Paid/free message correctness | **PROVEN ON CURRENT SHA** | Storefront gate green, 8 surfaces, 12/12 negative, 5/5 positive |
| A15 | Report readiness state | **PROVEN ON CURRENT SHA** | "Report: Being prepared" / "Ready — download below" |
| A16 | Download and error states | **STILL NEEDS ONE LAUNCH CHECK** | Operator download — owner-authenticated session required |
| A17 | Keyboard and screen-reader semantics | **P1 DEFECT — see below** | Radios named+labelled 6/6, fieldset+legend, aria-live present; **focus lost after advance** |
| A18 | Touch and rapid-tap safety | **PROVEN ON CURRENT SHA** | 3 rapid taps → 1 advance, Continue disabled during transition, no error |
| A19 | Canonical customer URL | **PROVEN ON CURRENT SHA** | `/score/adaptive/{ref}`; no vercel/supabase/localhost exposure |
| A20 | Adaptive and legacy coexistence | **PRESERVED + PREVIOUSLY PROVEN** | Portfolio census: both modes scored across the 11-case set |
| A21 | Customer launch acceptance sign-off | **OWNER GATE** | Owner decision, not an engineering check |

## Preserved mobile requirements
No iframe/nested scrolling **PROVEN**; autosave **PROVEN**; advance only after persistence
**PROVEN**; rapid-tap protection **PROVEN**; resume **PROVEN**; no horizontal overflow **PROVEN at
all four historical viewports**; minimum 44px effective targets **PROVEN** (options 56px, buttons
44–46px); visible selected state **PROVEN**; clear primary CTA **PROVEN**.
Offline retention/retry, mobile section selector, product-card stacking, EFT copyability and
error/offline/retry states: **not exercised** — folded into the remaining checks below.
**No focus loss after auto-advance: FAILS — see P1.**

## Superseded by current owner decision
- Named reviewer / evidence review / sign-off in Comprehensive — **removed from the customer
  workspace**; Advisory carries independent validation.
- Stitch / card payment — manual EFT for launch.
- Automated report emailing / automated generation — manual fulfilment for launch.
- Any historical pricing other than R7,500 / R35,000 / from R150,000.

## P1 DEFECT — focus lost after auto-advance
After advancing, `document.activeElement` is `BODY`. A keyboard or screen-reader user is dropped to
the top of the document on every question and must re-traverse to reach the next one. An `aria-live`
region announces the change, so the transition is not silent, but focus is not placed on the new
question. This fails the explicitly approved "no focus loss after auto-advance" requirement and
weakens A17.

Not fixed in this run: focus management needs verification with a real assistive-technology pass,
not a one-line patch at the end of a session.

## Minimum remaining pre-launch checks
1. **Operator fulfilment journey** (A16, and the delivery half) — owner-authenticated session.
   Order `MKORD-2026-30828BF2` is waiting in Staging.
2. **Save-failure retry** (A09) — induce one save failure and confirm retry preserves answers.
3. **Mobile product selection tap** (A06) — one Snapshot render at 390px, tapping "Choose
   Comprehensive". Costs one provider narrative call.
4. **Focus-after-advance fix and re-check** (A17 / P1).
5. **Production EFT profile activation** — launch switch, not a defect.
