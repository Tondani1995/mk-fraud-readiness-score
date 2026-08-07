# G30 execution runbook

**Do not start until G40/G41 (Staging Journey 6) is closed.** The first step of this runbook is to
verify that in writing.

---

## Phase 0 — Preconditions

**P0.1 — Confirm G40/G41 closure.** Record who closed it, when, and where the closure evidence
lives. Enter it in `run-manifest.json` under `gatePrecondition`. Do not proceed on a verbal
"it's done".

**P0.2 — Identify the deployment under test.** G30 certifies a *deployment*, not a branch. Record
the Vercel deployment id and URL. It must be the Preview deployment built from
`23d5d7e10b389f98054587c09f44ee846be8172e`.

**P0.3 — Verify the build.** `GET /score/api/system/build-info` on that deployment and confirm the
SHA matches. If it does not, stop.

**P0.4 — Confirm the adaptive route is live.** The adaptive journey requires
`VERCEL_ENV === 'preview'` and the Staging Supabase project (`src/lib/adaptive/server.ts:41`), plus
an enabled `adaptive_activation_policies` row for `customer_start` with a matching graph version and
fingerprint. If activation is disabled, J03–J14 cannot run at all; resolve that before scheduling
device time.

**P0.5 — Agree the data footprint.** Live execution of J03–J14 **creates Staging assessment,
organisation and respondent rows**. Before starting, agree with the G30 owner:
- how many assessment references will be created,
- the naming convention that makes them identifiable as G30 fixtures,
- who cleans them up afterwards and when.
Record every reference created in the run manifest. This is the one part of G30 that writes data,
and it must be deliberate.

**P0.6 — Confirm the commercial boundary.** By default G30 places **no order** and **initiates no
payment**. If the owner authorises a disposable fixture order, that authorisation is written into
the run manifest with the owner's name before the run starts.

**P0.7 — Create the evidence root** per [evidence-capture-standard.md](evidence-capture-standard.md)
and write `run-manifest.json` first.

**P0.8 — Assemble hardware.** A real iPhone with VoiceOver, a real Android phone with TalkBack, a
Mac with Safari and VoiceOver, a Windows machine with Edge. Emulation does not substitute for
DB-A, DB-B, DB-C or DB-E.

---

## Phase 1 — Automated pre-screen (no deployment required)

Runs offline against the source. Catches contract regressions before device time is spent.

```bash
npm run g30:test-static-a11y-contract
```

Writes `evidence/g30/<run-id>/automated/static-a11y-contract.json`. Exit code is non-zero only if
a check that was previously passing has regressed against
`scripts/g30/a11y-contract-baseline.json`. Known-open items from
[open-defect-register.md](open-defect-register.md) are reported as `KNOWN-OPEN`, not as failures —
the baseline is what makes this script useful in CI without permanently red output.

If a new `REGRESSION` appears, stop and raise it before continuing: something changed relative to
the certified expectation.

---

## Phase 2 — Automated device sweep (Chromium, fixture-backed)

Runs `puppeteer-core` across the full viewport set. It **intercepts every `/score/api/**` request
and serves local fixtures**, so it creates no Staging data, initiates no payment, invokes no AI and
sends no email.

```bash
export G30_BASE_URL="https://<preview-host>"
export CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export VERCEL_PROTECTION_BYPASS="<bypass token>"   # only if the Preview is protected
export G30_EVIDENCE_DIR="evidence/g30/<run-id>/automated"

npm run g30:test-device-a11y
```

Covers, per viewport (320, 375, 390, 430, 768, 1024, 1280, 1440, plus 200% and 400% zoom):

- horizontal overflow and iframe/nested-scroll checks (MOB-01, MOB-02, WCAG 1.4.10),
- tap-target measurement for every interactive element (MOB-05, WCAG 2.5.8),
- focus-visibility sampling across every control class (WCAG 2.4.7),
- ARIA and semantic contract presence (WCAG 1.3.1, 4.1.2),
- page-title and `lang` inventory (WCAG 2.4.2, 3.1.1),
- `autocomplete` inventory (WCAG 1.3.5),
- heading and landmark structure dump (WCAG 1.3.1, 2.4.6),
- keyboard-reachability sweep and tab-cost-per-question (KB-02),
- payment-return rendering for all seven verified states,
- screenshots per surface per viewport.

Expect failures. Several are the known-open defects. The script separates `KNOWN-OPEN` from
`REGRESSION` the same way Phase 1 does.

