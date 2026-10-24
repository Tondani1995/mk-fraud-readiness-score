# Staging verification gate — 24 October 2026

Status: **BLOCKED / NOT EXECUTED against a real application.** Local fixtures, pure engine tests and a browser transport double do not establish database persistence, payment settlement, report generation or delivery.

## Entry conditions

Use a disposable, explicitly isolated **preview** application. Obtain its exact base URL, deployment commit, Supabase project ref, graph/methodology identity and activation-policy record. Match `VERCEL_GIT_COMMIT_SHA` to the approved preview activation SHA; do not alter shared activation policies to make a test pass. No production host, production records or production configuration changes are permitted.

The connector exposes healthy project `iszihmmbgsfefawqmnwo` (`mk-fraud-readiness-preview-staging`). Read-only metadata shows published V1.1 and V1.2 candidate graphs and enabled customer-start policies for both preview and production environments in that project. That does **not** establish safe isolation. The checkout has no `.env.local`, application Supabase credentials or token pepper. No bound staging deployment or authenticated admin session was supplied. Credentials were not copied from another checkout or created.

Require operator evidence of all these controls before executing any write:

- Disposable synthetic organisation and respondent, using `example.test` addresses. Record the synthetic marker/run ID. Use the existing signed synthetic monitor mechanism where appropriate; never print its secret, resume token or result token in shared evidence.
- Every payment path disabled or an explicitly permitted non-chargeable double/sandbox. The adapter in this source recognises **`PAYMENT_PROVIDER_MODE=double`**, otherwise disabled. This is not a claim that a live provider sandbox is integrated. Do not transfer EFT funds, submit real bank details or mark a real order paid.
- Email and notification egress blocked, including worker and legacy transport paths. **`MK_EMAIL_PROVIDER_MODE=test` can call real Resend and is not sufficient isolation.** Use disabled mode plus evidence of transport/egress controls; later delivery checks must use a permitted local sink, with no customer communications.
- AI/report generation egress blocked or routed to an approved non-chargeable test service. Snapshot fallback can be tested with unavailable credentials; an OIDC-enabled Vercel deployment may still reach an AI Gateway. A missing API key alone does not prove zero cost.
- Buckets, worker queue, callback URLs, scheduled jobs and administrative payment verification bound to this disposable environment. Preserve payment-before-generation and private-delivery gates.
- Reconcile candidate graph uncertainty metadata with the executable engine. `uncertaintyOption.excludedFromDenominatorRule` says `never`, while the existing calculator excludes unknown numeric responses from score denominators and measures them separately. This iteration preserves the calculator. Methodology ownership must resolve/document the discrepancy before release; do not silently change scores.

## Execution matrix

Run in order. All rows currently need real staging evidence. The local column is supporting evidence only.

| ID | Procedure on the isolated preview | Required assertions and retained evidence | Local supporting evidence |
|---|---|---|---|
| identity | Inspect deployment metadata and preview activation record; compare app URL, project, exact SHA, graph fingerprint and methodology ID. Inspect provider and worker configuration without exposing secrets. | Redacted deployment/config export; isolation confirmation; approved graph identity; zero external dispatch/charge evidence. | Read-only staging metadata; runtime activation checks inspected. |
| creation | Open `/score/start`; read the current terms and privacy notice; accept only for the synthetic test organisation. Start with research consent off. Repeat with missing acceptance and invalid email. | One draft assessment and hashed resume token; terms/privacy versions and server timestamps; consent false retained; invalid requests create no rows. Record reference and redacted HTTP status. | Consent, launch, security and engine suites. |
| branching | Answer gateways for internal functions, then repeat/change a relevant gateway to outsourced/not applicable. Save at least one affected control first. Cancel the scope-change dialog, then confirm it. | Expected active/excluded/redirected questions; explicit confirmation; invalidated answer history retained; no out-of-scope answer contributes to score. Persist graph identity. | G25/G27 graph tests; local modal focus/escape check. |
| save-resume | Save several responses including 0 and unknown. Close the tab; open the private resume link in a fresh browser context. Simulate one failed save, retry, then two-tab stale sequence conflict. | Same saved answers/scope/sequence after reload; failed save not reported as saved; retry once; stale write rejected; current saved version visibly restored. Redact tokens in HAR. | In-memory progression, retained selection, offline retry and conflict checks. |
| completion | Complete the actual resolved path, review, edit and resubmit. Try missing applicable answer, duplicate submission and a stale save sequence. | Incomplete/conflicting submit rejected; one locked initial score run; idempotent duplicate completion; domain/aggregate totals reconcile; final saved answer included; private Snapshot URL returned. | G27 scoring and reconciliation cases; submission/security contracts. |
| private-result | Open the returned Snapshot in a fresh context. Test missing, altered, expired and wrong-assessment tokens; check caching and referrer behaviour. | Valid token opens correct locked run; every invalid case denied without leaking organisation/result; no private query strings in analytics or logs. Inspect `Cache-Control`, `Referrer-Policy`, network requests and screenshots. | Token, URL privacy and security suites. |
| essential-order | From that Snapshot choose Essential; test invoice yes/no, required fields, invalid email, back and refresh; double-click confirmation. | Exactly one correctly bound order at catalogue price **R7,500 incl. VAT**, correct entitlements, invoice details and idempotency; token never substituted with another assessment. No paid-tier recommendation badge. | Product contract, structure and conversion suites; 320px billing inspection. |
| comprehensive-order | Repeat with Comprehensive and optional PO/VAT fields, using a new disposable order only. | Catalogue price **R35,000 incl. VAT**, correct deliverable scope and immutable price version; no report release while unpaid. | Catalogue/product contract tests; transaction code unchanged. |
| payment-negative | With the permitted double, exercise pending, processing, failed/cancelled and invalid/duplicate/out-of-order callback events; wrong amount/currency/order binding. | No false paid transition; verification rejection recorded; duplicate event idempotent; no report job or delivery when unpaid. Retain redacted transition/event IDs. | Existing payment/security contract tests; synthetic payment-state library. |
| payment-confirmation | Confirm only a **disposable** order using the supported authorised test path/double; verify provider/manual authority and evidence checks. | One verified transition; amount/currency/actor/evidence validated; one fulfilment request; replay causes no duplicate fulfilment. No real funds moved. | Transaction safety logic preserved; staging not executed. |
| report-generation | On a verified disposable order, use the supported worker/admin path with approved non-chargeable generation. Exercise both tiers, missing data and provider failure. | Job identity bound to order/run/methodology; generated content reconciles to deterministic findings; PDF opens; Comprehensive XLSX present; stored byte hashes match downloads; failures retry without duplicate release; no unpaid generation. | Local engine/contract tests only; no claim of staging artefact generation. |
| private-delivery | With external egress blocked, send through the approved local sink/test transport. Open private download links, then test expired/revoked/wrong-order tokens and recipient correction. | Sink receipt and audit event; correct recipient and artefacts; unauthorised access denied; no public bucket objects or public report URL; exactly-once/idempotent notification evidence. **Test mode alone is not proof of no email.** | Secure delivery must still be verified on bound staging infrastructure. |
| recovery | Interrupt worker/generation/delivery, restart and use supported retry/recover controls; refresh a completed assessment. | Durable state survives interruption; no duplicate report/payment/notification; visible next action and audit evidence; same private result after resume. | Local UI recovery only; durable backend recovery outstanding. |
| mobile-assistive | Repeat assessment, Snapshot and both invoice branches at 320/375px and a real mobile device with software keyboard. Test VoiceOver/TalkBack, 200–400% zoom, focus, menu/dialog, sticky actions and long responses. | No obscured focus or field/action; logical spoken labels/order; progression announced/informed; reduced motion; evidence of browser/device/AT versions and screenshots. | 24 rendered axe/layout scans plus manual desktop-browser mobile-width checks; no AT certification. |

