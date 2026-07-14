# Phase 14 Provider Data Controls

## Merge posture

The Phase 14 database security gate defaults to unsatisfied and is authoritative over application flags. While unsatisfied, AI dispatch, email dispatch, reconciliation mutation and webhook ingestion fail closed. This makes the current merge posture technically inert; it is not permission to enable a provider.

## Stored data limits and minimisation

| Data category | Maximum or shape | Stored fields | Access |
|---|---|---|---|
| Raw webhook request | 64 KiB request limit; never stored | None | Not applicable |
| Verified provider event | Minimal normalized JSON, also capped at 64 KiB | provider, event ID, message ID, type, provider-created time, SHA-256 fingerprint, payload byte count, supported flag, normalized reason/type/time, processing result | Service role writes; authenticated admin roles read through RLS; no anonymous access |
| Email delivery authorization | One immutable outbox record | report/checksum, normalized recipient, order, assessment, score run, security-gate version, actor/session, provider and state timestamps | Service role mutates; authorized admins read through RLS |
| AI attempt | Pre-dispatch identity and bounded structured result | generation/evidence/provider/model/prompt/schema/kind, request key, byte/token/cost ceilings, usage/cost or explicit unverified state | Service role writes; authorized admins read through RLS |
| Operational alert | Minimal diagnostic identifiers | category, severity, report/email IDs and bounded structured detail | Service role writes; authorized admins read through RLS |

Provider webhook payloads are rebuilt with `jsonb_build_object` and `jsonb_strip_nulls`; arbitrary headers, recipient lists, HTML bodies, attachment contents and unrelated provider fields are not persisted. Unsupported verified events retain only type, created time, reason if present, identity and fingerprint.

## Retention categories

- Security and audit records: retain according to the approved audit schedule; deletion must preserve legal holds and referential integrity.
- Delivery authorization/finalization records: retain with the commercial order/report evidence period.
- Provider events and operational alerts: short operational retention, subject to an enablement PR that encodes the approved deletion schedule.
- AI attempts and structured outputs: retain only for reconciliation, cost audit and report provenance; unresolved/accounting-unverified attempts must not be deleted before reconciliation.
- Raw provider payloads and report attachments in provider-event records: prohibited.

## Enablement blocker

Automated retention/deletion jobs, provider contractual terms, data-processing agreements, region selection and provider-console retention settings require a separate production-enablement security PR. That deferral is acceptable only while the database security gate remains unsatisfied; satisfying the gate before those controls are approved is prohibited.
