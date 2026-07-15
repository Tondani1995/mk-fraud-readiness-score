# MK single-platform architecture inventory

Tracking issue: `Tondani1995/mk-fraud-readiness-score#22`

## Immutable source references

- Destination repository: `Tondani1995/mk-fraud-readiness-score`
- Original destination base commit: `71605200915fcf7c5448f9e4ff2d517cece7c471`
- Current product parity commit: `60c2f5c9bebd294efd18c0ab1a8ddc0f4d89a748`
- Source website repository: `Tondani1995/fraud_website`
- Original source website commit: `5e74f9ec9390b2b053ca26ee669f529b7ef47c9b`
- Current website parity commit: `76c8a4cfc8b94c260f98111b853044f83675edf7`
- Consolidation branch: `consolidation/single-mk-platform`
- Vercel project ID: `prj_jFSTfwL14kk8UURjaaRwYe2HWuhK`

## Consolidated runtime

The destination is one Next.js 14 App Router application on React 18 and Tailwind CSS 3. There is no global `basePath`. Public website routes live at the domain root and the readiness product is owned by explicit `/score/*` route folders in the same application.

The only rewrite is same-application compatibility for Workflow DevKit callbacks:

`/score/.well-known/workflow/:path*` → `/.well-known/workflow/:path*`

It has no host or protocol destination and cannot proxy to the retired website or product deployments.

Repository-wide hostname review found old product Preview URLs only in historical `docs/v1/**` evidence. They are not imported by runtime code or configuration. The generic `.vercel.app` suffix check in the respondent submit route deliberately preserves the current Preview origin when it builds a snapshot URL; it contains no project hostname and performs no proxying. No old website deployment hostname is present.

## Route ownership

### Public website

- Pages: `/`, `/home`, `/about`, `/services`, `/industries`, `/insights`, `/insights/[slug]`, `/contact`, `/privacy-policy`, `/terms-of-use`, `/fraud-readiness-score`, `/login`
- Website content administration: `/admin`, `/admin/analytics`, `/admin/insights`, `/admin/insights/new`, `/admin/insights/[id]/edit`
- Website APIs: `/api/insights`, `/api/insights/[id]`, `/api/auth/admin-login`
- Discovery: `/robots.txt`, `/sitemap.xml`, favicon and structured-data metadata
- The score landing page embeds `/score/start?embed=1` in a same-origin iframe. CTA links use `/fraud-readiness-score#start-score`.
- The embedded product reports document-height changes with `ResizeObserver`, load and resize events. The website validates both message origin and iframe source before adjusting the eager-loaded frame. The frame starts at a safe 620px minimum and contains no fixed 1900px height.

The source website's `/api/ai/generate-insight` and `/api/ai/generate-tags` endpoints were intentionally not imported. No new AI route, provider call, or feature activation is part of the consolidation.

### Fraud Readiness product

- Respondent pages: `/score`, `/score/start`, `/score/assessment/[assessmentRef]`, `/score/assessment/[assessmentRef]/result`, `/score/snapshot/[assessmentRef]`, `/score/report/request/[assessmentRef]`
- Product administration: `/score/admin` and its assessment, audit, configuration, enquiry, methodology, order, report and settings routes
- Respondent APIs: `/score/api/assessments/*`
- Product admin APIs: `/score/api/admin/*`
- Operational APIs: `/score/api/health`, `/score/api/qa/ping`, `/score/api/system/build-info`
- Retained internal/provider routes: `/score/api/internal/phase14-storage-cleanup`, `/score/api/webhooks/resend`
- Publicly denied by middleware: `/score/api/readiness-runtime-check`, `/score/api/internal/uat-start-check`
- Workflow DevKit handlers remain generated at `/.well-known/workflow/v1/*`, with the same-app legacy `/score/.well-known/workflow/v1/*` compatibility rewrite.

Phase 14 remains disabled. Existing source files and isolated tests are retained, but this change does not apply migration 0017, reconcile any remote database, change security gates or feature policies, invoke providers, or add secrets.

## Content inventory

The website's twelve published insight articles are checked in as `src/content/insights.json`. This makes public website reads deterministic in a protected Preview without a MongoDB secret. When `MONGODB_URI` is configured, the retained website content-management API and admin pages continue to use MongoDB; public reads fall back to the checked-in published set when MongoDB is unavailable.

The imported source content covers these twelve slugs:

