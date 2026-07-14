# Phase 14 Funded AI Gateway Runtime UAT

> Superseded for merge-readiness purposes on 14 July 2026. The live-provider observations below remain historical evidence only and do not establish the remediated code's readiness. Use `adversarial-remediation-2026-07-14.md` for the current position. No additional paid AI or real email was invoked during remediation.

## Result

**Pass for the Phase 14 AI narrative, repair, deterministic fallback, live Resend send, idempotent resend reconciliation, signed webhook and final clean-preview gates on isolated non-production infrastructure.**

The UAT used Vercel AI Gateway credits purchased on 14 July 2026, the isolated Supabase branch `phase14-uat` / `nlukprffbrqmvjcmygyr`, assessment `MKFRS-2026-5C01B4F1EE`, score run `8540d731-afe9-444b-8850-c59060381677`, and the paid R5,000 `essential_self_assessment` entitlement only.

No production data was changed. Automatic fulfilment, automatic AI narrative, automatic email delivery, the test-recipient override and R50,000 engagement automation remained disabled.

## Live funded provider result

The first live call used `openai/gpt-5.5` through Vercel AI Gateway.

- First-pass token usage: 2,656 input, 2,239 output, 4,895 total.
- First-pass latency: 51,689 ms.
- The provider returned the complete structured narrative schema and grounded its narrative in the deterministic evidence pack.
- The only original validation issue was `overall_maturity_contradiction`.
- The output correctly described the organisation as **Structured overall** and separately described three domains as **Strategic**.
- The original validator treated any maturity-band word in the executive diagnosis as an overall maturity claim and therefore produced a false positive.

The stored live output was replayed through the corrected overall-versus-domain validation logic. The corrected logic detected **Structured** as the only contextual overall maturity, matched the deterministic final result, and passed. No other original validation issue existed.

The initial live run also proved the automatic repair path:

- Repair-call token usage: 4,430 input, 1,960 output, 6,390 total.
- Repair-call latency: 26,195 ms.
- Repair validation passed.
- Report generated: `RPT-MKFRS-2026-5C01B4F1EE-V5`.

## Controlled repair scenario

A controller-injected invalid first pass was used to prove that malformed, unsupported and incomplete content cannot proceed directly to the report.

- Invalid first pass was rejected before provider token use.
- Live repair-call token usage: 6,017 total.
- Repair validation passed.
- Generation mode: `ai_repair`.
- Report generated: `RPT-MKFRS-2026-5C01B4F1EE-V6`.

## Controlled provider-failure scenario

A controller-injected provider failure was used to prove continuity when the AI provider is unavailable.

- Both provider attempts failed by design.
- The report engine used the deterministic narrative fallback.
- Generation mode: `deterministic_fallback`.
- Report generated: `RPT-MKFRS-2026-5C01B4F1EE-V7`.

## Deterministic authority and release boundary

The locked score run remained:

- overall score: `75.90`;
- calculated and final maturity: `Structured`;
- exposure score: `59.50`;
- exposure band: `High`;
- coverage: `100.00%`;
- critical gaps: `1`;
- scoring input hash: `ef9a4b4aeca3496a6525cbfef6ffcc936b849dcb7df1a22e42748f5acd584d18`.

The AI layer did not calculate or modify the readiness score, final maturity, exposure result, domain scores, critical gaps, hard-gate outcome or score input hash. These remained sourced from the locked score run.

All generated PDFs were stored in the private `generated-reports` bucket. V7 was released only after the controlled normal-recipient email send was accepted by Resend.

## Live V7 email delivery UAT

Deployment `dpl_3RvMHqyoL37y9kSXSUaLSNLVVfvG` at commit `2189ecd374e9d8de5976f8b9d7409a01c50f8b55` was verified READY and used for the live V7 send gate.

- Route: `POST /score/api/admin/reports/66216b58-2e45-44e0-afe8-0d02f808dd7d/send-email`.
- Result: HTTP `200`.
- Email event: `aadabe2c-edeb-48e0-af1c-a17c47e330c9`.
- Recipient: `admin@mkfraud.co.za`.
- Recipient override: `false`.
- Test delivery: `false`.
- Provider message ID: present.
- Cumulative attempt number: `3`, reflecting two previous pre-provider/configuration failures and one successful provider-accepted send.
- Report `RPT-MKFRS-2026-5C01B4F1EE-V7` status changed to `released`.
- Fulfilment `af3bd626-32ed-457e-a01c-09a1615d3d42` completed at `email_sent`.
- `premium_report_auto_fulfilment_enabled=false`.
- `premium_report_ai_narrative_enabled=false`.
- `premium_report_auto_email_enabled=false`.
- `r50000_automation_enabled=false`.
- `premium_report_test_recipient_override=null`.

A repeated non-force request returned HTTP `200` with `reusedExistingSend=true`, reused email event `aadabe2c-edeb-48e0-af1c-a17c47e330c9`, and kept the database at exactly one email event and one provider message for V7. This proves provider-accepted messages are reconciled and not blindly resent.

Manual inbox receipt and PDF-open confirmation were not independently performed by Codex in this pass. The database and provider-acceptance evidence prove dispatch acceptance and attachment checksum integrity, but not human inbox observation.

