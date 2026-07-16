# Production deployment and rollback plan

This is an approval plan, not evidence that production activation occurred.

1. **Source merge** — review and merge separately from any database action. Confirm provider mode and delivery mode remain disabled.
2. **Compatibility deployment** — deploy source with no new Stitch secret. Verify public site, assessment, orders and pre-migration capability messages.
3. **Database approval** — separately approve migration 0023 if still absent, then approve the reviewed 0024/0025 bytes and checksums. Do not use generic migration push.
4. **Exact migration-only application** — run the 0023-only controller if approved, then the 0024/0025-only controller with exact target fingerprint and confirmation. Abort on 0017–0022/Phase 14 or partial state.
5. **Stitch secret provisioning** — only after separate security approval, provision the production webhook secret through the platform secret store. Never place it in source or logs.
6. **Webhook registration** — register the exact `/score/api/webhooks/stitch` production URL and confirm Svix header/signature behaviour from current Stitch documentation.
7. **Provider verification** — use provider-sanctioned non-customer test facilities, confirm timestamp tolerance, signature rejection and normalized events. Keep customer activation off.
8. **Non-customer payment smoke** — with written approval, run one controlled test order and verify one transition, one generation request, no delivery and no duplicate on replay.
9. **Controlled customer activation** — enable only the approved provider mode and monitor pending, failed, review-required and paid-but-fulfilment-pending queues.
10. **Rollback/disablement** — first disable provider session creation and webhook secret/registration; retain the ledger for audit and continue manual confirmation. Roll back application source only to a version that tolerates additive 0024/0025 columns/tables. Do not destructively drop payment history or cursor data during incident response.

If Phase 1 is absent or unhealthy, payment remains recorded and fulfilment remains operationally pending. If resume capability is absent or unhealthy, answer-derived navigation remains available. Phase 14 stays disabled throughout.
