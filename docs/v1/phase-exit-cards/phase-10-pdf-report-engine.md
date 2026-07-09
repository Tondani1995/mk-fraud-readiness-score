# Phase 10 Exit Card — Premium PDF Report Engine

## Status

`BLOCKED BY VERIFICATION`

Phase 10 remains draft. Runtime PDF generation was previously proven on Vercel, but the generated report was blocked by quality review because the PDF contained blank/spacer pages and thin generic fallback content. A V3 report-quality patch has now been applied to the PR branch to address that blocker, but CI and current-head runtime UAT must be rerun before this can move out of draft.

## Branching

- Base branch: `main`
- Phase 9 merge SHA on `main`: `92cbb6516cc8a777f94ce0adfa7c9e9f9b36462b`
- Phase 10 branch: `phase10/pdf-report-engine`
- PR: `#13`
- Starting head for this quality patch: `75602ece5f9d10a8292dbb4731dc60a053f00ad7`
- V3 report-quality code patch head: `57d73474431eddaddab41067ebfc591f8f23b0f2`
- This exit card may have documentation-only commits after the code patch head; runtime behavior should be retested against the latest PR head before PASS.

## What this draft adds

- Server-side report-data assembly from persisted score tables only.
- Admin-only report-generation route keyed by order reference.
- Payment gate: generation is allowed only after the Phase 9 order is in `payment_received` state.
- Versioned report rows in `reports`.
- Supersession on regeneration; prior reports are not silently overwritten.
- Private report storage through `generated-reports`.
- Admin signed download route with short-lived signed URLs.
- Admin order-detail report-generation and report-version controls.
- Static Phase 10 verification script.

## Runtime generation evidence already obtained

A previous exact-head Vercel deployment generated and downloaded a real report successfully:

- Deployment: `dpl_GfKWhiFimztYLXZpuuoJxUZV4CuZ`
- Deployment URL: `https://mk-fraud-readiness-score-ciok1olsx-tondanis-projects.vercel.app`
- Generated report: `RPT-MKFRS-2026-32D6B98B03-V1`
- Report row id: `eead893f-5070-44bf-bd90-a04dfa6d594d`
- Storage bucket: `generated-reports`
- Storage path: `MKFRS-2026-32D6B98B03/RPT-MKFRS-2026-32D6B98B03-V1.pdf`
- Report events observed: `generated`, `download_requested`
- Audit logs observed: `report_generated`, `report_download_requested`
- Storage bucket confirmed private.
- Logged-out admin download attempt was blocked by Vercel SSO.

## Quality blocker observed

The downloaded PDF was technically generated, but quality review blocked Phase 10:

- PDF page count: 36 pages.
- Internal-code scan: clean for domain/question/exposure/recommendation codes.
- Null/undefined/NaN scan: clean.
- Visual inspection: many blank/spacer pages.
- Content review: fallback domain content was too generic and repetitive.
- Roadmap review: the same domains repeated across separate 30/60/90 sections.

Result at that point: `BLOCKED BY REPORT QUALITY`.

## V3 report-quality patch now applied

The uploaded V3 premium report-quality package was selectively integrated. Runtime plumbing, schema, admin auth, payment gate, storage upload, download route, `render-pdf.ts`, `next.config.mjs` and report-generation route were preserved.

Files changed in this patch:

- Added `src/lib/reports/fallback-content.ts` with domain-specific fallback advisory content by domain and maturity band.
- Updated `src/lib/reports/select-content-blocks.ts` to use the new fallback lookup while still matching active content blocks on persisted domain codes.
- Updated false-comfort selection to distinguish capped, gap-but-not-capped, and clean states.
- Updated `src/lib/reports/roadmap.ts` to return one agenda list where each domain appears once with nested 30/60/90 actions.
- Updated `src/lib/reports/templates/report-template.ts` to use the V3 grouped report architecture: executive diagnosis, exposure profile, heatmap, priority gaps, critical flags, false comfort, grouped domain advisory pages, action register, roadmap, leadership agenda, MK next-engagement page, methodology and version record.
- Updated `scripts/phase10-premium-report-tests.mjs` with regression checks for domain-specific fallback content, roadmap repetition, old spacer-page patterns, internal-code hardcoding, phase labels, unsupported benchmark claims and unsupported AI claims.
- Updated this exit card.

## Verification so far for this patch

- Vercel produced a READY deployment for code patch head `57d73474431eddaddab41067ebfc591f8f23b0f2`.
- Deployment ID: `dpl_7HsbYxHL4R4yVtYzbVYiPFiCvNUm`.
- Deployment URL: `https://mk-fraud-readiness-score-l7jjp52nq-tondanis-projects.vercel.app`.
- Exact commit match: yes, for the code patch head.

Current workspace note: usable authenticated current-head checkout is not available. The branch was patched through the GitHub connector against PR #13. Older placeholder checkout folders in the workspace are not valid git repositories, and the previous source ZIP is stale relative to the current PR head.

Local commands from the required suite have therefore not yet been rerun on the patched GitHub head:

- `npm install`: not run on current head.
- `npm run phase7:test-snapshot`: not run on current head.
- `npm run phase8:test-admin`: not run on current head.
- `npm run methodology:copy-test`: not run on current head.
- `npm run phase9:test-orders`: not run on current head.
- `npm run phase10:test-report`: not run on current head.
- `npm run typecheck`: not run on current head.
- `npm run build`: not run on current head.

CI and live runtime UAT must still complete on the latest PR head before PASS.

## Explicitly preserved boundaries

No PayFast, card payments, automated payment verification, proof upload, automated email delivery, respondent portal, subscriptions, public benchmarks, peer averages or live AI-generated recommendations are added.

Payment status `payment_received` remains only an eligibility gate for a separate admin-controlled report generation action. It does not automatically generate, release, email, unlock or download a report.

## Known gaps before PASS

- CI must pass on the latest PR head.
- A READY Vercel deployment must exist for the latest PR head.
- Current-head Vercel/runtime generation must create a new real PDF version, private storage object and `reports` row.
- Download/security UAT must prove signed admin-only access and private storage after the quality patch.
- The new generated PDF must be visually reviewed for page count, blank pages, orphan headings, clipping, repeated generic content and roadmap repetition.
- Draft content blocks remain unapproved. Until MK approves active content blocks, real reports use fallback content.

## Current recommendation

Keep PR #13 draft. Do not mark ready and do not merge until CI passes on the latest PR head, live runtime generation succeeds through the deployed route, download/security UAT passes and the generated PDF passes premium-quality review.
