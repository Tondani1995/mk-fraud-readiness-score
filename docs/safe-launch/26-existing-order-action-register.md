# Existing-Order Action Register — Template

**Anonymised template only. No customer-identifying data (order IDs, organisation names, emails,
report contents) appears in this document or is intended to ever be committed to git in this file.**
This register exists to record, per existing `payment_received` order, the classification already
confirmed read-only this session (`24-integrated-a-d-release-candidate-plan.md` §6) and the intended
action an owner/controller decision assigns to it — not to duplicate or store the underlying customer
data itself, which stays in the database where it already lives.

**No worker may claim, generate, or deliver against any of the 18 `payment_received` orders until
every row below has an approved intended action.** This document does not itself approve any action —
it is the record that a future decision fills in.

## How to use this register (for whoever fills it in)

1. Pull the real, current classification immediately before use — do not reuse the counts below past
   the moment they were confirmed; new orders may have arrived, and existing ones may have changed
   state.
2. Reference each real order only by its internal database reference (e.g. `order_reference` or a
   short internal ticket number) in whatever system tracks the actual approval — **not** in this git
   file. This file's own rows use anonymous sequence numbers scoped to this document only.
3. Every row needs: an intended action, an approver, and an approval date/timestamp before it counts
   as "registered" for the purposes of `24-integrated-a-d-release-candidate-plan.md`'s RC
   MIGRATION/DEPLOYMENT GO gate.
4. Do not batch-approve a whole classification group with one signature covering all rows in it
   unless the approver explicitly intends that — the template supports per-row approval because the
   controller's instruction was that *every one of the 18* needs a recorded action, not that the
   three classification groups each need one.

## CURRENT_VERIFIED (2 orders) — protect from regeneration and duplicate delivery

| # | Classification | Intended action | Approver | Approved at | Notes |
|---|---|---|---|---|---|
| 1 | CURRENT_VERIFIED | _TBD_ | _TBD_ | _TBD_ | Must be excluded from every regeneration-claim path before any worker is enabled (see doc 24 §6). |
| 2 | CURRENT_VERIFIED | _TBD_ | _TBD_ | _TBD_ | Same. |

## CURRENT_NOT_STORED (13 orders) — regenerate vs. recover, decided individually

| # | Classification | Intended action | Approver | Approved at | Notes |
|---|---|---|---|---|---|
| 3 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 4 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 5 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 6 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 7 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 8 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 9 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 10 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 11 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 12 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | This order's current report has 3 prior superseded versions — confirm which regeneration attempt, if any, is intended before re-triggering generation. |
| 13 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 14 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |
| 15 | CURRENT_NOT_STORED | _TBD: regenerate / recover-existing_ | _TBD_ | _TBD_ | |

## NO_REPORT (3 orders) — queue only after explicit backlog approval

| # | Classification | Intended action | Approver | Approved at | Notes |
|---|---|---|---|---|---|
| 16 | NO_REPORT | _TBD_ | _TBD_ | _TBD_ | Route through Release A's own backlog-reconciliation classifier/approval flow, not a direct worker queue action. |
| 17 | NO_REPORT | _TBD_ | _TBD_ | _TBD_ | Same. |
| 18 | NO_REPORT | _TBD_ | _TBD_ | _TBD_ | Same. |

## Sign-off

- [ ] All 18 rows have an intended action, approver, and approval timestamp.
- [ ] The 2 `CURRENT_VERIFIED` rows have been independently verified (not just recorded) as excluded
      from every generation-claim code path, per `24-integrated-a-d-release-candidate-plan.md` §6.
- [ ] No `payment_received` order can be claimed and generated twice — verified against
      `claim_payment_report_generation`'s real logic, not assumed.
- [ ] This register was re-pulled against live data immediately before being treated as final, not
      reused from an earlier session.

## Cross-references

- Classification methodology and counts: `24-integrated-a-d-release-candidate-plan.md` §6
- RC MIGRATION/DEPLOYMENT GO gate that requires this register: `24-integrated-a-d-release-candidate-plan.md` §11
