# Phase 10 Exit Card — Premium PDF Report Engine

## Status

Draft stacked implementation. This is **not passed** and must not be merged to main until Phase 9 runtime UAT passes and the Phase 10 runtime PDF path is verified.

## Branching

- Base branch: `phase9/manual-eft-order-flow`
- Phase 10 branch: `phase10/pdf-report-engine`
- Dependency: PR #12 must pass runtime UAT and merge first, or Phase 10 must be rebased after PR #12 merges.

## What this draft adds

- Server-side report-data assembly from persisted score tables only.
- Admin-only report-generation route keyed by order reference.
- Payment gate: generation is allowed only after the Phase 9 order is in `payment_received` / verified state.
- Versioned report rows in `reports`.
- Supersession on regeneration; prior reports are not silently overwritten.
- Private report storage through `generated-reports`.
- Admin signed download route with short-lived signed URLs.
- Admin order-detail report-generation and report-version controls.
- Static Phase 10 verification script.

## Explicitly excluded

No PayFast, card payments, automated payment verification, proof upload, automated email delivery, respondent portal, subscriptions, public benchmarks or live AI-generated recommendations are added.

## Known gaps before PASS

- Puppeteer must be proven in Vercel/current runtime.
- A real report must be generated from an actual `payment_received` order.
- Generated PDF must be visually reviewed against the premium MK report standard.
- Draft content blocks must be reviewed and explicitly activated before they can render into a paid client report.
- Phase 9 current-head runtime UAT remains a dependency.

## Current recommendation

`PASS WITH PHASE 9 MERGE DEPENDENCY` is not yet available. Current state should remain `DRAFT / BLOCKED BY RUNTIME UAT` until CI, Vercel and browser-path generation are verified.
