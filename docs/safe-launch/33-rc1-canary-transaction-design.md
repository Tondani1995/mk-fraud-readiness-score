# RC1 Canary Transaction Design Decision

**Status:** TECHNICAL STOP — NO CANARY BYPASS IMPLEMENTED; CLOUD CERTIFICATION: **NO-GO**;
RC MIGRATION/DEPLOYMENT: **NO-GO**; **DO NOT MERGE**.

## Decision

RC1D does not implement a canary bypass. The operational freeze therefore stops synthetic and real
mutations alike. This is the safest code-complete foundation that can be proved without pretending
that a header, environment value, role or database flag creates a transactional single-use boundary.

The current generation-to-delivery flow spans separate HTTP requests, pooled PostgREST calls,
Supabase Storage operations and provider interactions. A ticket consumed in one database
transaction cannot govern later independent transactions or external side effects. A global,
session, header or service-role exception could be replayed, widened to unrelated rows, or survive
after a partial failure. It is not an acceptable canary control.

## Required properties

Before CLOUD CERTIFICATION GO, the chosen implementation must prove all of the following in a
disposable environment:

1. The authorization is created only by a named AAL2 platform admin with mandatory reason and audit.
2. It is bound to one synthetic fixture, one designated test mailbox, an explicit surface set and a
   short expiry without storing identifying data in git or logs.
3. It is single-use under concurrent execution and cannot be replayed.
4. Every database mutation and external side effect is causally bound to the authorization.
5. A partial failure leaves the platform frozen and leaves no unrelated job eligible.
6. `service_role`, direct DML, workers, provider callbacks and unknown surfaces cannot widen it.
7. Activation, consumption, closure and expiry have non-PII evidence fingerprints.
8. The canary can be closed before freeze release, and release fails while any authorization remains
   active.

## Safest implementation options

### Option A — one database workflow RPC

Move the complete synthetic state transition into one narrowly scoped `SECURITY DEFINER` database
RPC that locks and atomically consumes the authorization. Return an outbox record for any unavoidable
external side effect. A separately scoped dispatcher may process only that outbox row and must
atomically mark it consumed. This is the preferred option when the workflow can be reduced to one
database transaction plus an idempotent outbox.

### Option B — durable server-side canary executor

Create a dedicated executor with a database-backed state machine. Every step uses the same immutable
authorization ID, exact synthetic resource fingerprints, compare-and-swap state transitions and an
outbox/inbox boundary for Storage and provider effects. No general worker may see the job. This is
more complex but can cover workflows that cannot fit in one transaction.

### Option C — isolated disposable certification environment

Run certification in a separate disposable Supabase/Vercel/provider environment containing synthetic
fixtures only, then destroy or retain it under a separately approved evidence policy. This avoids a
Production bypass entirely, but it certifies the artifact and integration rather than the live
Production data plane. The controller must decide whether that evidence is sufficient.

## Rejected mechanisms

- Request headers, cookies or bearer values checked only by the application.
- PostgreSQL session GUCs across pooled requests.
- A global environment-variable bypass.
- A broad `service_role` or trigger-disable exception.
- A reusable database ticket not atomically consumed with the protected mutation.
- Temporarily setting the whole database or application freeze to released for the canary.
- Administrator discipline or a manual promise that unrelated work will not run.

## Controller decision required

The controller must select Option A, B or C; name the implementation and review owners; approve the
exact synthetic scope, expiry, abort conditions and evidence; and authorize a separate code-only
implementation cycle. Until that decision and implementation pass disposable tests, no synthetic
canary may run and CLOUD CERTIFICATION remains **NO-GO**.
