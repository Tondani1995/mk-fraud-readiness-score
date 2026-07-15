# V2 Phase 1 — Production deployment and rollback plan

This is a future approval plan. This Phase 1 task does not deploy production, apply a remote migration, provision a provider or merge the PR.

## 1. Source merge approval

Review and approve the draft PR separately from any database change. Confirm CI, exact-SHA protected Preview evidence, Phase 14-disabled assertions and security review. Merging source does not itself authorise database migration or provider provisioning.

## 2. Future database migration approval

Migration `0018_phase1_manual_fulfilment_recovery.sql` requires a separate change window and named database approver. Before approval:

- rerun fresh replay and production-history simulation from a schema-only/data-shape-safe copy;
- inventory current `reports` and `email_events` constraints;
- confirm migration 0017 remains unapplied;
- take an approved backup and record restore identifiers;
- confirm no Phase 14 gate, feature policy or secret is introduced.

Apply only 0018 in the approved environment. Validate row counts, private bucket state, new table/RPC grants and legacy report backfill. Do not run production reconciliation.

## 3. Provider provisioning

Provider provisioning is not part of Phase 1. Keep `PHASE1_DELIVERY_MODE=disabled`. A later approved phase must select a provider, provision secrets, verify domain/sender policy, define bounce handling and obtain explicit permission before any real customer delivery.

## 4. Production smoke testing

After source and migration are independently approved and deployed:

- verify `/`, `/score/api/health` and `/score/admin/login`;
- use a designated non-customer test order only;
- confirm a permitted admin sees the order and persisted state;
- verify Generate produces one attempt and one private verified object;
- verify preview/download access and event logging;
- record a delivery request in disabled mode and confirm no email is sent;
- confirm paid/no-report and ready/not-delivered queues;
- inspect structured logs for safe references and no secrets.

Production smoke testing does not authorise real provider, webhook, AI or customer activity.

## 5. Rollback and forward repair

Source rollback: redeploy the last known-good production deployment. This disables new Phase 1 route/UI behaviour without deleting generated reports or history.

Database forward repair is preferred after Phase 1 records exist. Failed attempts remain terminal and a retry creates a new row. Missing objects are marked `MISSING`; they are not silently treated as permission errors.

Schema rollback is allowed only if no Phase 1 rows or new report metadata are in use. In a separately approved transaction, revoke/drop the six Phase 1 RPCs, drop the two attempt tables and remove additive columns only after exporting their history. Do not delete report objects as part of schema rollback. Restore the previous backup only under the database incident plan.

Provider rollback: not applicable while disabled. If a later phase provisions one, disabling the provider must not alter report readiness or versions.

## Activation blockers

H1–H6 and M1–M2 remain unresolved Phase 14 activation blockers. This plan does not close or bypass them.
