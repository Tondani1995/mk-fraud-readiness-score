# G30 device and browser matrix

Every combination below must have an evidence record before G30 can be signed off. Combinations
marked **Manual** cannot be produced by automation in this repository — `puppeteer-core` drives
Chromium only, so WebKit and Edge behaviour is human-executed by construction.

Journey step IDs (J01–J20) are defined in [README.md](README.md).

## Device and browser set

| Ref | Platform | Browser | Engine | Real device required | Automatable |
| --- | --- | --- | --- | --- | --- |
| DB-A | iPhone (iOS 17+) | Safari | WebKit | Yes | No |
| DB-B | Android 13+ | Chrome | Blink | Yes | Partly (emulated only) |
| DB-C | macOS 14+ | Safari | WebKit | No (Mac required) | No |
| DB-D | macOS/Windows | Chrome (current stable) | Blink | No | Yes |
| DB-E | Windows 11 | Edge (current stable) | Blink | No | No (manual; Blink parity assumed but must be shown) |

**Emulation is not evidence for DB-A or DB-B.** Chromium device emulation reproduces viewport and
touch-point count, not WebKit layout, not the iOS dynamic toolbar, not `100dvh` behaviour under
toolbar collapse, not the iOS on-screen keyboard, and not VoiceOver/TalkBack. Emulated runs are
accepted only as pre-screening under DB-D.

## Viewport set

| Ref | Width | Height (min) | Represents |
| --- | --- | --- | --- |
| VP-320 | 320 px | 568 | Smallest supported width; WCAG 1.4.10 reflow reference |
| VP-375 | 375 px | 667 | iPhone SE / older iPhone class |
| VP-390 | 390 px | 844 | iPhone 13/14/15 class |
| VP-430 | 430 px | 932 | iPhone Pro Max class |
| VP-TAB | 768 × 1024 | — | Tablet portrait |
| VP-TAB-L | 1024 × 768 | — | Tablet landscape |
| VP-DESK | 1280 × 800 | — | Desktop baseline |
| VP-DESK-W | 1440 × 900 | — | Desktop wide (parity with existing phase-23 evidence) |

## Condition set

| Ref | Condition | Applies to |
| --- | --- | --- |
| C-ZOOM200 | Browser zoom 200% at VP-DESK (equivalent to 640 CSS px) | All journey steps |
| C-ZOOM400 | Browser zoom 400% at VP-DESK (equivalent to 320 CSS px) | Recorded for reflow; failure at 400% is P2 not P1 |
| C-PORT | Portrait orientation | DB-A, DB-B, tablet |
| C-LAND | Landscape orientation | DB-A, DB-B, tablet |
| C-TOUCH | Touch-only interaction, no keyboard | DB-A, DB-B, tablet |
| C-KEY | Keyboard-only interaction, no pointer | DB-C, DB-D, DB-E |
| C-SR | Screen reader active | See [keyboard-screenreader-pack.md](keyboard-screenreader-pack.md) |
| C-RM | `prefers-reduced-motion: reduce` | All |
| C-SLOW | Throttled network (Slow 4G profile) | J03, J07, J08, J13, J17, J20 |

---

## Coverage matrix

Severity in the final column is the severity carried **if the combination fails**, per
[defect-severity-model.md](defect-severity-model.md). It is a ceiling, not a guarantee — the actual
defect severity is judged on the observed failure.

### M-01 Landing and start (J01–J03)

