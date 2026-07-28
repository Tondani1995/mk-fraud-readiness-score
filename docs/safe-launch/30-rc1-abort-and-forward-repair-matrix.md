# RC1 Abort and Forward-Repair Matrix

**Status:** RC1E CONTROL-PLANE CORRECTION: **CODE COMPLETE — CONTROLLER REVIEW REQUIRED**;
RC1 OPERATIONAL READINESS, RC MIGRATION/DEPLOYMENT, CLOUD CERTIFICATION and PUBLIC LAUNCH:
**NO-GO**; **DO NOT MERGE**. No Production change is authorised by this document.
**Business owner:** Tondani Netili. **Technical executor:** Codex only after explicit owner/controller
approval. The freeze remains active after every abort.

Reverse/down migrations are not the default rollback. Schema repair is forward-only unless a
separately tested restoration procedure is approved by the owner/controller.

| Trigger | Immediate action | Application rollback? | Forward repair | Evidence | Decision owner / executor | Resume condition |
|---|---|---|---|---|---|---|
| Any migration error | Stop the runner; preserve last successful ledger row; keep freeze active | Only if separately approved and tested; never assume | Diagnose exact failed object and prepare additive repair | Runner output, ledger aggregate, error fingerprint | Tondani / Codex after approval | Repair applied/tested and postflight passes |
| Migration-ledger mismatch | Stop; do not mark rows manually | No default rollback | Reconcile ledger/version identity forward | Pre/post ledger outputs, CLI version | Tondani / Codex after approval | Exact eight-row cutover delta and 42-row ledger state restored |
| Unexpected schema or function body | Stop before next migration | No | Review approved SQL and propose forward correction | Definition/index/grant fingerprints | Tondani / Codex after approval | Owner accepts corrected fingerprints |
| Real order/payment mutation during freeze | Stop all actions; preserve freeze; notify owner | Only application traffic rollback if separately approved | Reconcile affected state through supported controls | Aggregate event counts and audit evidence; no PII in git | Tondani / Codex after approval | Impact bounded and owner signs repair |
| Non-canary fulfilment claim | Stop workers and delivery; preserve lease/audit state | No default rollback | Forward-repair the affected attempt through supported admin flow | Aggregate claim/lease/event evidence | Tondani / Codex after approval | No active unexpected lease and owner approval |
| Duplicate generation | Stop generation/delivery; protect current verified rows | No default rollback | Preserve versions, supersede only through supported flow, investigate idempotency | Aggregate report/version counts and technical references | Tondani / Codex after approval | No duplicate-current result and review signed |
| Either `CURRENT_VERIFIED` order changes | Stop all fulfilment | No default rollback | Owner-approved restoration/reconciliation only | Aggregate protected-order comparison | Tondani / Codex after approval | Both remain protected and owner signs |
| Email sent to a non-designated test mailbox | Stop provider and delivery; preserve provider evidence | No default rollback | Provider-side containment and recipient-impact assessment | Provider event aggregate and incident record; never commit address | Tondani / Codex after approval | Containment confirmed and controller resumes |
| Webhook correlation failure | Disable callback path; keep provider mode disabled | No default rollback | Forward-repair correlation using audited provider/event controls | Aggregate event status and error class | Tondani / Codex after approval | Correlation test passes on synthetic only |
| Deployment SHA mismatch | Stop smoke tests and freeze release | Redeploy exact approved SHA if explicitly approved | No schema repair unless a schema issue exists | Vercel SHA/READY evidence | Tondani / Codex after approval | Exact SHA READY and smoke tests pass |
| Health or smoke-test failure | Stop; retain disabled state | Application redeploy/rollback only if separately approved | Diagnose and forward-fix after review | Status codes, build info and aggregate no-change output | Tondani / Codex after approval | Health and disabled-state checks pass |
| Cannot return provider mode to disabled | Keep freeze active; do not release | No default rollback | Restore disabled environment/control state forward | Environment state confirmation without secret values | Tondani / Codex after approval | Disabled state independently confirmed |
| Cannot confirm freeze remains effective | Stop all steps; no canary or worker | No | Repair/add freeze gate before any continuation | Route/RPC/worker gate evidence | Tondani / Codex after approval | Every mutation surface fails closed |
| Application/database freeze disagreement | Stop all traffic and keep both layers frozen | No | Repair the disagreeing layer and repeat old-schema plus postflight proofs | Application mode, non-PII freeze status, epoch and evidence fingerprint | Tondani / Codex after approval | Both layers report the same approved frozen state |
| Malformed or missing release state/epoch/evidence | Treat as frozen; stop release and every mutation | No | Forward-correct the control row/function through separately reviewed code; never hand-edit the row or ledger | Constraint failure, safe status error class and exact object fingerprints | Tondani / Codex after approval | Constraint and defence-in-depth runtime suites pass and controller accepts the corrected manifest |
| Certification-secret control attempts to widen the freeze | Stop provisioning; preserve `FROZEN`; do not retry through the generic route | No | Diagnose the exact one-use token/RPC/trigger path and prepare a reviewed forward fix | Safe RPC error, epoch, audit-event count, token-row count and unchanged business aggregates | Tondani / Codex after approval | Generic route and direct DML remain blocked; one-use path and post-provision evidence pass |
| Canary cannot be transactionally constrained | Do not authorize or execute a canary; keep certification NO-GO | No | Implement and separately approve one design from document 33 | Design decision, disposable proof, one-use and scope evidence | Tondani / Codex after approval | A genuine transactional single-use boundary passes controller review |

For every abort, record: trigger timestamp, last successful step, aggregate data-state comparison,
ledger/schema/function fingerprints, owner decision, executor, repair change reference, and explicit
resume condition. Do not include customer-identifying data or secret values.
