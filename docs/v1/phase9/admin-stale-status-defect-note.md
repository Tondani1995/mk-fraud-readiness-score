# Phase 9 Admin Stale Status Defect

Admin UAT confirmed the backend status update works correctly, but the order-detail page displayed the previous status after redirect/refresh.

Evidence from UAT:

- Order `MKORD-2026-NI6SED9S` was updated through the admin UI to `payment_received`.
- Supabase confirmed the order row status was `payment_received`.
- `verified_at` was populated.
- Admin note was saved.
- `admin_status_updated` order event was written.
- `manual_eft_order_status_updated` audit log was written.
- Report rows remained `0`.
- Report events remained `0`.

Defect classification:

- Backend: pass.
- Audit/event trail: pass.
- Phase 10 boundary: pass.
- Admin UI freshness after status update: fail.

Fix approach:

- Force dynamic rendering for admin order list/detail pages.
- Disable revalidation on those admin routes.
- Mark order list/detail service reads as no-store.
- Revalidate admin order paths after successful status update.

PR #12 remains draft until this is redeployed and UAT confirms the admin page shows `payment received` after redirect/refresh.