| Combination | Journey steps | Expected result | Evidence | Status | Severity if failed |
| --- | --- | --- | --- | --- | --- |
| DB-A × VP-390 × C-PORT × C-TOUCH | J01, J02, J03 | Start form fully usable; no horizontal scroll; all fields reachable with the iOS keyboard open; submit reachable | Screenshot per step + screen recording of form entry | Manual | P1 |
| DB-A × VP-320 × C-PORT | J02, J03 | No horizontal overflow; labels and inputs not clipped | Screenshot | Manual | P1 |
| DB-A × VP-430 × C-LAND | J02, J03 | Form usable in landscape with keyboard open; submit reachable | Screen recording | Manual | P2 |
| DB-B × VP-375 × C-PORT × C-TOUCH | J01, J02, J03 | As DB-A; Android keyboard does not obscure the focused field | Screen recording | Manual | P1 |
| DB-C × VP-DESK × C-KEY | J02, J03 | Full keyboard traversal; visible focus at every stop; native validation announced | Screen recording | Manual | P1 |
| DB-D × all VP | J01, J02, J03 | Zero horizontal overflow at every viewport; zero iframes on the assessment route | `g30-device-a11y-browser-tests.mjs` JSON + screenshots | **Automatable** | P1 |
| DB-D × VP-DESK × C-ZOOM200 | J02, J03 | No loss of content or function; no two-dimensional scroll | Screenshot | **Automatable** | P1 |
| DB-E × VP-DESK | J01, J02, J03 | Parity with DB-D | Screenshot per step | Manual | P2 |

### M-02 Adaptive assessment (J04–J13)

This is the RC's primary journey and carries the highest weight in the gate.

| Combination | Journey steps | Expected result | Evidence | Status | Severity if failed |
| --- | --- | --- | --- | --- | --- |
| DB-A × VP-390 × C-PORT × C-TOUCH | J04–J13 | Question, options, Back, Save now, Continue all visible and tappable without pinch-zoom; progress visible; selected answer visually unambiguous; no horizontal scroll on any question | Screen recording of a full path + screenshot per screen class | Manual | P1 |
| DB-A × VP-320 × C-PORT | J05, J06, J07, J12 | Scope-change dialog buttons reachable (see G30-D-006); review screen metrics stack without clipping | Screenshot of dialog at 320 | Manual | P1 |
| DB-A × VP-430 × C-LAND | J07, J08 | Question and options usable in landscape with the toolbar collapsed | Screen recording | Manual | P2 |
| DB-B × VP-375 × C-PORT × C-TOUCH | J04–J13 | As DB-A; back-gesture and hardware back behave per CJ-09b | Screen recording | Manual | P1 |
| DB-B × VP-390 × C-SLOW | J07, J08, J13 | Saving state is visible; no double-submit; no silent answer loss | Screen recording + HAR | Manual | P1 |
| DB-C × VP-DESK × C-KEY | J04–J13 | Full keyboard path from first gateway to submit; focus lands on the new question heading on every advance | Screen recording | Manual | P1 |
| DB-D × VP-320/375/390/430/TAB/DESK | J04–J12 (fixture-stubbed) | Zero overflow; tap targets ≥24 px; visible focus; ARIA contract present; heading present per screen | `g30-device-a11y-browser-tests.mjs` | **Automatable** | P1 |
| DB-D × VP-DESK × C-ZOOM200 | J05, J07, J12 | Single-axis scroll only; no clipped controls | Screenshot | **Automatable** | P1 |
| DB-D × VP-DESK × C-ZOOM400 | J07 | Content reflows; controls remain operable | Screenshot | **Automatable** | P2 |
| DB-E × VP-DESK × C-KEY | J04–J13 | Parity with DB-D | Screen recording | Manual | P2 |

### M-03 Result and snapshot (J14)

| Combination | Journey steps | Expected result | Evidence | Status | Severity if failed |
| --- | --- | --- | --- | --- | --- |
| DB-A × VP-390 | J14 | Metric grid stacks; no clipped values; private-link copy control works on iOS | Screenshot + recording of copy action | Manual | P1 |
| DB-A × VP-320 | J14 | No horizontal overflow across all sections | Screenshot | Manual | P1 |
| DB-B × VP-375 | J14 | As DB-A; clipboard permission handled | Screen recording | Manual | P2 |
| DB-C × VP-DESK × C-KEY | J14 | Every section reachable; copy control keyboard-operable | Screen recording | Manual | P2 |
| DB-D × all VP | J14 (fixture-stubbed) | Zero overflow; heading structure recorded; contrast sampled | `g30-device-a11y-browser-tests.mjs` | **Automatable** | P1 |
| DB-D × VP-DESK × C-ZOOM200 | J14 | Reflow holds | Screenshot | **Automatable** | P1 |
| DB-E × VP-DESK | J14 | Parity | Screenshot | Manual | P2 |