**What this phase does not establish:** anything about WebKit, Edge, real touch, real keyboards or
assistive technology. It is a pre-screen that reduces device time, not a substitute for it.

---

## Phase 3 — Manual device execution

Order matters: do the cheapest disqualifying checks first.

**3.1 — DB-A (iPhone Safari), VP-390, portrait.** Run the full customer journey CJ-01a through
CJ-20e. This is the single most important pass in the gate: it is the RC's primary journey on its
primary device. Capture a continuous screen recording of the whole journey plus a screenshot per
screen class.

**3.2 — DB-A, VP-320.** Re-run only the reflow-sensitive cases: CJ-06c, CJ-12d, CJ-14g, CJ-15f,
CJ-16d, CJ-19b, and MOB-02 and MOB-06 in full. This is where the dialog-overflow defect is
expected to appear.

**3.3 — DB-A, VP-430, landscape.** Run CJ-07, CJ-08, CJ-14, and MOB-01 through MOB-04.

**3.4 — DB-B (Android Chrome), VP-375.** Full journey. Pay particular attention to CJ-09b
(hardware/gesture back), CJ-03f (keyboard overlay) and CJ-20b (download handling).

**3.5 — DB-C (macOS Safari), keyboard-only.** Run the full KB-\* set.

**3.6 — DB-E (Windows Edge).** Run the journey once at VP-DESK plus the KB-\* set. Blink parity
with Chrome is expected but must be shown, not assumed.

**3.7 — Screen-reader sessions.** SR-01 through SR-12 across AT-1, AT-2 and AT-3. Budget these
separately — a full VoiceOver pass over the assessment and result is a multi-hour session and
should not be squeezed onto the end of a device day.

**3.8 — Admin reduced scope.** M-06. Requires an owner credential; no agent can execute it.

---

## Phase 4 — PDF certification

**4.1 — Obtain the artefact.** Use an already-produced report from the G40/G41 fixture set. G30
does not generate a report: generation invokes AI and email.

**4.2 — Visual and content QA.**

```bash
python3 scripts/checkpoint-f-pdf-audit.py <path-to-pdf>
```

Attach the JSON. If `PDF_NEAR_EMPTY_PAGE` fails locally on macOS, re-check against CI before
raising a defect — that check is known to be environment-sensitive, and CI is authoritative.

**4.3 — Manual visual cases.** PDF-V-01 through PDF-V-12, including the monochrome print test and
the per-viewer zoom test.

**4.4 — Semantic cases.** PDF-S-01 through PDF-S-10 with a structure inspector. Expect the
untagged-PDF findings. Record the tool and version used.

**4.5 — Record both PDF lines separately** on the sign-off. Never a single combined verdict.

---

## Phase 5 — Consolidation

**5.1 — Reconcile the matrix.** Every row in M-01 through M-05 has an outcome. Blank rows are
incomplete, not passes.

**5.2 — Resolve the preparation register.** For each of G30-D-001 through G30-D-015: confirmed,
refuted, or re-severitied — with evidence. A prediction that was never tested is carried forward as
`NOT_EXECUTED`, not quietly dropped.

**5.3 — Apply the escalation rules** in [defect-severity-model.md](defect-severity-model.md).
Count P1s and P2s per journey step before assigning final severities.

**5.4 — Run the completeness check** in
[evidence-capture-standard.md](evidence-capture-standard.md) §8.

**5.5 — Complete the sign-off** using [signoff-template.md](signoff-template.md).

---

## Phase 6 — Re-run policy

After any fix:

- **P0 fix** — re-run every matrix row that touches the affected journey step, on every device in
  the matrix. New run id.
- **P1 fix** — re-run the affected cases on every device where the defect was observed, plus DB-A
  regardless. New run id.
- **P2/P3 fix** — re-run the affected case on one representative device. May be recorded as an
  addendum to the existing run, clearly labelled.

Never edit a closed run's evidence.

---

## Time and dependency notes

- Phases 1 and 2 are minutes. Phase 3 is days of device time. Phase 3.7 alone is a substantial
  block — schedule it early enough that a P1 found there still leaves fix-and-retest time.
- Phase 3 depends on P0.4: if adaptive activation is not enabled on the Preview, no device time can
  usefully be spent.
- Phase 4 depends on a report artefact existing from G40/G41.
- M-06 depends on an owner credential.

## What can start the moment G40/G41 closes

Phases 0, 1, 2 and 4.2 need only the deployment, a Chromium binary and an existing PDF. Everything
else needs hardware, humans or credentials.
