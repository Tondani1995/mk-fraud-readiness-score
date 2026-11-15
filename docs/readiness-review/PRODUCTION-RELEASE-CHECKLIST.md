# Production release checklist: revised Fraud Readiness review (15 November 2026)

Nothing in this document has been done in production. Every step below needs the owner's explicit go-ahead at the time. Production today runs `main` at `74b16d35`, with the scored MFRS assessment.

## What production mode is

The revised review, the paid-report bridge and generation run in production only when **all** of these hold. They are enforced in code (`reviewProductionStatus`) and tested (`production-mode-tests.mjs`, 9 of 9):

1. `MK_READINESS_REVIEW_MODE=production` is set.
2. The runtime is Vercel production (`VERCEL_ENV=production`). Production mode never runs anywhere else.
3. Answers are kept in the database store (`MK_READINESS_REVIEW_STORE=database`), never the file harness.
4. The review store and the application database are the same project.
5. No test setting is present (`MK_READINESS_REVIEW_HARNESS`, `MK_REVISED_COMMERCIAL_PATH`, `MK_READINESS_REVIEW_FAULTS`).
6. In the database, binding needs the flag `readiness_review.environment_flags ('commercial_bridge', 'production')`. No migration sets this flag. The same flag is the only way the database accepts a real (non-fictional) review session.

In production mode a real organisation starts its review by entering its name and accepting the assessment terms. Its links page gives each person a private link and omits the MK reviewer workspace, which is MK's. No page calls the session fictional. MK still needs its own route into the reviewer workspace for Advisory work.

In production mode, reports are customer editions:
- No "RESTRICTED TEST" label and no prototype notices; the footer reads "Prepared for …".
- The length minimum blocks a short manuscript.

The score, coverage rule, ledger, audit package and publication gates are the same as in the restricted test. The Snapshot offers live ordering and states the half-covered rule. The restricted test on the Preview is unchanged.

## Order of release

| Step | What | Reversible? |
|---|---|---|
| 1 | **Merge.** `review/mk-integrated-readiness` into `main` is a fast-forward (123 commits ahead, 0 behind, about 300 files). Review the diff by area first: report pipeline, review store, website switch-over, migrations | Yes, revert the merge |
| 2 | **Production migrations**, in order, on the production project only: `20261111100000_readiness_review_store`, `20261112200000_readiness_review_commercial_bridge`, `20261113090000_readiness_review_owner_decline_action`, `20261113150000_readiness_review_generation_ledger`, `20261114170000_neutral_generation_started_note`, `20261115090000_readiness_review_production_switch`, `20261115100000_readiness_review_method_approved`, `20261115110000_readiness_review_real_sessions` | Additive; the bridge and real sessions stay off until step 4 |
| 3 | **Production AI budget.** Insert one row in `readiness_review.generation_budgets` (campaign name, calls, US$ reservation, approved by). The table is append-only | A new campaign replaces it |
| 4 | **Database switch.** `insert into readiness_review.environment_flags (flag_key, flag_value, set_by) values ('commercial_bridge', 'production', '<owner, date>');` | Yes, delete the row |
| 5 | **Vercel Production variables:** `MK_READINESS_REVIEW_MODE=production`, `MK_READINESS_REVIEW_STORE=database`, `MK_READINESS_REVIEW_DB_URL`, `MK_READINESS_REVIEW_DB_SERVICE_KEY` and `MK_READINESS_REVIEW_DB_PROJECT_REF` (the production project), `MK_READINESS_REVIEW_ENGINE=1.6`, `MK_REVISED_CALL_CAMPAIGN=<step 3>`. **Do not** set `MK_READINESS_REVIEW_HARNESS`, `MK_REVISED_COMMERCIAL_PATH` or `MK_READINESS_REVIEW_FAULTS`, or production mode stays off | Yes |
| 6 | **Switch-over:** `NEXT_PUBLIC_MK_READINESS_TRACK=review` (build-time), then deploy. `/score/start` then leads to the revised review; scored starts and scored orders are refused; earlier results are labelled as the previous method | Yes, unset and redeploy |
| 7 | **Monitors.** The production monitor and the synthetic start check use the scored start, which returns 410 after step 6. Point them at the revised start | Yes |
| 8 | **First live check.** One real or MK-internal assessment through to an operator-generated report, verified as in the staging certification: ledger, checksums, score on the cover, gates and private storage. No email is sent; fulfilment is manual | n/a |

**Rollback.** Unset `NEXT_PUBLIC_MK_READINESS_TRACK` and `MK_READINESS_REVIEW_MODE`, delete the database flag, and redeploy. New customers return to the scored assessment immediately. Data already in the review store stays where it is, append-only.

## Known points to accept or settle before step 6

- **Methodology label.** Resolved (DR-18). The method is approved as `MK-FRAUD-READINESS-1.0`.
- **First drafts.** No writer first draft has passed without a repair. In production the length minimum blocks, so a short draft needs the full repair (about US$0.15 to US$0.20 a report at current prices).
- **Private role links.** Real organisations enter through private role links, with no account (DR-09, accepted risk).
- **Not seen in production.** The admin console does not label previous-method records. Physical-device, screen-reader and native-Excel checks have not been done.
