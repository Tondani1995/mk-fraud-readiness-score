# G30 evidence capture standard

Evidence is auditable when a reader who was not present can reconstruct exactly what was run, on
what, against which build, and what happened. Everything below exists to make that possible six
months later.

---

## 1. Evidence root

```
evidence/g30/<run-id>/
```

`<run-id>` is `g30-<UTC date>-<sequence>`, e.g. `g30-20260812-01`. A re-run after a fix gets a new
run id; evidence is never overwritten.

```
evidence/g30/g30-20260812-01/
├── run-manifest.json          # required, written first
├── automated/
│   ├── static-a11y-contract.json
│   ├── device-a11y-browser.json
│   ├── pdf-audit.json
│   └── screenshots/
├── manual/
│   ├── <case-id>/
│   │   ├── <evidence files>
│   │   └── record.json
├── defects/
│   └── G30-<nnn>/
└── signoff.md
```

## 2. Run manifest

Written before any case is executed. A run without a manifest is not auditable.

```json
{
  "runId": "g30-20260812-01",
  "startedAtUtc": "2026-08-12T06:40:00Z",
  "sha": "23d5d7e10b389f98054587c09f44ee846be8172e",
  "deployment": {
    "provider": "vercel",
    "environment": "preview",
    "deploymentId": "<vercel deployment id>",
    "url": "https://<preview-host>",
    "supabaseProjectRef": "<project ref>"
  },
  "gatePrecondition": {
    "g40g41Status": "CLOSED",
    "closedAtUtc": "<timestamp>",
    "closedBy": "<owner>"
  },
  "owner": "<G30 owner>",
  "operators": ["<name>"],
  "scopeExclusions": []
}
```

`sha` and `deployment.deploymentId` must both be captured from the running deployment, not assumed.
Cross-check `sha` against `/score/api/system/build-info` on the deployment under test and record
both values; if they disagree, stop — you are testing something other than the certified build.

## 3. File naming

```
<case-id>__<device>__<browser>__<viewport>__<condition>__<seq>.<ext>
```

- `case-id` — `CJ-07c`, `MOB-05`, `KB-05`, `SR-03`, `WCAG-2.4.2`, `PDF-V-04`
- `device` — `iphone15pro`, `pixel7`, `macbookpro-m2`, `win11-desktop`
- `browser` — `safari17.4`, `chrome127`, `edge127` (include the version)
- `viewport` — `320x568`, `390x844`, `1280x800`, or `zoom200`
- `condition` — `portrait`, `landscape`, `touch`, `keyboard`, `voiceover`, `talkback`, `slow4g`,
  `default`
- `seq` — `01`, `02` … within the same case

Examples:

```
CJ-06c__iphone15pro__safari17.4__320x568__portrait__01.png
MOB-06__macbookpro-m2__chrome127__1280x800__zoom200__01.png
SR-03__iphone15pro__safari17.4__390x844__voiceover__01.mp4
```

## 4. Minimum proof by evidence type

### Screenshots

- Full-page unless the case is specifically about the viewport, in which case capture the viewport
  exactly and say so in `record.json`.
- The URL must be visible, or recorded in `record.json`.
- No cropping that removes the browser chrome on manual device captures — the chrome is part of the
  evidence for mobile cases.
- PNG. Lossy formats are not accepted for layout or contrast evidence.

### Screen recordings

- Required for: every keyboard case (KB-\*), every screen-reader case (SR-\*), every case whose
  pass condition involves a transition or a sequence, and every defect where a static image cannot
  show the failure.
- Screen-reader recordings must capture speech, or show the caption panel throughout.
- Every screen-reader recording is accompanied by a **written transcript** in `record.json`. The
  transcript is the finding; the recording corroborates it.
- MP4 or MOV. Keep the full take — do not trim to the moment of failure.

### Automated output

- The full JSON from `scripts/g30-static-a11y-contract-tests.mjs`,
  `scripts/g30-device-a11y-browser-tests.mjs` and `scripts/checkpoint-f-pdf-audit.py`, unedited.
- Plus the invoking command line and the exit code.
- Screenshots emitted by the browser script go to `automated/screenshots/` under their own names;
  do not rename them.

### PDF evidence

