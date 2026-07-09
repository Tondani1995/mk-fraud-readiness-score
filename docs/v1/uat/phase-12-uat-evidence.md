# Phase 12 UAT Evidence

Date: 2026-07-09

Environment: production Vercel deployment used as staging/UAT target

Production URL: https://mk-fraud-readiness-score-h5oh6t0e2-tondanis-projects.vercel.app

Deployment: `dpl_AUcTiHTs3LSdGohWNv9uxAvB7Rw8`

Verified deployed commit: `040b725b9a5b3b6885d9f1de4a4a53f24c604c25`

Result: PASS WITH CONDITIONS

## Source and Deployment

- GitHub `main` latest commit was confirmed as `040b725b9a5b3b6885d9f1de4a4a53f24c604c25`.
- Vercel deployment `dpl_AUcTiHTs3LSdGohWNv9uxAvB7Rw8` was confirmed READY, production target, branch `main`, and commit `040b725b9a5b3b6885d9f1de4a4a53f24c604c25`.
- `/score/start` returned HTTP 200 through the production deployment.

## Brand and Customer-Facing Review

Brand reference checked against MK Fraud Insights public positioning: practical fraud capability, operational reality, structured methodology, and South African fraud-risk advisory.

Observed product fit:

- Tone is mostly practical, operational and advisory rather than compliance-only.
- Visual language uses restrained dark navy/charcoal, paper background and premium spacing.
- The start journey clearly explains accountless assessment, free snapshot and detailed report next step.
- The first viewport does not show a strong MK logo/brand mark, so brand confidence is good but not yet excellent.

Scores:

- Brand alignment: 8.0/10
- Premium feel: 8.0/10
- Visual consistency: 8.0/10
- Trust/suitability for non-financial-sector leaders: 8.2/10

Condition: before public launch, add stronger MK branding/logo treatment and polish the first-viewport trust cues. This is not a runtime blocker.

## Mobile and Responsive Checks

Screenshots captured locally for:

- iPhone SE: `/tmp/mk-phase12-uat-evidence/phase12-start-iphone-se.png`
- iPhone 14: `/tmp/mk-phase12-uat-evidence/phase12-start-iphone-14.png`
- Android medium: `/tmp/mk-phase12-uat-evidence/phase12-start-android-medium.png`
- Tablet: `/tmp/mk-phase12-uat-evidence/phase12-start-tablet.png`
- Desktop: `/tmp/mk-phase12-uat-evidence/phase12-start-desktop.png`

Result:

- No horizontal overflow detected across checked widths.
- Start form remains usable on mobile.
- Content stacks correctly.
- The mobile page is long but coherent.

## Launch Happy Path

Fresh launch UAT assessment:

- Organisation: `MK Phase12 Launch UAT 20260709205410`
- Assessment reference: `MKFRS-2026-4116823B06`
- Order reference: `MKORD-2026-EBPPMK0O`

Observed:

- Assessment started at `/score/start`.
- Exposure profile completed.
- All 68 questions completed.
- Assessment submitted.
- Free snapshot rendered.
- Detailed report request created one manual EFT order.
- Duplicate detailed-report request was reused/blocked; one order remained for the assessment.
- Manual EFT confirmation showed expected FNB / MK Fraud Insights details during the journey.

Persisted score evidence:

- Overall score: 49.02
- Exposure score: 50.00
- Exposure band: Moderate
- Maturity: Developing
- Coverage: 100.00
- N/A rate: 0.00
- Critical gaps: 12

## Scenario Matrix

Completed through public production flow and reconciled against persisted score rows:

| Scenario | Assessment | Overall | Exposure | Exposure band | Maturity | Critical gaps | Report |
|---|---:|---:|---:|---|---|---:|---|
| Launch UAT | `MKFRS-2026-4116823B06` | 49.02 | 50.00 | Moderate | Developing | 12 | generated |
| A Low maturity / high exposure | `MKFRS-2026-FC1918E4EB` | 20.00 | 100.00 | Severe | Reactive | 19 | generated |
| B Medium maturity / medium exposure | `MKFRS-2026-736F409DD0` | 49.02 | 50.00 | Moderate | Developing | 12 | generated |
| C High maturity / high exposure | `MKFRS-2026-4E221AC53F` | 100.00 | 100.00 | Severe | Strategic | 0 | generated |
| D High maturity / low exposure | `MKFRS-2026-BE6FAF3EC4` | 100.00 | 25.00 | Low | Strategic | 0 | generated |
| E Low maturity / low exposure | `MKFRS-2026-F06B714C28` | 20.00 | 25.00 | Low | Reactive | 19 | generated |
| F Domain-skewed weakness | `MKFRS-2026-CFE248E6CC` | 51.20 | 50.00 | Moderate | Developing | 4 | generated |
| G Procurement/vendor weakness | `MKFRS-2026-1D45C9FAE2` | 55.20 | 57.50 | High | Developing | 2 | generated |
| H Internal fraud/staff weakness | `MKFRS-2026-3CFDF9C41C` | 52.00 | 50.00 | Moderate | Developing | 3 | generated |
| I Digital/customer scam weakness | `MKFRS-2026-5BAB9043DE` | 55.20 | 66.00 | High | Developing | 4 | generated |

