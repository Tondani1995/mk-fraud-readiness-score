# Production release checklist: revised Fraud Readiness review (15 November 2026)

**Released, 15 November 2026.** Every step below was done with the owner's go-ahead, and the revised review is live for new customers. The record of what was done is under "Release record" at the end; the steps are kept as written for a future rollback or re-run. Before the release, production ran `main` at `74b16d35` with the scored MFRS assessment.

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
| 2 | **Production migrations**, in order, on the production project only: `20261111100000_readiness_review_store`, `20261112200000_readiness_review_commercial_bridge`, `20261113090000_readiness_review_owner_decline_action`, `20261113150000_readiness_review_generation_ledger`, `20261114170000_neutral_generation_started_note`, `20261115090000_readiness_review_production_switch`, `20261115100000_readiness_review_method_approved`, `20261115110000_readiness_review_real_sessions`, `20261115130000_readiness_review_order_ceiling_15` | Additive; the bridge and real sessions stay off until step 4. **Done 15 November 2026** (the first eight; the ninth with step 3) |
| 3 | **Production AI campaign (DR-15).** One standing, uncapped campaign `mk-production` in `readiness_review.generation_budgets` (no call or cost total); each report is limited to 15 AI calls. The table is append-only | A new campaign replaces it |
| 4 | **Database switch.** `insert into readiness_review.environment_flags (flag_key, flag_value, set_by) values ('commercial_bridge', 'production', '<owner, date>');` | Yes, delete the row |
| 5 | **Vercel Production variables:** `MK_READINESS_REVIEW_MODE=production`, `MK_READINESS_REVIEW_STORE=database`, `MK_READINESS_REVIEW_DB_URL`, `MK_READINESS_REVIEW_DB_SERVICE_KEY` and `MK_READINESS_REVIEW_DB_PROJECT_REF` (the production project), `MK_READINESS_REVIEW_ENGINE=1.6`, `MK_REVISED_CALL_CAMPAIGN=mk-production`. **Do not** set `MK_READINESS_REVIEW_HARNESS`, `MK_REVISED_COMMERCIAL_PATH` or `MK_READINESS_REVIEW_FAULTS`, or production mode stays off | Yes |
| 6 | **Switch-over:** `NEXT_PUBLIC_MK_READINESS_TRACK=review` (build-time), then deploy. `/score/start` then leads to the revised review; scored starts and scored orders are refused; earlier results are labelled as the previous method | Yes, unset and redeploy |
| 7 | **Monitors.** Built: once the switch-over is on, the readiness endpoint adds `/review` and three checks (production mode on, database switch on, AI campaign present; an uncapped campaign passes), all P1. In Checkly, change the synthetic start from `POST /score/api/adaptive/start` to `POST /review/api/sessions`, with the same signed `x-mk-synthetic-monitor-run` header and an expected 201 with `{"ok":true,"synthetic":true}`. It creates a labelled fictional session ("MK synthetic monitor …"), never a real one, and returns no links. The scored start returns 410 after step 6 | Yes, point Checkly back |
| 8 | **First live check.** One real or MK-internal assessment through to an operator-generated report, verified as in the staging certification: ledger, checksums, score on the cover, gates and private storage. No email is sent; fulfilment is manual | n/a |

**Scored start pin: retired** (after the release, 15 November 2026). After the switch-over the scored start refuses every new start (410) before it reads its activation policy, so a deploy no longer needs the `customer_start` pin rebound. The readiness checks `adaptive_activation_exists` and `adaptive_activation_binding` report `scored_start_retired` while the switch-over is effective (test MS-10). Before a switch-over, or after a rollback, the pin applies again as before.

**Rollback.** Unset `NEXT_PUBLIC_MK_READINESS_TRACK` and `MK_READINESS_REVIEW_MODE`, delete the database flag, and redeploy. New customers return to the scored assessment immediately. Data already in the review store stays where it is, append-only.

## Known points to accept or settle before step 6

- **Methodology label.** Resolved (DR-18). The method is approved as `MK-FRAUD-READINESS-1.0`.
- **First drafts.** No writer first draft has passed without a repair. In production the length minimum blocks, so a short draft needs the full repair (about US$0.15 to US$0.20 a report at current prices).
- **Private role links.** Real organisations enter through private role links, with no account (DR-09, accepted risk).
- **Not seen in production.** Physical-device, screen-reader and native-Excel checks have not been done.

## Release record (15 November 2026)

| Step | Done | Evidence |
|---|---|---|
| 1 Merge | PR #83 (`97de3274`) fast-forwarded `main`; follow-ups PR #84 (`c026dee9`: 15 AI calls per report, score-run guard fix) and PR #85 (`d341a36c`: review store accepts the production project in production mode) | Production deployments READY on each commit |
| 2 Migrations | All eight, plus `20261115130000_readiness_review_order_ceiling_15`, applied to the production project | Functions, constraints and triggers match the tested database by checksum. One defect found and fixed before applying: the score-run guard refused runs with no adaptive status (NULL not coalesced) |
| 3 AI campaign | Standing, uncapped campaign `mk-production` (DR-15, revised) | `review_generation_accounting` returns no call or cost totals |
| 4 Database switch | `environment_flags ('commercial_bridge','production')`, set by "MK owner, 15 November 2026 (release step 4)" | `review_commercial_bridge_enabled()` is true |
| 5 Vercel variables | Set by the owner. Two values needed correcting: the review database address must be the full `https://` project URL, and the service key must be the production project's key (the first value was the isolated test database's key) | Supabase edge logs showed 401 `UNAUTHORIZED_INVALID_API_KEY` until corrected |
| 8 Live check (run before 6) | MK-internal review through `/review`: assessment `MKFRS-2026-RV873FDA9F`, Essential order `MKORD-2026-1D43D751`, report `RPT-MKFRS-2026-RV873FDA9F-V1` | 16/16 journey steps; 2 AI calls, US$0.045; validated customer edition; score 32% on the cover; private bucket, storage verified; checksum of the downloaded PDF matches |
| 6 Switch-over | `NEXT_PUBLIC_MK_READINESS_TRACK=review`, redeployed | `/score/start` redirects to `/review`; both scored start routes return 410; storefront shows the review copy |
| 7 Monitors | Checkly "Customer Journey" now opens `/score/start`, expects `/review`, then makes the signed `POST /review/api/sessions` (201, `ok` and `synthetic` true) | Test run passed and created one fictional "MK synthetic monitor" session; "Signed Readiness" passed after the switch-over |

The previous-method label on earlier scored results was not seen on a live page (the only valid earlier result link belongs to a customer); it rests on tests SW-02 and SW-07, as the owner accepted. The isolated test database (`zuqegvsfhzgcydyivnqv`, "mk-review-store-temp") was paused after the release; the restricted test on Preview needs it restored before it can run again.
