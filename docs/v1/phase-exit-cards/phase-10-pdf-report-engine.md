# Phase 10 Exit Card — Premium PDF Report Engine

## Status

`BLOCKED`

Phase 10 is not ready and PR #13 must remain draft. ZIP-based local testing passed after the required patch, but live Supabase reconciliation, current-head runtime PDF generation, download/security UAT and PDF quality inspection are still outstanding.

## Branching

- Base branch: `main`
- Phase 9 merge SHA on `main`: `92cbb6516cc8a777f94ce0adfa7c9e9f9b36462b`
- Phase 10 branch: `phase10/pdf-report-engine`
- PR: `#13`

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

## Patch applied after ZIP testing

Codex completed Phase 10 ZIP testing and identified required fixes. The GitHub branch now includes those fixes:

- Removed legacy `verified` eligibility from report assembly.
- Fixed content-block selection to match persisted domain codes rather than domain display names.
- Removed stale public phase/proof-upload wording from the report request page.
- Added regression coverage for the eligibility gate, content-code matching and public wording boundary.

## Local ZIP test results reported by Codex

The following passed from the uploaded PR #13 ZIP after the patch:

- `phase7:test-snapshot`
- `phase8:test-admin`
- `methodology:copy-test`
- `phase9:test-orders`
- `phase10:test-report`
- `typecheck`
- `build` with safe dummy build-time environment values

Note: Codex used bundled `pnpm` because `npm` was unavailable in that workspace.

## Explicitly excluded

No PayFast, card payments, automated payment verification, proof upload, automated email delivery, respondent portal, subscriptions, public benchmarks or live AI-generated recommendations are added.

## Known gaps before PASS

- Live Supabase schema reconciliation must be completed.
- No Phase 10 production migration has been applied from this PR.
- Puppeteer must be proven in Vercel/current runtime.
- A real report must be generated from an actual `payment_received` order.
- Generated PDF must be visually reviewed against the premium MK report standard.
- Download/security UAT must prove private storage and signed admin-only access.
- Draft content blocks must not be activated without MK approval.

## Current recommendation

Keep PR #13 draft. Do not mark ready and do not merge until CI passes on the patched GitHub head, live Supabase reconciliation completes, current-head runtime report generation works, report download/security tests pass and the generated PDF passes premium-quality review.
