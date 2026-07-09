# Admin Status Refresh Fix

This note records the follow-up fix for the Phase 9 admin UAT defect where the backend order status changed to `payment_received`, but the admin order detail page still rendered the old `awaiting_payment` value after redirect/refresh.

The intended fix is to make the admin order pages and order data access explicitly dynamic/no-store, and to revalidate the relevant admin order paths after a status update.

PR #12 remains draft until current-head UAT confirms the admin UI displays the refreshed status after update.