## Runnable requests / evidence capture

The UI is the primary execution path; these requests make the API checks reproducible. Run **only after the entry conditions are evidenced**. Keep tokens and response bodies in a private temporary directory; shared evidence must be redacted. Use the actual preview URL in `$MK_STAGING_BASE_URL`, never a production URL.

1. `POST /score/api/adaptive/start`, JSON: `fullName`, `email`, `organisationName`, `consentPrivacy:true`, `consentResearch:false`, and `legalAcceptance:{termsVersion:"FRA-TERMS-2026.1",privacyNoticeVersion:"MKFI-PRIVACY-2026.1"}`. Check current versions in source before execution. Expect 201 and `data.assessmentReference`, `data.resumeUrl`. The normal terms workflow must establish authorisation for the synthetic organisation.
2. `GET /score/api/adaptive/{reference}/state?token={resumeToken}`. Retain navigation `save_sequence`, gateway/control answers and resolved path privately. Reopen in a fresh context to test persistence.
3. `POST` the same state endpoint with `{token,expectedSaveSequence,currentScreen,currentQuestionId,visitedQuestionIds,gatewayAnswers,controlResponses,confirmGatewayChange:false}`. Change **one answer per request**; use the returned state/sequence for the next write. Repeat a stale sequence and assert 409. When the server returns `gateway_change_confirmation_required`, cancel or explicitly repeat with `confirmGatewayChange:true` and compare retained history.
4. `POST /score/api/adaptive/{reference}/submit` with `{token,expectedSaveSequence}` after the resolved path is complete. This invokes scoring and downstream completion handling: do not run without communication/generation isolation. Verify the returned `snapshotUrl`, `scoreRunId` and result metrics against locked DB rows, then test invalid-token access in a fresh context.
5. Use the actual order, payment and administrative report UI for the remaining rows. Record its redacted request/response, DB transition and storage/delivery evidence. Do not call legacy destructive integration scripts against this remote project. In particular, the real-journey script's disposable-Postgres setup is not a remote staging runner.

## Executable evidence gate

From the repository, run the local evidence suite and then the read-only release evidence checker:

```sh
npm run g25:test-adaptive-engine
npm run g27:test-adaptive-scoring
npm run g27:test-adaptive-correction
node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/snapshot-management-tests.mjs
node scripts/staging-product-gate.mjs /absolute/path/to/staging-evidence.json
```

Copy `docs/product-refinement/staging-evidence.example.json` to a private evidence folder. For **each matrix ID**, add an object under `cases` with `status:"pass"`, the exact `deploymentSha`, a concrete `observation`, and non-empty `evidenceFiles` paths relative to that manifest. Populate all entry-condition fields with supporting exports. The checker returns **exit 2** for incomplete evidence and **exit 0** only when all listed evidence exists and identities match. It does not perform the tests, inspect evidence content or certify production safety; a reviewer must examine the files. Never store credentials/private URLs in the published manifest.

This run intentionally returned exit 2. No real assessments, orders, payments, report jobs, delivery attempts, activation edits or deployments were made.
