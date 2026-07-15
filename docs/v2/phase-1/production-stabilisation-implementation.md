# V2 Phase 1 — Production stabilisation implementation

## Boundary

This implementation is manual and synchronous. It reuses deterministic assembly, content selection, HTML templating and PDF rendering. It does not call AI, start a workflow, process payment webhooks or send real email. Phase 14 remains disabled and migration 0017 is neither referenced by the Phase 1 runtime nor required by migration 0018.

## Generation lifecycle

The protected route validates the current admin role, loads the order and completed locked score, validates the paid-product entitlement, and then calls `claim_manual_report_generation`. The RPC:

- requires an active `platform_admin`, `reviewer` or `approver` profile;
- rechecks order and assessment eligibility;
- reuses a stable request key for replay safety;
- returns the existing active attempt when another request won the race;
- relies on a partial unique index for exactly one `REPORT_QUEUED` or `REPORT_GENERATING` attempt per order;
- returns an existing ready report for normal Generate requests;
- restricts explicit regeneration to `platform_admin` and `approver`.

The synchronous runtime transitions queued → generating, renders the deterministic PDF, rejects empty/non-PDF output, uploads without overwrite, downloads the private object again, verifies size and SHA-256, and atomically creates the report and marks the attempt ready. Any error records `GENERATION_FAILED`, a safe category/message, retry count and technical reference. No full stack is persisted.

## Report versioning and storage

Version numbers are allocated while the order row is locked. A successful regeneration inserts a new `reports` row, points `supersedes_report_id` at the previous version and marks only the previous current version `superseded`. Earlier objects remain private and unchanged.

Migration 0018 adds explicit organisation, file name, MIME type, file size, storage status and verification timestamp to `reports`. The `generated-reports` bucket is reasserted as private and PDF-only. `REPORT_READY` is only committed after object read-back and checksum validation. Legacy rows are not assumed verified: an authorised Preview/Download performs read-back and atomically records verification before delivery becomes available.

## Access authorisation

Preview and download require:

1. a current authenticated admin session;
2. an existing permitted role (`platform_admin`, `reviewer`, `approver`, or `read_only_admin`);
3. an existing report;
4. an exact report/order-reference relationship;
5. verified private storage metadata;
6. an object that can be downloaded and whose size/checksum match the record.

The server then creates a 60-second signed link. Download links request a safe filename. Signed URLs are returned to the authorised caller but never persisted or logged. Distinct errors cover permission, missing record, missing object, path/binding mismatch, integrity failure and signed-link failure. Provider expiry enforces that an old URL cannot be reused; a new authorised request creates a new short-lived link.

## Delivery and notifications

Generation and delivery have separate tables and state machines. A ready report may have `DELIVERY_PENDING` or `DELIVERY_FAILED` without changing its report version.

Delivery defaults to `disabled`: the request is persisted and the UI says that no email was sent. Local tests may set the provider mode to `double` and select a controlled success or failure. The double never invokes a network provider. Failed delivery can be retried without generating another report; a successfully delivered report rejects duplicate delivery attempts.

Order creation records two idempotent `email_events`:

- `customer_order_confirmation` with order, product, amount, payment state, next step and MK contact;
- `admin_new_order_notification` with organisation/customer/contact, industry, score/maturity when available, product, amount, payment state, timestamp and a relative admin path.

Both use explicit `recorded_disabled` provider state. The R50,000 product wording says consultant review and engagement steps remain outstanding.

## Operational UI and observability

The order page shows payment, generation, attempt, version, storage, delivery, retry, error and timestamps. Client controls disable while running and every operation renders a result. The order list derives persisted queues for new, paid/no-report, queued, generating, failed, ready, pending, failed delivery and delivered orders, with five priority panels.

Every major transition writes an order event. Generation and access also write report/audit events; delivery and notifications write observable email events. Runtime logs use request/order/report/attempt/status/category/reference fields and omit tokens, URLs, credentials and stack traces.

## Why migration 0018 is necessary

Existing production-compatible tables could represent orders, reports and generic events, but could not enforce one active manual generation attempt, preserve request-level failure/retry state, represent delivery independently, or state that a stored object was verified with MIME/size/organisation linkage. Migration 0018 adds only those gaps. It preserves existing rows and backfills legacy report metadata where the base fields prove a stored object was intended.

It does not copy the dormant Phase 14 design, create autonomous fulfilments, create AI/provider gates or enable feature policies.