### M-04 Commercial surfaces (J15–J18)

No order is created and no payment is executed by G30. These rows certify presentation and
operability only.

| Combination | Journey steps | Expected result | Evidence | Status | Severity if failed |
| --- | --- | --- | --- | --- | --- |
| DB-A × VP-390 × C-TOUCH | J15, J16 | Option cards fully readable; price and delivery terms not clipped; selecting a card reveals the summary within the viewport or scrolls it into view | Screen recording | Manual | P1 |
| DB-A × VP-320 | J15 | Both option cards stack; bullet lists not truncated | Screenshot | Manual | P2 |
| DB-B × VP-375 | J15, J16 | As DB-A | Screen recording | Manual | P2 |
| DB-C/DB-D/DB-E × VP-DESK × C-KEY | J15, J16 | Option cards keyboard-selectable; revealed panel reachable | Screen recording | Manual (DB-C/E), **Automatable** (DB-D) | P1 |
| DB-A × VP-390 | J17 | Payment return status renders and updates; status text readable | Screen recording ≥60 s | Manual | P1 |
| DB-D × VP-DESK | J17 (stubbed status endpoint) | Each of the seven payment states renders correctly | `g30-device-a11y-browser-tests.mjs` | **Automatable** | P1 |
| DB-A/DB-B × VP-390 | J18 | Pending state is unambiguous and offers a next step | Screenshot | Manual | P2 |

### M-05 Secure report access and PDF (J19–J20)

| Combination | Journey steps | Expected result | Evidence | Status | Severity if failed |
| --- | --- | --- | --- | --- | --- |
| DB-A × VP-390 | J19 success | Redirect completes; PDF opens in the iOS viewer | Screen recording | Manual | P0 |
| DB-A × VP-390 | J19 expired / revoked / rate-limited | Error page readable **without pinch-zoom** (see G30-D-004) | Screenshot per reason | Manual | P1 |
| DB-B × VP-375 | J19 both paths | As DB-A; Android download handling completes | Screen recording | Manual | P0 (success path) |
| DB-C × VP-DESK | J19, J20 | Redirect and Preview.app open | Screenshot | Manual | P1 |
| DB-D/DB-E × VP-DESK | J19, J20 | Redirect and browser PDF viewer open | Screenshot | Manual | P1 |
| DB-A × VP-390 | J20 | PDF legible at default zoom; text selectable | Screenshot + selection recording | Manual | P1 |
| DB-D × VP-DESK | J20 | `checkpoint-f-pdf-audit.py` passes on the delivered artefact | Audit JSON | **Automatable** | P1 |

### M-06 Admin surfaces — reduced scope

Admin is internal, desktop-first and credential-gated. Mobile and screen-reader certification are
explicitly out of scope; record that as an accepted exception on the sign-off.

| Combination | Journey steps | Expected result | Evidence | Status | Severity if failed |
| --- | --- | --- | --- | --- | --- |
| DB-D × VP-DESK × C-KEY | Admin login, MFA | Keyboard-operable; visible focus; MFA input reachable | Screen recording | Manual (credential required) | P1 |
| DB-C × VP-DESK | Admin report controls | Controls render and operate | Screenshot | Manual (credential required) | P2 |
| DB-D × VP-TAB | Admin dashboard | Tables scroll within their own container; no page-level horizontal scroll | Screenshot | Manual | P3 |

---

## Matrix completion rule

G30 cannot be signed off with any row in M-01 through M-05 unrecorded. A row may be recorded as:

- **PASS** with evidence,
- **FAIL** with evidence and a defect ID, or
- **NOT EXECUTED — EXCEPTION** with a written reason and a named accepting owner.

An unrecorded row is not an exception. It is an incomplete gate.
