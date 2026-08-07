# G30 sign-off

**TEMPLATE — NOT COMPLETED. G30 has not been executed and no decision has been recorded.**

Every field below is deliberately unfilled. Do not enter a decision until every section is
complete and [evidence-capture-standard.md](evidence-capture-standard.md) §8 passes.

---

## 1. Subject of certification

| Field | Value |
| --- | --- |
| Run id | `` |
| Certified SHA | `` |
| SHA verified against `/score/api/system/build-info` | ☐ yes — value returned: `` |
| Deployment provider | `` |
| Deployment id | `` |
| Deployment URL | `` |
| Deployment environment | `` |
| Supabase project ref | `` |
| Adaptive activation policy state | `` |
| Execution window (UTC) | `` → `` |

## 2. Gate precondition

| Field | Value |
| --- | --- |
| G40/G41 closed | ☐ yes |
| Closed at (UTC) | `` |
| Closed by | `` |
| Closure evidence reference | `` |

G30 must not be executed or signed off while this section is incomplete.

## 3. Data and commercial footprint

| Field | Value |
| --- | --- |
| Staging assessment references created | `` |
| Staging organisation / respondent rows created | `` |
| Cleanup owner | `` |
| Cleanup completed | ☐ yes — date: `` |
| Orders placed | ☐ none / ☐ authorised fixture order — reference: `` |
| Authorising owner for any order | `` |
| Payments initiated | ☐ none |
| AI invocations | ☐ none |
| Emails sent | ☐ none |

## 4. Device and browser coverage

One row per matrix row from [device-browser-matrix.md](device-browser-matrix.md).

| Matrix row | Combination | Executed | Outcome | Evidence ref |
| --- | --- | --- | --- | --- |
| M-01 | | ☐ | | |
| M-02 | | ☐ | | |
| M-03 | | ☐ | | |
| M-04 | | ☐ | | |
| M-05 | | ☐ | | |
| M-06 | | ☐ | | |

Devices actually used (make, model, OS version, browser version):

| Ref | Device | OS | Browser | Serial / identifier |
| --- | --- | --- | --- | --- |
| DB-A | | | | |
| DB-B | | | | |
| DB-C | | | | |
| DB-D | | | | |
| DB-E | | | | |

Combinations **not** executed, with the accepting owner for each:

| Combination | Reason | Accepting owner |
| --- | --- | --- |
| | | |

## 5. Automated test results

| Suite | Command | Exit code | Evidence ref |
| --- | --- | --- | --- |
| Static a11y contract | `npm run g30:test-static-a11y-contract` | | |
| Device a11y browser sweep | `npm run g30:test-device-a11y` | | |
| PDF visual/content audit | `python3 scripts/checkpoint-f-pdf-audit.py …` | | |

Regressions reported (i.e. checks that were passing at the certified baseline and now fail):

| Check | Detail | Defect id |
| --- | --- | --- |
| | | |

## 6. Manual test results

| Pack | Cases defined | Executed | Pass | Fail | Blocked | N/A | Exception |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customer journey (CJ-\*) | | | | | | | |
| Mobile UX (MOB-\*) | | | | | | | |
| WCAG 2.2 AA matrix | | | | | | | |
| Keyboard (KB-\*) | | | | | | | |
| Screen reader (SR-\*) | | | | | | | |
| PDF visual (PDF-V-\*) | | | | | | | |
| PDF semantic (PDF-S-\*) | | | | | | | |

## 7. PDF certification — two separate lines

| Line | Outcome | Evidence ref |
| --- | --- | --- |
| PDF visual and content quality | | |
| PDF semantic accessibility | | |

PDF artefact SHA-256: ``

Owner decision on the untagged-PDF limitation (see
[pdf-accessibility-pack.md](pdf-accessibility-pack.md)):

> _State the limitation, its customer impact, and whether it is accepted for this release or
> raised as a follow-up. A blank here means the section is incomplete._

## 8. Resolution of the preparation defect register

Every entry in [open-defect-register.md](open-defect-register.md) must be resolved to
CONFIRMED / REFUTED / RE-SEVERITIED / NOT EXECUTED.

| Prep id | Provisional | Resolution | Final severity | Evidence ref |
| --- | --- | --- | --- | --- |
| G30-D-001 | P1 | | | |
| G30-D-002 | P1 | | | |
| G30-D-003 | P2 | | | |
| G30-D-004 | P1 | | | |
| G30-D-005 | P2 | | | |
| G30-D-006 | P1 | | | |
| G30-D-007 | P2 | | | |
| G30-D-008 | P2 | | | |
| G30-D-009 | P2 | | | |
| G30-D-010 | P2 | | | |
| G30-D-011 | P3 | | | |
| G30-D-012 | P3 | | | |
| G30-D-013 | P3 | | | |
| G30-D-014 | P3 | | | |
| G30-D-015 | P3 | | | |

## 9. Open defects at sign-off

| Defect id | Severity | Escalation applied | Journey step | Title | Target release | Evidence ref |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

Counts:

| Severity | Count |
| --- | --- |
| P0 | |
| P1 | |
| P2 | |
| P3 | |

Escalation rules from [defect-severity-model.md](defect-severity-model.md) applied: ☐ yes

## 10. Accepted exceptions

Each exception requires an affected population, a workaround, a committed fix release and an
accepting owner who is the release owner, not the tester.

| Defect id | Severity | Affected customers | Workaround | Fix committed for | Accepting owner | Date |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## 11. Decision

**G30 decision:** ☐ PASS ☐ PASS WITH EXCEPTIONS ☐ FAIL

Decision rules:

- Any open **P0** → FAIL. No exception is available.
- Any open **P1** without a completed row in §10 → FAIL.
- Any incomplete row in §4, §6 or §8 → the gate is incomplete and no decision may be recorded.

Rationale:

> _Required. State what was certified, on what, and what the decision rests on._

| Role | Name | Signature | Date (UTC) |
| --- | --- | --- | --- |
| G30 owner | | | |
| Release owner | | | |
| Test operator(s) | | | |

## 12. Scope statement

This sign-off certifies device, browser, mobile and accessibility behaviour of the named deployment
against the packs in `docs/g30/`. It is **not** a formal WCAG 2.2 conformance claim and must not be
represented as one. It does not certify functional correctness, security, scoring accuracy,
commercial correctness, or the AI narrative pipeline — those belong to their own gates.
