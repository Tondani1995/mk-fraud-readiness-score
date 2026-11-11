# Report engine: decisions reserved for MK

Status at Phase 2, 11 November 2026. Each item below is a choice the engine currently makes as a **proposal**, built so that MK can confirm or change it without touching the rules. Nothing here is approved. Where a choice is wrong, the change is in one place: the copy table (`copy.ts`), the coverage categories and limits (`document.ts`), or the method itself (B4).

## Methodological decisions (B4)

| # | What the engine does now | Decision for MK |
|---|---|---|
| M1 | A gap is a practice reported in an issue class: partly in place, set out but not working, or not in place. "Set out; no case has tested it yet" and "not applicable" are not gaps | Confirm the classes that make a gap |
| M2 | "Practices reported on" are controls in the `reported` state; recorded facts and practices established by a wider answer are counted separately | Confirm the universe used in "n of the m practices reported on" |
| M3 | Ten coverage categories, each with its own statement: reported, established by a wider answer, recorded fact, waiting (with its applicability and unassigned sub-counts), not reached, applicability not yet known, depending on an unanswered question, excluded by a recorded scope decision (does not apply, not expected at this size, precluded by a related practice reported absent), assumed not to apply, retired | Confirm the categories and the grouping of the three exclusions under one statement |
| M4 | A recommended action restates the practice as the draft method describes it in place: for an anchored question, the description of the lowest in-place level (level 4, "Consistently operating", not level 5); for the standard practice scale, the answer "Yes, across everything it should cover"; for a question with descriptive answers, every answer the method classes as in place | Confirm that restating the in-place description is a sufficiently specific recommended action once the method is approved, and which level an anchored action should restate |
| M5 | Nothing about how, by whom or by when a gap should be addressed: withheld, because neither the method nor a recorded MK judgement supports it | Decide whether the standard report should ever carry more specific remediation, and from what source (approved method content, or a controlled MK commentary record) |
| M6 | Each gap is linked to the fraud risks the draft method names for the practice (the area's risk list). 79 practice questions name no risk, so their gaps carry no risk statement | Confirm the risk links, and complete or accept the 79 without one |
| M7 | The brief counts each scenario once: by what the responses established for it (a gap, or the practice reported in place), otherwise as "cannot yet be decided" (waiting, not reached, applicability not known, which control applies not known) or "do not apply or are not expected" (out of scope, precluded, assumed) | Confirm the scenario grouping in the brief; the analysis keeps every status apart |
| M8 | Method tiers appear only in the annex, with their meaning ("sets only the order of information gathering; not a ranking of fraud risk or materiality"), and order only the information-gathering register | Confirm, or approve a prioritisation method (D3) |
| M9 | The engine's "material" scenarios are not used: the standard report makes no materiality statement | Confirm |
| M10 | The scenario status "precluded" is defined by the engine but cannot occur with bank 1.3-review: each of the six scenarios whose confirming practice could be precluded is gated first by the same fact, through its own applicability condition or its route (test R-08). Its wording is exercised on a synthetic input | Confirm that this is intended, or correct the scenario conditions |
| M11 | The two multi-select practices (D4-M-13, D5-V-13) have no in-place description the report can quote, so a gap on either gets an explicit withheld action | Decide whether the method should describe them in place |
| M12 | What the respondent said about records ("a record could be shown") appears only in the area analysis and the annex, as self-reported, with "MK has not seen these records". It never leads to an evidence request | Confirm that the standard report should report it at all, and where |
| M13 | The reviewer-based completion condition in the input (`method.completeness`: "complete only when an authorised reviewer has concluded…") is not used by the standard report | Decide the completion conditions of the self-reported pathway, if any beyond the interview having ended |
| M14 | Release criteria of the standard pathway: interview ended, real record, method approved, copy approved, commercial path, terms and privacy, staging isolation, authenticated access for the organisation. None concerns evidence or reviewers | Confirm the list, in particular whether a report may be released while questions are still waiting for accountable functions (now: yes, and the report says how many) |
| M15 | Six judgements are withheld explicitly: overall readiness; priority, materiality or urgency; how, by whom and by when to remediate; accuracy of the responses; any score, rating or maturity level; any view on what was not asked | Confirm the list is complete |
| M16 | Three management decisions: which gaps to act on, and how; who should answer questions with no accountable function; confirming the assumptions about activities | Confirm the decision kinds |
| M17 | No score while the method is unapproved (D10). This is a constraint of the current stage, not an MK commercial or methodological policy | Decide when an approved method may carry a score, as a separate versioned contract |
| M18 | Advisory: evidence levels, the meaning of each reviewer conclusion, independent validation, and when an Advisory entry may be worded as an MK finding (only under a verified MK reviewer identity, B3) | Decide within the Advisory package's own scope |

## Copy decisions (B7)

| # | What the engine does now | Decision for MK |
|---|---|---|
| C1 | All 75 templates of the standard report in `copy.ts`, version 0.2.0-draft, every one used by at least one golden session or synthetic variant (test R-17) | Approve or reword each; an approved table gets a new version and `approved: true` |
| C2 | The basis statement: "This report rests on the organisation's own responses to the assessment and on the assessment method. MK has not reviewed evidence or verified any response; evidence review is not part of this assessment. Where the report describes a gap, it is a gap indicated by the responses, not a verified control deficiency." | Approve the exact wording, which the checks pin |
| C3 | Thirteen pinned sentences in `validate.ts` (what MK did not do, what is withheld, why an unasked control is not a finding). A change to any of them needs a code change, by design, so that no copy edit can turn a denial into an assertion | Approve these word for word as part of C1 |
| C4 | "Gap indicated by the responses", "practices reported on", "not fully in place", "reported issue", "recommended action, for management consideration" | Confirm the vocabulary |
| C5 | Recommended actions say "the draft method"; once approved this would become "the method" | Decide the wording after approval |
| C6 | The report does not mention the Advisory package or offer it (D11) | Decide whether, where and how a customer report may mention that Advisory exists, as a commercial decision |
| C7 | Values quoted from the engine and the bank appear verbatim: state labels ("Reported partly in place"), scenario status labels ("Its control was reported in place", "Waiting for an owner to answer"), provenance sentences, area, practice, scenario and risk names, and "Answered by: Respondent" | Approve them in `labels.ts` and the bank, or approve replacements |
| C8 | Dates appear as recorded (ISO time) | A renderer decision (Phase 4) |
| C9 | The Advisory record's draft copy (`advisory-record.ts`, 0.1.0-draft), including "recorded under a reviewer account whose identity is not verified" and "This is not an MK finding." | Approve within the Advisory package |

## Presentation decisions (D2, D4)

| # | What the engine does now | Decision for MK |
|---|---|---|
| P1 | The brief is limited to 36 statements and names no individual control | Set the limits |
| P2 | Counts appear in the brief with their universe at any level of coverage | Decide whether to withhold counts from the brief below some coverage, and at what level |
| P3 | The brief has six sections in a fixed order: status and basis; what the responses indicate; coverage; recommended actions; judgements withheld; decisions | Confirm the order |

## Commercial and product decisions (B5, D11)

| # | What the engine does now | Decision for MK |
|---|---|---|
| B-1 | The standard report is the automated self-reported pathway. It is connected to no product: the existing Snapshot and Comprehensive Report are unchanged | Decide how, if at all, it relates to the Comprehensive Report |
| B-2 | The Advisory record is preserved, kept apart, and connected to nothing | Decide whether and how the Advisory package uses it, under a separate commercial decision |
| B-3 | The review-track interface, built before the correction and outside the report engine, still places reviewer evidence work inside the review flow: the `/review` page describes a second stage in which "an MK reviewer can record evidence and conclusions" and says the review "is complete only when an authorised MK reviewer has concluded"; the review Snapshot has an "Evidence still to review" section; the management view and the reviewer workspace sit in the same session. The engine's own completion definition (`completeWhy`, vendored build 1.5) says the same. The review Snapshot already notes that reviewer judgement on evidence is Advisory work. Not changed here: the interface is unapproved copy (B7), the reviewer workspace's place depends on access and engagement decisions (B3, B5), and the completion definition is in the vendored engine (B4) | Decide whether the reviewer workspace leaves the review track for a separate Advisory surface, and approve interface wording that describes the standard assessment as self-reported |
