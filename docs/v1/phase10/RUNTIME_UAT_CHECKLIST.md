# Phase 10 Runtime UAT Checklist

Run only after PR #12 / Phase 9 current-head UAT has passed.

1. Confirm production/staging DB has `0011_phase10_pdf_report_engine_additions` applied.
2. Confirm `generated-reports` bucket is private.
3. Create or use a fresh assessment with a linked order.
4. Mark the order `payment_received` through the admin order page.
5. Generate a report from the order-detail page.
6. Confirm a new `reports` row exists with `template_id`, `score_run_id`, `storage_bucket`, `storage_path`, `checksum`, `generated_by` and `generated_at`.
7. Generate a second report and confirm the previous version is superseded, not overwritten.
8. Confirm `report_events` and `audit_logs` are written.
9. Download through the admin route and confirm a short-lived signed URL is used.
10. Confirm unpaid or awaiting-payment orders cannot generate reports.
11. Confirm the PDF does not expose customer-facing internal codes.
12. Visually inspect the PDF against the premium MK report standard.

Current branch state: not yet passed.
