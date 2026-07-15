# V2 Phase 1 — production deployment and recovery plan

This is an approval plan, not an authorisation to deploy. PR #26 remains draft and must not merge or change production as part of release-safety verification. Production is compatible through migration 0016 only; migrations 0017–0022 are prohibited for this release.

## Mandatory source-first sequence

1. **Merge source.** Only after PR #26 has the approved final SHA, green fresh-install/static/regression/pre-post/replay/PDF evidence, and an exact-SHA protected Preview, approve and merge that source revision. Merging does not approve a database change.
2. **Production deployment becomes READY.** Deploy the compatible source first, record the production deployment ID and prior rollback deployment ID, and wait for the new deployment to report READY while production remains on the schema-through-0016 boundary.
3. **Application runs safely in pre-0023 compatibility mode.** Confirm the exact upgrade-not-activated message is present, Phase 1 controls are absent, existing data remains readable, and logs contain no missing Phase 1 object query. If unhealthy, redeploy the recorded rollback deployment and stop; the database is unchanged.
4. **Verify public site and current admin routes.** Check `/`, `/score/admin/login`, the admin orders list, one existing order detail, the reports page, and an existing order-status update. Require successful rendering without a generic 500 and retain normal authentication/role enforcement.
5. **Separately approve the production database change.** Open a distinct change window with a named database approver. Record the target label and the read-only fingerprint returned by `current_database()`, `current_user`, `inet_server_addr()`, and `inet_server_port()`. Run `PHASE1_ACTION=verify`; require the through-0016 boundary, 0017–0022/Phase 14 absence, 0023 absence, and all preconditions.
6. **Back up and record restore identifiers.** Take the approved backup immediately before the database operation and record its immutable restore identifier, timestamp, owner, retention, and restore procedure.
7. **Execute the exact 0023-only mechanism.** Set the literal target confirmation and use `PHASE1_ACTION=apply`. The controller verifies the reviewed SHA-256, locks the ledger, executes only `0023_phase1_manual_fulfilment_recovery.sql`, verifies its objects, and records only version `0023`/name `phase1_manual_fulfilment_recovery` in the same transaction. It never fabricates 0017–0022. Duplicate, prohibited, partial, and unexpected states are rejected.
8. **Verify schema capability becomes available.** Require `available=true` and `schema_version=0023`; both attempt ledgers with RLS; all required report/email columns and six RPCs; a private report bucket; one hash-bound 0023 ledger entry; and continued absence of 0017–0022 and Phase 14 objects.
9. **Verify Phase 1 controls activate.** Refresh the authorised admin order and reports pages. Confirm generation, secure preview/download, and permitted delivery controls are visible only to their existing authorised roles, while unauthenticated and unauthorised access remains blocked.
10. **Run a designated non-customer smoke test.** Verify one generation attempt creates one version and one verified private PDF; preview/download create short-lived links plus audits; disabled delivery records a pending attempt without provider activity; duplicate keys remain idempotent; and the existing order-status path still works.
11. **Retain provider delivery in disabled mode.** Keep `PHASE1_DELIVERY_MODE=disabled`, observe source/database logs, and attach non-sensitive evidence. Do not provision providers, webhooks, AI, autonomous workflows, or customer sends. Close the window only when source and database are healthy; otherwise use the recovery boundaries below.

## Exact controlled command shape

First obtain and independently review the target fingerprint with a read-only database session. Then run readiness:

```bash
DATABASE_URL='<approved secret supplied outside shell history>' \
PHASE1_ACTION=verify \
PHASE1_TARGET_LABEL=production \
PHASE1_EXPECTED_TARGET_FINGERPRINT='<database|role|address|port>' \
bash scripts/apply-phase1-0023-only.sh
```

Only after approval of that output, apply with the literal confirmation assembled from the same label and fingerprint:

```bash
DATABASE_URL='<approved secret supplied outside shell history>' \
PHASE1_ACTION=apply \
PHASE1_TARGET_LABEL=production \
PHASE1_EXPECTED_TARGET_FINGERPRINT='<database|role|address|port>' \
PHASE1_CONFIRM='APPLY-0023-ONLY:production:<database|role|address|port>' \
bash scripts/apply-phase1-0023-only.sh
```

Never run the migration file directly and never use a broad migration-push command for this release.

## Recovery boundaries

**Source rollback before 0023:** redeploy the recorded prior production deployment. No database repair is needed.

**Source rollback after 0023:** redeploy the prior source. Migration 0023 is additive and the prior source does not depend on its objects. Retain all attempt/report history; do not drop columns, tables, or stored PDFs during an application incident.

**Failure inside the controlled apply:** `psql --single-transaction` rolls back the migration objects and the 0023 ledger entry together. Re-run readiness, diagnose the exact error, and use a newly reviewed forward correction if source SQL needs adjustment.

**Unexpected partial state detected before apply:** stop. Do not delete objects or manufacture ledger history. Preserve evidence, compare the target to the reviewed 0023 manifest, and choose either an approved backup restore or a separately reviewed forward-repair transaction. The normal controller must continue rejecting the target until the database controller signs off the repair.

**Committed 0023 with a later application fault:** prefer source rollback followed by forward repair. A destructive schema rollback is not a routine release action and requires a separate incident plan proving no Phase 1 row, report metadata, or stored object depends on the additive schema.

Provider rollback is not applicable because delivery remains disabled. Phase 14 activation blockers remain unresolved and are not changed by this plan.