Scenario J incident-response weakness was started as `MKFRS-2026-A1A9A30AC7`, but public start-rate limiting interrupted the run. It remained draft with no order and no report. Condition: rerun Scenario J after the rate-limit window or in an approved staging environment.

## Orders, Payment and Report Generation

Launch order:

- Before payment: `awaiting_payment`
- Direct authenticated unpaid POST to report generation endpoint: HTTP 409, controlled `order_not_eligible` response.
- After admin payment mark: `payment_received`
- Report ID: `e1194182-3101-4895-ae64-01979690d683`
- Persisted report reference: `RPT-MKFRS-2026-4116823B06-V1`
- Report status: `generated`
- Released at: null
- Storage bucket: `generated-reports`
- Storage path: `MKFRS-2026-4116823B06/RPT-MKFRS-2026-4116823B06-V1.pdf`
- Storage object count: 1
- Order events: `order_created_from_report_request`, `admin_status_updated`
- Report events: `generated`, `download_requested`
- Audit log count for launch record set: 12

Result: payment marking and generation worked; generated reports were not released automatically.

## PDF Quality

Downloaded launch PDF locally:

- Path: `/tmp/mk-phase12-uat-evidence/phase12-MKFRS-2026-4116823B06.pdf`
- Valid PDF magic: yes
- Pages: 23
- Organisation name present: yes
- Executive diagnosis present: yes
- Recommendations present: yes
- Generated date present: yes
- Report reference present: yes

Extracted text scan did not find scaffold/internal terms including `EXP-`, `D1-Q`, `D10-Q`, `undefined`, `NaN`, `null`, `Phase 10`, `Phase 11`, `Phase 12`, `benchmark`, or `AI-generated`.

Condition: PDF cover displays `RPT-MKFRS-2026-4116823B06`, while the persisted reference includes `-V1`. Align display with the persisted report reference before public launch or document the display-shortening rule.

## Public and Security Negative Checks

Public/visitor checks:

- `/score/assessment/MKFRS-2026-4116823B06/result`: HTTP 200 controlled page requiring private snapshot link.
- `/score/snapshot/MKFRS-2026-4116823B06`: HTTP 200 controlled page with `missing_token` explanation.
- POST `/score/api/assessments/MKFRS-2026-4116823B06/report-request` with no token: HTTP 403 JSON error.
- POST same endpoint with fake token: HTTP 403 JSON error.
- Order count for launch assessment remained 1 after negative checks.
- Logged-out admin report download route: HTTP 403 JSON forbidden.
- Direct unsigned storage/object URL checks: HTTP 400, no PDF returned.

Logged-out admin page checks:

- `/score/admin`
- `/score/admin/orders`
- `/score/admin/orders/MKORD-2026-EBPPMK0O`
- `/score/admin/reports`
- `/score/admin/audit-log`
- `/score/admin/config/content`
- `/score/admin/config/products`
- `/score/admin/config/questions`

All redirected/rendered the admin login screen for a non-admin visitor.

Authenticated admin page smoke:

- `/score/admin`: loaded control room.
- `/score/admin/orders`: loaded order controls.
- `/score/admin/orders/MKORD-2026-EBPPMK0O`: loaded order detail.
- `/score/admin/reports`: loaded generated report versions.
- `/score/admin/audit-log`: loaded audit log.
- `/score/admin/config/content`: loaded report content blocks.
- `/score/admin/config/products`: loaded products, pricing and EFT inputs.
- `/score/admin/config/questions`: loaded question and scoring configuration.

Admin password was manually entered by the user. It was not stored, printed or logged.

## Question and Content Review

Live MFRS-V1.1 question copy was sampled from production. The question set is practical, operational and mostly sector-neutral.

Weakest polish areas:

1. Digital monitoring appears in more than one place and may feel repetitive.
2. Change-management fraud-risk review appears in both risk identification and continuous improvement.
3. Several prompts are long for mobile and could be shortened without losing scoring intent.
4. Some phrases such as `where relevant` appear often and may soften respondent confidence.
5. Internal admin pages still include phase labels in headings; these are not respondent-facing but should be polished for operator confidence.

No respondent-facing backend codes or scaffold labels were observed in the start page, controlled negative pages or downloaded report text.

## Runtime Logs

Vercel runtime checks for the production deployment over the UAT window:

- Runtime error clusters: none found.
- Error/fatal runtime logs: none found.
- Status-code grouping: 200, 307, 201, 403, 400, 409, 429.
- No 5xx status codes observed.
- One 429 corresponded to the high-volume public scenario run rate limit.

## Remaining Conditions

1. Complete Scenario J incident-response weakness after the rate-limit window or in approved staging.
2. Add stronger first-viewport MK brand/logo treatment before public launch.
3. Align the PDF cover reference with the persisted report reference or document the display-shortening rule.
4. Consider a small copy polish pass for repeated digital/change-management prompts and long mobile prompts.
5. Consider removing internal `Phase 8` labels from admin operator screens before non-technical users rely on them.

## Recommendation

PASS WITH CONDITIONS — focused polish PR required before broad public launch. The application is suitable to proceed into controlled pilot/UAT review, but the remaining conditions should be closed before a public launch decision.
