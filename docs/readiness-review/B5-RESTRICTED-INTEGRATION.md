# B5: the revised assessment in the existing commercial and report infrastructure (restricted test)

Continued from `8b4a8d0` on `review/mk-integrated-readiness`, MK direction of 12–13 November 2026.

## What B5 connects

A completed revised (build 1.6) assessment now reaches the existing paid products without the customer answering again
and without a parallel product:

| Step | What happens | Existing infrastructure used |
|---|---|---|
| 1. Submit for a paid report | The Snapshot's paid-report panel binds the stored answer log, once, to an ordinary `assessments` row (`assessment_mode = 'readiness_review'`) with an organisation, a respondent and a locked, **unscored** `score_runs` row (`REVISED_UNSCORED`, input digest = report input 1.3.0 digest). | `organisations`, `respondents`, `assessments`, `score_runs`, `assessment_tokens` (snapshot token), `audit_logs` |
| 2. Order | Essential (R7 500) or Comprehensive (R35 000) through the unchanged `paid-order` route and price-version contract. | `create_paid_order_with_invoice`, `orders`, `product_price_versions`, EFT snapshot, private order-status page |
| 3. Payment | Manual EFT confirmation in the admin console through the shared payment state machine. | `record_payment_transition`, `payment_transition_events` |
| 4. Generation | `generateManualPhase1Report` claims and starts the attempt as before; an order on a revised assessment takes the revised branch (`src/lib/reports/revised/live/`): replay of the bound log, digest check, Fact Pack, Story Plan, writer brief, one AI manuscript through the configured AI Gateway model, validator, MK publication composer and renderer, and (Comprehensive) the register workbook. | `manual_report_generation_attempts`, generation diagnostics, `report_templates` |
| 5. Storage and finalisation | Same private bucket and path scheme, stored-object verification, and atomic finalisation (`complete_manual_report_generation`; `finalise_manual_report_with_supporting_register` with the workbook). Failures go to the existing cleanup and ambiguous-commit reconciliation. | `generated-reports` bucket, `reports`, supporting register |
| 6. Download | Unchanged customer report access. | `report_access_tokens`, `/score/report/access/[token]` |

The bound answer log is also recorded in `readiness_review.report_runs` for every generation, generated or failed.

## Safety properties

- **No revised score.** The revised method is unapproved (`methodology-dispatch.ts`), so the revised run carries no score, maturity or exposure (enforced by `score_runs_revised_unscored_has_no_score`), and reports state "Score: Not issued" and "Approved readiness conclusion: None issued".
- **Restricted label** on the cover, every footer and the back cover of every revised PDF.
- **Fails closed outside the test environment:** `revisedCommercialStatus()` refuses a production runtime, a missing `MK_REVISED_COMMERCIAL_PATH=restricted-test`, any production database reference and any mismatch between the application database and the review store. The review track itself refuses to start if either database is a production project. The database adds its own switch (`readiness_review.environment_flags`), which no migration sets.
- **Answers fixed at submission:** generation rebuilds the log truncated to the bound position and refuses if either digest differs.
- **One provider call per generation**; a rejected manuscript is never composed and nothing is substituted.
- **MFRS orders unchanged:** the hook returns null for every non-revised assessment.

## Integrity-guard exception (approved by MK, 13 November 2026)

`scripts/spatial-integrity-tests.mjs` protects `src/lib/reports/phase1-manual-fulfilment.ts`. B5 adds one dispatch hook there (about 40 lines, no change to the existing path). MK approved the exception on 13 November 2026; the reviewed version is pinned by SHA-256 in `REVIEWED_PROTECTED_CHANGES` and the guard passes. Any further change to that file fails the guard again.

## Known limitation found during the local run

Order-scoped generation attempts cannot carry structured failure diagnostics: `record_assessment_manual_report_generation_diagnostics` accepts assessment-scoped attempts only, and the service role may not update `manual_report_generation_attempts` (least-privilege contract). The existing Comprehensive branch's direct diagnostics write fails silently for the same reason (pre-existing, post-launch backlog). Revised runs record their safe diagnostics in `readiness_review.report_runs` instead; the attempt row keeps the safe message and error category.

## Restricted deployment

- Database: isolated Supabase project `zuqegvsfhzgcydyivnqv` (mk-review-store-temp, Free plan, owner-approved to 26 November 2026). Full schema replayed from this branch. Skipped deliberately: the two pg_cron jobs that call www.mkfraud.co.za, and the V1.2 response-scale data fix (its graph is absent). No production data.
- Hosting: the `mk-fraud-platform` Vercel project, preview deployment of this branch only, behind Vercel deployment protection (SSO, all deployments except custom domains). No change to production, `main` or the public journey.
- Admin console: the live setup is kept. The console binds to the environment's active `admin_profiles` row; no login, password or MFA is added.

### Branch-scoped Preview variables (Git branch `review/mk-integrated-readiness` only)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zuqegvsfhzgcydyivnqv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the isolated project's anon (publishable) key |
| `SUPABASE_SERVICE_ROLE_KEY` | the isolated project's service-role key (secret, owner enters) |
| `MK_READINESS_REVIEW_DB_URL` | `https://zuqegvsfhzgcydyivnqv.supabase.co` |
| `MK_READINESS_REVIEW_DB_SERVICE_KEY` | the same service-role key (secret, owner enters) |
| `MK_READINESS_REVIEW_DB_PROJECT_REF` | `zuqegvsfhzgcydyivnqv` |
| `MK_READINESS_REVIEW_STORE` | `database` |
| `MK_READINESS_REVIEW_HARNESS` | `fictional-local` |
| `MK_READINESS_REVIEW_ENGINE` | `1.6` |
| `MK_REVISED_COMMERCIAL_PATH` | `restricted-test` |
| `MK_RC1_OPERATION_FREEZE_MODE` | `released` |
| `MK_EMAIL_PROVIDER_MODE` | `disabled` |
| `ASSESSMENT_TOKEN_PEPPER` | a new random value of at least 32 characters (secret, owner enters) |

The AI writer authenticates through Vercel OIDC on the deployment; no AI key is entered.

### Rollback

- Turn off: remove `MK_REVISED_COMMERCIAL_PATH` from the branch variables, or delete the `commercial_bridge` row from `readiness_review.environment_flags`. Either closes binding and revised generation immediately.
- Remove the deployment: delete the branch preview in Vercel; production is not involved.
- Database: the isolated project can be paused or deleted; nothing else references it.

### Manual push (one command per line, run from the candidate directory)

```
git remote add origin https://github.com/Tondani1995/mk-fraud-readiness-score.git
git fetch origin main --depth=1
git push origin refs/heads/review/mk-integrated-readiness:refs/heads/review/mk-integrated-readiness
```

Skip the first line if `git remote -v` already lists `origin`. Never push to `main`.