1. `the-fraud-toolkit-economy-how-cybercriminals-build-and-scale-modern-scams`
2. `fraud-as-a-service-faas-the-underground-industry-powering-modern-scams`
3. `when-your-refund-is-gone-before-you-see-it-the-mechanics-of-sars-return-fraud-in-south-africa`
4. `the-quiet-billion-rand-threat-understanding-vat-refund-fraud-in-south-africa`
5. `procurement-fraud-in-south-africa-the-most-expensive-blind-spot-in-corporate-and-public-governance`
6. `the-cost-of-weak-fraud-leadership-in-south-africa`
7. `fraud-in-south-africas-informal-and-parallel-economy`
8. `vehicle-fraud-in-south-africa-identity-engineering-finance-manipulation-and-structural-weakness`
9. `fraud-resilience-in-south-africa-why-consumers-smes-and-corporates-require-different-structural-defences`
10. `if-i-had-60-minutes-to-audit-your-fraud-strategy`
11. `fraud-is-outpacing-governance-and-the-data-is-no-longer-subtle`
12. `fraud-doesnt-announce-itself-it-settles-in-quietly`

## Data stores and external services

| Concern | Runtime dependency | Consolidation treatment |
| --- | --- | --- |
| Product records, tokens, scoring, admin, reports | Supabase/Postgres/Auth/Storage | Existing product integration retained; no remote database was read or changed during consolidation |
| Website insight CMS | MongoDB/Mongoose | Retained when configured; public reads have a committed static fallback |
| Website contact form | Web3Forms | Existing client-side integration retained |
| Website analytics | Google Analytics 4 | Existing optional integration retained |
| Product transactional email | Resend | Existing disabled/conditional integration retained; no provider call was made |
| Product PDF rendering | Chromium/Puppeteer | Existing implementation retained |
| Durable product workflows | Workflow DevKit | Existing generated handlers retained with same-app compatibility routing |

## Environment variable inventory

No values are recorded here. Existing Vercel values must be audited in-place before cutover and must not be copied into GitHub or documentation.

### Shared application identity

- `NEXT_PUBLIC_APP_URL`
- `MK_RELEASE_CHANNEL`
- `MK_BUILD_PHASE`

### Supabase and product security

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` when required by existing verification logic
- `ASSESSMENT_TOKEN_PEPPER`
- `ASSESSMENT_RESUME_TOKEN_TTL_HOURS`
- `ASSESSMENT_SNAPSHOT_TOKEN_TTL_HOURS`
- `ASSESSMENT_REPORT_REQUEST_TOKEN_TTL_HOURS`
- `ASSESSMENT_TOKEN_MAX_USES`
- `ASSESSMENT_SNAPSHOT_TOKEN_MAX_USES`
- Existing assessment and admin rate-limit variables from `.env.example`

### Existing product delivery integrations

- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- `MK_ADMIN_EMAIL`, `MK_FROM_EMAIL`, `MK_INTERNAL_LEADS_EMAIL`, `MK_INTERNAL_NOTIFICATIONS_EMAIL`
- `MK_REPORT_EMAIL_FROM`, `MK_REPORT_EMAIL_REPLY_TO`
- `SUPABASE_BUCKET_PAYMENT_PROOFS`, `SUPABASE_BUCKET_REPORTS`
- Existing Phase 14 variables remain as-is and disabled; no new values are required by consolidation

### Website integrations

- `MONGODB_URI`
- `JWT_SECRET`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `GA_PROPERTY_ID`, `GA_SERVICE_ACCOUNT_EMAIL`, `GA_SERVICE_ACCOUNT_PRIVATE_KEY`
- `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` (a browser-visible form identifier, not a server secret)

## Dependency disposition

The product's Next.js 14, React 18, Tailwind 3, Supabase, Workflow, AI SDK, PDF and test dependencies remain authoritative. Only source website packages that are imported by retained runtime code were added: Radix UI primitives, Axios, bcryptjs, class-variance-authority, clsx, jose, lucide-react, mongoose and tailwind-merge. Source-only Next.js 16/React 19/Tailwind 4 tooling and the two website AI endpoints were not adopted.

## Verification boundaries

- Local Supabase was started on isolated ports and replayed only migrations 0001 through 0016.
- Migration 0017 was absent from the test migration directory and was not applied.
- A local-only, non-committed service-role DML grant was used because the 0001–0016 replay does not reproduce the runtime ACLs already expected by the application. This did not change any remote environment or repository migration.
- No production, UAT or staging database was queried or mutated.
- No domain, webhook, provider, secret, deployment alias, feature policy or security-gate setting was changed.
