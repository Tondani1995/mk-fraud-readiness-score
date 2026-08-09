# MK Fraud Readiness — 2026-08-06 morning handover

## Scope and safety

This handover covers PR #52 (`feature/adaptive-production-foundation-v1`) in Preview and Staging only. Production project `jvjxlphdyzerrhwcgkup` remains read-only; no merge, Production deployment, environment change, real payment, or real-customer email is authorised by this handover.

## Current decision state

- G29: final-SHA baseline workflows passed on `cc24dc34de7c3a394d92839e30cba70b7773079c`; the first synthetic journey was contained after the application defect `QG_AI_EVIDENCE_REF_DUPLICATE`.
- G40: open pending a successful real-AI durable generation with provider/model, token, latency, accounting, PDF and Storage evidence.
- G41: open pending independent database, runtime, Gateway, PDF/Storage, signed-access, delivery, callback and idempotency evidence.
- G30: not started and must remain closed until G40 and G41 pass.

## Corrective state

The authorised narrow correction changes only the advisory evidence-pack identity mapping: `evidence:VIS-*` remains the checklist artefact reference, while the visibility condition is `visibility-gap:<gap.id>` and links to its question, domain and checklist artefact. The first failed attempt `cf7ca395-48d5-4415-bc1c-c3d4f631e4b8` is parked through the existing authoritative control as `MANUAL_REVIEW_REQUIRED` with no lease or retry time. Its assessment, order, single payment transition, quality diagnostic and three existing order messages are preserved; no AI attempt, report, PDF, delivery authorisation or premium email exists.

Focused local proof currently passes:

- adaptive correction: pass;
- V7 Checkpoint D: 23/23;
- V7 Checkpoint E: 28/28.

## Remaining authorised sequence

1. Run typecheck and build.
2. Create and push exactly one narrow successor commit; do not amend or force-push.
3. Run the mandatory exact-SHA workflow set and deploy READY Preview at the exact successor SHA.
4. Rebind Staging AI authority to the exact successor SHA and verify the route preflight.
5. Create only one fresh second synthetic visibility-limited journey, marked `PRE-G30 OVERNIGHT SYNTHETIC AI CERTIFICATION — JOURNEY 2`.
6. Complete the existing assessment, score, order, one synthetic payment transition, worker, real AI, report/PDF/Storage, delivery, signed access and idempotency path.
7. Close G40/G41 only from durable independent evidence. If either remains open, do not start G30.

## Production baseline

The preserved Production read-only baseline is orders `23`, reports `23`, email events `75`, provider events `0`, and migrations `34`. Any change to this baseline is an immediate STOP condition.
