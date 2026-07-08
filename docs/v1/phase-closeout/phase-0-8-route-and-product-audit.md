# Phase 0-8 Route and Product Closeout Audit

Date: 2026-07-08  
Branch: `v1/phase0-8-closeout`  
Scope: Product, route, UX, copy, access and no-go boundary review before Phase 9.

## Review Standard

Each surface was reviewed against the same five gates:

1. Technical functionality: the route or component can work under the deployed `/score` base path.
2. Data correctness and traceability: values come from persisted assessment, score, methodology or audit records rather than unsupported display-only placeholders.
3. Access and security posture: respondent, admin and private-token surfaces are kept separate.
4. MK Fraud language: the page reads like a professional MK Fraud product/control surface, not a temporary scaffold.
5. Sequencing and professionalism: the page makes sense to its intended user and does not expose Phase 9/10 functionality prematurely.

The review was deliberately repeated as a closeout loop rather than a single scan. The recurring failure pattern found was hard-coded root paths such as `/api/...` or raw form actions that bypass the Next.js `/score` base path.

## Executive Result

Phase 0-8 is not blocked by the scoring engine anymore. The main product risk found in this pass was route-level production behaviour: several browser-driven actions were still pointing at the domain root rather than the `/score` mounted application. Direct API smoke tests passed because they hit the right URLs manually, but the respondent UI could still fail.

The closeout branch fixes the known base-path issues and documents the remaining items that must not be confused with Phase 9 readiness.

## Route-by-Route Findings

| Surface | Gate result | What was fixed | Remaining notes |
| --- | --- | --- | --- |
| `/score/start` | Fixed in this branch | `StartAssessmentForm` now posts to `/score/api/assessments/start` through `scorePath`. Start-page copy was tightened from generic self-health-check wording to fraud-readiness language. | Needs one post-deploy browser start test to confirm the form creates an assessment from the UI, not only via direct API. |
| `/score/assessment/[assessmentRef]` | Fixed in this branch | `AssessmentEngine` autosave and submit now post through `/score/api/assessments/[ref]/answers` and `/score/api/assessments/[ref]/submit`. | Needs one post-deploy full browser journey after merge. The engine still uses a long single-page domain sequence; no structural redesign done in this closeout branch. |
| `/score/snapshot/[assessmentRef]` | Previously passed | Phase 7 production smoke proved rendering, refresh idempotency, score reconciliation and revoked-resume behaviour. | Snapshot copy is acceptable, but the detailed-report CTA is only an interest capture. It is not the Phase 9 payment/report workflow. |
| Free snapshot report-interest button | Fixed in this branch | `FreeSnapshot` now posts to `/score/api/assessments/[ref]/report-request`. | The button should submit interest only. It must not unlock reports or represent payment verification until Phase 9/10. |
| `/score/admin/login` | Previously fixed and proven | PR #6 fixed login base path; production login was confirmed by the user. | Rotate the shared admin password because it was pasted into chat history. |
| `/score/admin` | Improved in PR #7 | Admin dashboard was reworded and rebranded as the MK Fraud Readiness internal review control room. | Confirm post-deploy look/feel after PR #7 and this closeout branch deploy. |
| `/score/admin/assessments` | Fixed in this branch | The filter form now submits to `/score/admin/assessments`; queue copy was already polished in PR #7. | Needs post-deploy browser check that filtering does not leave the `/score` mount. |
| `/score/admin/assessments/[assessmentRef]` | Functional; still needs visual QA | Admin detail page loads organisation, respondent, status, exposure answers, answer trace, score trace, domain scores, report requests and audit events. | Copy and visual density still need manual review in a browser. It is powerful but may be heavy for a non-technical MK reviewer. No structural redesign done here. |
| `/score/admin/config/questions` | Functional; copy review required | Admin can review methodology, domains, critical controls, hard gates, N/A rules and exposure factors. | The underlying 68-question copy needs a separate methodology review before any seed change. This branch documents that review but does not reseed question text. |
| `/score/admin/config/products` | Functional as review surface | Product/pricing configuration is visible. | It remains read-only. That is acceptable if deliberately approved for V1; editable product/EFT settings should be scoped separately if required. |
| `/score/admin/config/content` | Functional as review surface | Report content block visibility exists without generating reports. | No content authoring or approval workflow exists yet. This is a Phase 10-adjacent capability and should not be rushed into Phase 8. |
| `/score/admin/audit-log` | Functional | Audit events are visible. | Negative admin access testing still requires a non-admin Supabase Auth user or controlled test account. |
| `/score/admin/orders` | Parked | No Phase 9 functionality was added. | This page should remain clearly parked until manual EFT/order flow is built. |
| `/score/admin/reports` | Parked | No Phase 10 functionality was added. | This page should remain clearly parked until the PDF/report engine is built. |

## Issues Fixed in This Closeout Branch

1. Respondent start UI posted to `/api/assessments/start` instead of `/score/api/assessments/start`.
2. Assessment autosave posted to `/api/assessments/[ref]/answers` instead of `/score/api/assessments/[ref]/answers`.
3. Assessment submit posted to `/api/assessments/[ref]/submit` instead of `/score/api/assessments/[ref]/submit`.
4. Free snapshot report-interest button posted to `/api/assessments/[ref]/report-request` instead of `/score/api/assessments/[ref]/report-request`.
5. Admin assessment filter submitted to `/admin/assessments` instead of `/score/admin/assessments`.
6. Start-page wording was tightened to sound like a fraud-readiness product rather than a generic self health check.
7. The Phase 8 static test was extended to protect the above base-path routes.

## Still Not Fully Closed

### 1. Live browser verification after this branch deploys

The fixes in this branch must still be proven in production after merge/deploy. The code-level issue is fixed, but production is the source of truth because the failures only appeared once the app was mounted under `/score`.

Required smoke after deploy:

- Start a new assessment through `/score/start` UI.
- Autosave at least one exposure factor and one question.
- Submit through the UI.
- Confirm snapshot renders and report-interest request submits without leaving `/score`.
- Log into admin and confirm assessment filter does not leave `/score`.

### 2. Negative admin access proof

Active admin login has been proven. What is not proven yet is that a valid Supabase Auth user without an active `admin_profiles` row cannot access admin pages. This was not fixed because it requires a controlled non-admin user or a temporary test user in Supabase Auth.

### 3. Methodology copy improvement is not applied yet

The 68-question bank is structurally complete, but wording changes were not applied in this closeout branch. That is intentional. Question copy is part of the scoring methodology and should be changed in a dedicated methodology-copy PR with a clear audit trail.

### 4. Admin detail page visual density

The admin detail page is functionally rich but may be too dense for routine MK review. It was not redesigned here because this closeout branch focused on route correctness and safe polish. A later UI refinement may split it into tabs or sections.

### 5. Product/EFT/report content management

Phase 8 currently provides review surfaces, not full editing workflows. That should be approved as an intentional V1 decision. If product/pricing/EFT settings must be editable in-app before Phase 9, that needs a scoped admin configuration PR.

### 6. Orders and reports remain parked

This is not a bug. Manual EFT order handling and PDF report generation belong to Phase 9 and Phase 10 respectively. They should remain visibly blocked until those phases pass their own gates.

## Phase 9 Readiness Decision

Do not start Phase 9 until this closeout PR is merged and the post-deploy browser smoke confirms that the respondent journey works through the UI, not only via direct API calls.

After that smoke passes, Phase 9 can start with manual EFT/order flow only.
