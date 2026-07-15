# Phase 14 trusted-root threat model

## Runtime security claim

Phase 14 state-machine controls are designed to be non-bypassable by anonymous and authenticated users, ordinary administrators, generic service-role API clients, scoped workers, and public external callers. Those principals receive no generic mutation path to authoritative Phase 14 tables. Shared-table Phase 14 rows are guarded and may be changed only by reviewed `SECURITY DEFINER` transitions.

The claim deliberately does not include PostgreSQL object owners, Supabase infrastructure administrators, or controlled migration identities. They are trusted-root principals: PostgreSQL ownership and infrastructure control can replace functions, alter triggers, change grants, read database-private HMAC material, or modify data outside the runtime API boundary.

## Trust boundaries

- Human enablement requires an active, non-revoked Supabase Auth session, AAL2, an active admin profile, the required role, an exactly satisfied gate version, and an exactly versioned policy approval.
- Durable workers carry opaque capability IDs only. Database-owned leases bind the capability, operation, policy, gate version, commercial records, and expected transition.
- Provider webhooks first pass provider signature verification, then a separate database HMAC attestation whose key is not readable through the service-role API. Provider lookup evidence is immutable and single-use.
- AI output is unusable unless authoritative gateway metadata identifies the resolved provider and model and the exact provider route is approved for the current gate version.
- Cleanup work is bound to an opaque cleanup capability, queue row, work lease, bucket, path and checksum. Successful deletion requires an absence check; terminal failure creates a durable alert.

## Operational requirements before production enablement

1. Restrict database-owner, infrastructure-admin and migration identities to a small named group using just-in-time access and phishing-resistant MFA.
2. Separate migration authoring, migration approval, and production execution. No single principal should approve and execute its own Phase 14 enablement.
3. Export database audit records, gate/policy changes, capability lifecycle events, provider attestations and cleanup dead letters to immutable external storage with independent retention and alerting.
4. Provision database HMAC secrets through the AAL2 rotation RPC and deploy matching route-side secrets through the platform secret store. Never expose either value in logs, workflow history, evidence files, or CI output.
5. Keep every Phase 14 policy disabled until migration equivalence, route-to-database tests, provider sandbox verification and a new independent review have passed on the exact candidate head.
6. Monitor gate-version changes as emergency revocation events: policies become stale/disabled and active worker capabilities are revoked immediately.
7. Review trusted-root membership and immutable audit-export delivery before every production enablement and at least quarterly thereafter.

## Residual risk

The database commit and migration-ledger update are separate operations. A runner failure after database commit but before ledger recording can require controlled reconciliation. Operators must compare the recorded migration hash and schema inventory, never blindly replay a migration, and record the reconciliation under separation of duties.