## Signed webhook UAT

Because the Vercel preview is protected, webhook UAT used a temporary preview-only internal harness deployed at commit `805ae4a7ba5196bfa89d0cda3affde8258879dcb` on deployment `dpl_PS3HRZjMmzrGKC1hXuRAkWpxrcVB`. The harness read the deployed `RESEND_WEBHOOK_SECRET` inside the runtime, never returned or logged the secret, generated controlled Svix-compatible signatures, invoked the existing Resend webhook handler, returned only non-secret status evidence, and was removed after evidence capture.

Run ID: `phase14-webhook-uat-1784045410496`.

Verified cases:

- Missing signature rejected with HTTP `400` / `invalid_webhook`.
- Invalid signature rejected with HTTP `400` / `invalid_webhook`.
- Stale timestamp rejected with HTTP `400` / `invalid_webhook`.
- Valid `email.delivered` for the real V7 provider message accepted with HTTP `200`, `status=delivered`, `stateUpdated=true`.
- Repeated identical delivered event returned HTTP `200`, `duplicate=true`.
- Older valid `email.sent` for the same message was accepted as a provider event but did not regress current state: `stateUpdated=false`, `staleEvent=true`, `terminalRegression=true`.
- Unknown provider message returned HTTP `200`, `ignored=true`, `reason=unknown_message`.
- Synthetic isolated bounce fixture transitioned to `bounced` with `phase14_uat_synthetic_bounce`.
- Synthetic isolated complaint fixture transitioned to `complained` with `phase14_uat_synthetic_complaint`.
- Unrelated synthetic fixture remained `sent`.
- Delivered provider event ID count remained `1`.
- Synthetic email fixtures deleted: `3`.
- Synthetic provider-event fixtures deleted: `2`.

Final UAT database evidence after cleanup:

- V7 email event status: `delivered`.
- V7 provider event ID: `phase14-webhook-uat-1784045410496-delivered`.
- V7 delivered timestamp: present.
- V7 last provider event type: `email.delivered`.
- V7 provider events retained: `email.delivered` and older `email.sent`, both processed without processing errors.
- Synthetic fixture remaining count: `0`.
- Synthetic provider fixture remaining count: `0`.
- Report checksum: `4fcfe873eef1e93d0969bbd12f76f218689363775e42f07bf7b566793fc3f442`.
- Stored PDF checksum matched the report checksum.
- Email metadata attachment checksum matched the report checksum.
- Stored attachment byte length was positive.

## Validation defect repaired

`validatePremiumReportNarrative` now distinguishes contextual overall maturity statements from legitimate domain-level maturity references. Regression coverage confirms that:

- “The organisation remains Developing overall, while Operations demonstrates Structured domain maturity” is valid where the evidence supports both statements.
- “The organisation is Strategic overall” is rejected where the deterministic final maturity is Developing.

## Cleanup and isolation proof

After the tests:

- `premium_report_auto_fulfilment_enabled=false`
- `premium_report_ai_narrative_enabled=false`
- `premium_report_auto_email_enabled=false`
- `r50000_automation_enabled=false`
- `premium_report_test_recipient_override=null`
- the temporary UAT admin auth user was soft-deleted and permanently banned;
- the temporary UAT admin profile was revoked;
- temporary synthetic webhook fixtures were removed after evidence capture;
- no fulfilment remained queued, assembling, generating, validating, rendering or storing;
- temporary UAT routes, the temporary post-build runner, the temporary GitHub workflow and obsolete preview-auth artefact were removed before final clean verification;
- production contained zero matching UAT assessments, orders, reports or temporary UAT admin records, and all production Phase 14 flags remained off.

## Final clean verification

Final clean commit `5b8c3cd878add5b264ba4cfeee6d8e523419d298` removed the temporary webhook UAT harness.

- GitHub source lookup for `src/app/api/internal/phase14-webhook-uat/route.ts` at that commit returned `404`.
- GitHub Actions `V1 Verification` run `29348727938` / run number `924`: success.
- GitHub Actions `Supabase Migration Replay` run `29348728686` / run number `114`: success.
- Vercel deployment `dpl_4qJNJh1rRdWwyz5obpUUH9E3Suob`: READY.
- Deployment URL: `https://mk-fraud-readiness-score-d9kycvwo1-tondanis-projects.vercel.app`.
- Deployment metadata commit: `5b8c3cd878add5b264ba4cfeee6d8e523419d298`.
- Deployment metadata branch: `phase14/autonomous-premium-report-engine`.
- Health route `/score/api/health`: HTTP `200`, phase `phase-14-autonomous-premium-report-engine`.

A direct request to the removed internal route could not be used as app-level `404` proof because Vercel protected-preview SSO intercepted the request before app routing. The merge-state proof is the exact deployment metadata plus the GitHub `404` for the removed route file at the deployed commit.

## Remaining Phase 14 gate

The AI, deterministic fallback, live email acceptance, idempotent non-force resend, signed webhook and final clean-preview gates are closed on isolated UAT infrastructure.

PR #21 remains draft and unmerged until an independent review-only session inspects the final diff and evidence. Do not mark the PR merge-ready in this session.
