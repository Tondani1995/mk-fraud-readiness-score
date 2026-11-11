# End-to-end trace: “Board receives fraud reporting” (D1-B-01), fictional session

Fictional session "Fictional Retail Group" (contract 1.2.0 record, read through the historical reader), report input 1.1.0, input digest `75750947425e0253f1ce50c14ad78eedab3cb1283fb555ef4d46f967ef8e02e8`. Every step below is produced by `scripts/readiness-review-report-engine-tests.mjs` (test R-08) and checked: each claim holds against the input at its pointer, and each statement passes the fifteen checks.

## 1 The reported answer, in the stored answer log

```json
{
  "type": "respondent.answer",
  "q": "D1-B-01",
  "value": "2",
  "id": "c4596a1a-b4bd-4bc8-a225-433afe937bbe",
  "seq": 15,
  "at": "2026-11-10T12:53:07.540Z",
  "actor": "respondent"
}
```

## 2 In the report input

At `/domains/0/controls/9/answer`:

```json
{
  "version": 1,
  "value": "2",
  "label": "Some fraud information is reported, but not on a set schedule or in a set format.",
  "class": "partial",
  "at": "2026-11-10T12:53:07.540Z",
  "via": "respondent",
  "source": "respondent-answer",
  "by": "Respondent",
  "role": null,
  "detail": null
}
```

## 3 In the claims ledger

```json
{
  "id": "control:D1-B-01",
  "type": "control",
  "pointer": "/domains/0/controls/9",
  "value": {
    "id": "D1-B-01",
    "key": "Board receives fraud reporting",
    "state": "reported",
    "stateLabel": "Reported partly in place",
    "class": "partial",
    "issue": true,
    "domain": {
      "id": "D1",
      "name": "Fraud governance and accountability"
    },
    "scenario": {
      "id": "FS-D1-03",
      "name": "The oversight body never sees fraud risk",
      "tier": 1
    }
  }
}
```

```json
{
  "id": "answer:D1-B-01:v1",
  "type": "answer",
  "pointer": "/domains/0/controls/9/answer",
  "value": {
    "version": 1,
    "value": "2",
    "label": "Some fraud information is reported, but not on a set schedule or in a set format.",
    "class": "partial",
    "at": "2026-11-10T12:53:07.540Z",
    "via": "respondent",
    "source": "respondent-answer",
    "by": "Respondent",
    "role": null,
    "detail": null
  }
}
```

```json
{
  "id": "gap:D1-B-01",
  "type": "gap",
  "pointer": "/findings/reportedGaps/0",
  "value": {
    "id": "D1-B-01",
    "key": "Board receives fraud reporting",
    "class": "partial",
    "scenario": "FS-D1-03",
    "tier": 1
  }
}
```

```json
{
  "id": "evidence:D1-B-01",
  "type": "evidence",
  "pointer": "/domains/0/controls/9/evidence",
  "value": {
    "by": "MK reviewer (fictional harness)",
    "at": "2026-11-10T12:53:08.405Z",
    "basis": "Only head office records were supplied",
    "forVersion": 1,
    "forValue": "2",
    "current": true,
    "state": "insufficient",
    "label": "Evidence reviewed and insufficient"
  },
  "evidenceLevel": "reviewed",
  "outcome": "insufficient",
  "attribution": {
    "by": "MK reviewer (fictional harness)",
    "at": "2026-11-10T12:53:08.405Z",
    "forVersion": 1,
    "identityVerified": false,
    "identityNote": "The report input carries no verified reviewer identity; reviewers do not yet sign in (B3)."
  }
}
```

```json
{
  "id": "action:address:D1-B-01:0",
  "type": "action",
  "pointer": "/openWork/actions/0",
  "value": {
    "type": "address",
    "id": "D1-B-01",
    "text": "Address the reported gap: Board receives fraud reporting",
    "tier": 1
  }
}
```

## 4 The executive statements that rest on it

- **executive / status** (method): Evidence reviews and conclusions in this report are recorded under a reviewer identity that is not yet verified.  
  rule R-STATUS-IDENTITY, template `status.identity`; cites `evidence:D1-B-01` among 4 claims
- **executive / position** (reported-exposure): Fraud governance and accountability: 2 of the 10 practices reported on were reported as not fully in place.  
  rule R-POS-EXPOSURE-AREA, template `position.exposure.area`; cites `gap:D1-B-01` among 12 claims
- **executive / position** (evidence): MK has reviewed evidence for 2 of the 66 practices reported on. For the others, only what was reported is available.  
  rule R-POS-EVIDENCE, template `position.evidence.summary`; cites `evidence:D1-B-01` among 68 claims
- **executive / evidence** (evidence): For “Board receives fraud reporting”, MK reviewed the evidence supplied and found it insufficient.  
  rule R-EVIDENCE-ITEM, template `evidence.insufficient`; cites `evidence:D1-B-01` among 2 claims; attributed to MK reviewer (fictional harness), identity verified false
- **executive / can-conclude** (reported-exposure): Management has been told by its own respondent that 22 of the 66 practices reported on are not fully in place. This is what was reported; it has been checked against evidence only where stated.  
  rule R-CONCLUDE-REPORTED, template `conclude.reported`; cites `gap:D1-B-01` among 88 claims

## 5 In the management analysis and the register

- **analysis / area:D1** (reported-exposure, evidence level reviewed): “Board receives fraud reporting”: Reported partly in place, as reported by Respondent. MK reviewed the evidence supplied and found it insufficient.
- **remediation register** remediation-1 (unranked, for management consideration): Address the reported gap: Board receives fraud reporting. For management consideration; based on what was reported.

## 6 The supporting evidence reference in the technical annex

```json
{
  "control": {
    "id": "D1-B-01",
    "area": "D1",
    "key": "Board receives fraud reporting",
    "state": "reported",
    "stateLabel": "Reported partly in place",
    "kind": "reported-exposure",
    "currentVersion": 1,
    "source": "respondent-answer",
    "sourceLabel": "answer",
    "evidenceLevel": "reviewed",
    "conclusion": null,
    "claims": [
      "control:D1-B-01",
      "answer:D1-B-01:v1",
      "evidence:D1-B-01"
    ]
  },
  "answerVersion": {
    "control": "D1-B-01",
    "version": 1,
    "value": "2",
    "label": "Some fraud information is reported, but not on a set schedule or in a set format.",
    "via": "respondent",
    "source": "respondent-answer",
    "sourceLabel": "answer",
    "by": "Respondent",
    "at": "2026-11-10T12:53:07.540Z",
    "current": true,
    "claim": "answer:D1-B-01:v1"
  },
  "evidenceRecord": {
    "control": "D1-B-01",
    "record": "evidence",
    "state": "insufficient",
    "conclusion": null,
    "evidenceLevel": "reviewed",
    "current": true,
    "attribution": {
      "by": "MK reviewer (fictional harness)",
      "at": "2026-11-10T12:53:08.405Z",
      "forVersion": 1,
      "identityVerified": false,
      "identityNote": "The report input carries no verified reviewer identity; reviewers do not yet sign in (B3)."
    },
    "basis": "Only head office records were supplied",
    "followUp": null,
    "limitation": null,
    "claim": "evidence:D1-B-01"
  }
}
```

What this trace shows: the executive statement says only that the respondent reported the practice as partly in place and that MK found the evidence supplied insufficient. It does not say the practice is weak, it does not rank it, and the reviewer's record is quoted with its attribution, marked unverified because reviewers do not yet sign in (B3).
