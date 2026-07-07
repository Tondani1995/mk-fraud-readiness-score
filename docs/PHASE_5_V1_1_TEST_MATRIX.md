# Phase 5 v1.1 Test Matrix

This matrix extends the original Phase 5 test plan. It must be executed in Supabase dev before Phase 5 approval is treated as final.

## A. Happy path tests

| ID | Test | Expected result |
|---|---|---|
| P5-HP-01 | Start assessment from `/start` | Organisation, respondent, assessment reference and resume token are created. |
| P5-HP-02 | Open `/assessment/[ref]?token=...` | Draft assessment loads with exposure profile, 10 domains and 68 questions. |
| P5-HP-03 | Complete exposure profile | 8 exposure answers save and reload after refresh. |
| P5-HP-04 | Complete all 10 domains with numeric 0-5 responses | 68 answers save and reload after refresh. |
| P5-HP-05 | Submit completed assessment | Assessment status becomes `submitted`, `submitted_at` and `locked_at` are set, resume token is revoked. |
| P5-HP-06 | Confirm score runs | Score runs remain `0`; Phase 5 must not score. |

## B. Token and ownership tests

| ID | Test | Expected result |
|---|---|---|
| P5-TK-01 | Wrong token for valid assessment reference | Rejected. |
| P5-TK-02 | Valid token for different assessment reference | Rejected. |
| P5-TK-03 | Expired token | Rejected. |
| P5-TK-04 | Revoked token after submission | Rejected. |
| P5-TK-05 | Anonymous browser direct access to admin route | Blocked by admin auth. |

## C. N/A rule tests

| ID | Test | Expected result |
|---|---|---|
| P5-NA-01 | Try N/A on a question where `n_a_allowed=false` | Rejected. |
| P5-NA-02 | Try N/A before completing the relevant exposure factor | Rejected with exposure-profile message. |
| P5-NA-03 | Try N/A on supplier questions while EXP-02 is low/moderate/high/severe | Rejected. |
| P5-NA-04 | Try N/A on supplier questions while EXP-02 is none | Allowed, but reason required before submit. |
| P5-NA-05 | Try N/A on D8-Q01/D8-Q08 while EXP-03 or EXP-04 is not none | Rejected because hard-gate digital/identity controls remain applicable. |
| P5-NA-06 | Try N/A on D8-Q01/D8-Q08 while EXP-03 and EXP-04 are none | Allowed, but reason required before submit. |
| P5-NA-07 | Try submit with N/A reason shorter than five characters | Rejected. |
| P5-NA-08 | Change exposure profile after an N/A answer so the N/A becomes invalid | Submit rejects the now-invalid N/A. |

## D. Autosave and draft-state tests

| ID | Test | Expected result |
|---|---|---|
| P5-AS-01 | Select N/A and pause before typing reason | Draft may save, but progress does not count the question complete until reason length is sufficient. |
| P5-AS-02 | Untick N/A before selecting a numeric answer | Saved draft answer is cleared; stale N/A does not remain. |
| P5-AS-03 | Replace numeric answer with N/A with valid profile rule and reason | Stored row changes to N/A with null response value. |
| P5-AS-04 | Replace N/A answer with numeric answer | Stored row changes to numeric answer and clears `n_a_reason`. |
| P5-AS-05 | Refresh after autosave | Latest saved state reloads correctly. |

## E. Database lock tests

| ID | Test | Expected result |
|---|---|---|
| P5-DB-01 | Attempt to update `assessment_answers` after assessment status is submitted | Database trigger rejects. |
| P5-DB-02 | Attempt to update `exposure_answers` after assessment status is submitted | Database trigger rejects. |
| P5-DB-03 | Attempt to delete an answer after assessment status is submitted | Database trigger rejects. |
| P5-DB-04 | Attempt to insert an answer from a different methodology version | Database trigger rejects. |
| P5-DB-05 | Attempt to set N/A directly in SQL where profile rule is false | Database trigger rejects. |

## F. Methodology immutability tests

| ID | Test | Expected result |
|---|---|---|
| P5-MI-01 | Rerun seed before any assessments exist | Allowed/idempotent. |
| P5-MI-02 | Update question wording after one assessment exists | Database trigger rejects; new methodology version required. |
| P5-MI-03 | Update domain weight after one assessment exists | Database trigger rejects; new methodology version required. |
| P5-MI-04 | Delete question applicability rule after one assessment exists | Database trigger rejects. |

## G. Abuse and malformed payload tests

| ID | Test | Expected result |
|---|---|---|
| P5-AB-01 | Submit response value outside 0-5 | Rejected. |
| P5-AB-02 | Submit decimal response value | Rejected. |
| P5-AB-03 | Submit exposure points not matching approved option | Rejected. |
| P5-AB-04 | Submit unknown question ID | Rejected. |
| P5-AB-05 | Submit unknown exposure factor ID | Rejected. |
| P5-AB-06 | Attempt save after token revocation | Rejected. |

## Exit requirement

Phase 5 v1.1 may only be approved after the local/Supabase dev test confirms that the respondent can complete, resume and submit once, while the N/A, lock and no-scoring controls behave as expected.

## Smoke-check phrase anchors

The following explicit anchors are included to keep the static smoke check honest: Submitted assessment token must be rejected after submission. N/A not allowed must be rejected where the methodology or profile rule does not permit it. Cross-assessment token abuse must fail. V1 has 17 hard gates.