- The delivered PDF artefact itself, plus its SHA-256.
- The audit JSON.
- Page images for any page carrying a finding.
- For semantic cases (PDF-S-\*), the structure-inspector output or a screenshot of it, naming the
  tool and version used.

## 5. Per-case record

Every manual case directory contains `record.json`:

```json
{
  "caseId": "CJ-06c",
  "matrixRow": "M-02",
  "journeyStep": "J06",
  "wcagCriteria": ["2.4.3", "1.4.10"],
  "runId": "g30-20260812-01",
  "sha": "23d5d7e10b389f98054587c09f44ee846be8172e",
  "deploymentUrl": "https://<preview-host>",
  "device": "iphone15pro",
  "os": "iOS 17.4",
  "browser": "Safari 17.4",
  "viewport": "320x568",
  "condition": "portrait",
  "assistiveTech": null,
  "executedAtUtc": "2026-08-12T07:15:00Z",
  "operator": "<name>",
  "expectedResult": "Both dialog buttons are visible and reachable at 320px.",
  "actualResult": "Panel height 612px exceeds viewport 568px; panel is vertically centred with no internal scroll; both buttons are below the fold and cannot be reached.",
  "outcome": "FAIL",
  "defectId": "G30-D-006",
  "evidence": ["CJ-06c__iphone15pro__safari17.4__320x568__portrait__01.png",
               "CJ-06c__iphone15pro__safari17.4__320x568__portrait__02.mp4"],
  "transcript": null,
  "notes": ""
}
```

`outcome` is one of `PASS`, `FAIL`, `BLOCKED`, `NOT_APPLICABLE`, `NOT_EXECUTED_EXCEPTION`.

- `BLOCKED` requires `notes` explaining what prevented execution.
- `NOT_APPLICABLE` requires `notes` justifying it against the case definition.
- `NOT_EXECUTED_EXCEPTION` requires a named accepting owner in `notes`.

`actualResult` must state what was observed, with numbers where the case produces numbers.
"Looked fine" is not an actual result.

## 6. Defect records

```
defects/G30-<nnn>/
├── defect.json
└── <evidence copied or referenced>
```

```json
{
  "defectId": "G30-D-006",
  "severity": "P1",
  "escalationApplied": null,
  "title": "Scope-change dialog buttons unreachable at 320px",
  "journeyStep": "J06",
  "matrixRows": ["M-02"],
  "wcagCriteria": ["2.4.3", "1.4.4", "1.4.10"],
  "affectedCombinations": ["DB-A x VP-320 x C-PORT", "DB-D x VP-DESK x C-ZOOM200"],
  "firstObservedRun": "g30-20260812-01",
  "sourceReference": "src/components/adaptive/AdaptiveAssessmentExperience.tsx",
  "reproductionSteps": ["…"],
  "expected": "…",
  "actual": "…",
  "evidence": ["…"],
  "acceptedException": null,
  "acceptingOwner": null,
  "targetRelease": null
}
```

Defects found before execution (during preparation) are pre-registered in
[open-defect-register.md](open-defect-register.md) with provisional severities. G30 execution
confirms, refutes or re-severities each one — a preparation prediction is never carried into the
sign-off as a result.

## 7. Retention and integrity

- Evidence is immutable once a run closes. Corrections go into a new run.
- Record the SHA-256 of every PDF artefact and of any downloaded binary.
- Evidence must not contain live customer personal data. Use fixture organisations and fixture
  respondent names. If a screenshot captures a real assessment reference, record it in the manifest
  so the row can be traced and cleaned up after G40/G41.
- Retain for the life of the release plus one major version.

## 8. Completeness check before sign-off

A run is complete when:

1. `run-manifest.json` exists and its `sha` matches `/score/api/system/build-info` on the
   deployment under test.
2. Every row in M-01 through M-05 has an outcome.
3. Every case in the mobile pack, the WCAG matrix and the keyboard/screen-reader pack has an
   outcome.
4. Every `FAIL` has a defect record.
5. Every `NOT_EXECUTED_EXCEPTION` has a named accepting owner.
6. Automated output and its exit codes are attached.
7. The PDF artefact and its SHA-256 are attached.

A missing outcome is an incomplete gate. It is not a pass and it is not an exception.
