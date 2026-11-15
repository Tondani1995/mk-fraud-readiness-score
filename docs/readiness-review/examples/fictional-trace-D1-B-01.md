# End-to-end trace: “Board receives fraud reporting” (D1-B-01), fictional session

Fictional session "Fictional Retail Group" (contract 1.2.0 record, read through the historical reader), report input 1.2.0, input digest `77f4cbd12651d6b64f4bbf454508375ec6c8635a2ff302b4c2b910f5c8539af6`. Every step below is produced and checked by `scripts/readiness-review-report-engine-tests.mjs` (test R-16): each claim holds against the input at its pointer, and the document passes the twenty checks.

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

And the method's own content for the practice (added in report input 1.2.0), at `/domains/0/controls/9/method`:

```json
{
  "inPlace": {
    "kind": "anchored-level",
    "answers": [
      {
        "value": "4",
        "label": "Consistently operating"
      },
      {
        "value": "5",
        "label": "Embedded and improving"
      }
    ],
    "description": "A standard report covers fraud risk, incidents and losses for the whole organisation at each scheduled meeting."
  },
  "risks": [
    {
      "id": "R2",
      "name": "Governing body unaware of fraud exposure and losses"
    }
  ]
}
```

## 3 In the standard claims ledger

```json
{
  "id": "control:D1-B-01",
  "type": "control",
  "pathway": "standard",
  "pointer": "/domains/0/controls/9",
  "value": {
    "id": "D1-B-01",
    "key": "Board receives fraud reporting",
    "text": "Does the board or council receive regular reporting on fraud risk, incidents and losses?",
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
    },
    "format": "anchored"
  }
}
```

```json
{
  "id": "answer:D1-B-01:v1",
  "type": "answer",
  "pathway": "standard",
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
  "pathway": "standard",
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

## 4 In the executive brief

- **indicated** (indicated-gap, rests on self-reported): Fraud governance and accountability: the responses indicate that 2 of the 10 practices reported on in this area are not fully in place.  
  rule R-IND-AREA, template `indicated.area`; counts `gap:D1-B-01` among 2 gaps out of 10; names no control
- **actions** (method-practice, rests on method): For each of the 22 gaps indicated, the register restates the practice as the draft method describes it in place, as a recommended action for management consideration. The actions are not ranked.  
  rule R-ACTIONS-SUMMARY, template `actions.summary`; counts `gap:D1-B-01` among 22 gaps out of 66; names no control
- **decisions** (decision, rests on self-reported): Decide which of the 22 gaps indicated by the responses to act on, and how. The report does not rank them.  
  rule R-DECISION-ACTIONS, template `decision.actions`; counts `gap:D1-B-01` among 22 gaps out of 66; names no control

## 5 In the management analysis and the register

- **analysis / area:D1** (indicated-gap, rests on self-reported): “Board receives fraud reporting”: Reported partly in place. Answered by: Respondent. Response: “Some fraud information is reported, but not on a set schedule or in a set format.”
- **analysis / area:D1** (method-practice, rests on method): In the draft method, “Board receives fraud reporting” addresses these fraud risks: Governing body unaware of fraud exposure and losses.
- **analysis / scenario:D1** (indicated-gap, rests on self-reported): “The oversight body never sees fraud risk”: the responses indicate a gap in the practice the method uses to address it. “Board receives fraud reporting”: Reported partly in place.
- **reported issue** issue-1 (unranked, for management consideration): “Board receives fraud reporting”: Reported partly in place. Answered by: Respondent. Response: “Some fraud information is reported, but not on a set schedule or in a set format.”
- **recommended action** action-1 (source draft-method-in-place, unranked): Recommended action, for management consideration: bring “Board receives fraud reporting” to the practice the draft method describes as in place: “A standard report covers fraud risk, incidents and losses for the whole organisation at each scheduled meeting.”

## 6 In the technical annex

```json
{
  "control": {
    "id": "D1-B-01",
    "area": "D1",
    "key": "Board receives fraud reporting",
    "state": "reported",
    "stateLabel": "Reported partly in place",
    "coverage": "reported",
    "kind": "indicated-gap",
    "currentVersion": 1,
    "source": "respondent-answer",
    "sourceLabel": "answer",
    "recordsSaid": null,
    "claims": [
      "control:D1-B-01",
      "answer:D1-B-01:v1",
      "method:D1-B-01"
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
  }
}
```

## 7 The Advisory record for the same control, kept apart

- For “Board receives fraud reporting”, recorded under a reviewer account whose identity is not verified (MK reviewer (fictional harness), 2026-11-10T12:53:08.405Z), against answer version 1: “Evidence reviewed and insufficient”. Recorded basis: “Only head office records were supplied”. This is not an MK finding.  
  <sub>claim `evidence:D1-B-01` (Advisory pathway); not cited anywhere in the standard report</sub>

What this trace shows: the standard report says only that the respondent reported the practice as partly in place, quotes the response, names the fraud risk the draft method associates with it, and restates the practice as the draft method describes it in place as a recommended action for management consideration. It does not say the practice is weak, it does not rank it, and it says nothing about evidence. The evidence record for the same control belongs to the Advisory record, worded as recorded under an unverified reviewer account and not as an MK finding.
