# R5,000 Essential order disposition — READ-ONLY evidence (MP-031)

**Captured:** 2026-08-10
**Method:** read-only `SELECT` statements against both Supabase environments via the Supabase MCP
`execute_sql` tool. No `INSERT`, `UPDATE`, `DELETE` or DDL was issued. **No order was modified.**
**Reproduce:** `node scripts/joint-launch-r5k-disposition-report.mjs --environment <env> --json`
(that script refuses to run if its own source contains a mutation).

**Disposition is the owner's decision.** Every row below is recorded as
`PENDING_OWNER_DECISION`. This lane makes no recommendation about complete / cancel / refund /
explicitly honour, and changes none of these rows.

---

## Why these orders keep working after the R7,500 migration

Every order below carries `amount_cents = 500000`, created between 2026-07-09 and 2026-07-25 —
i.e. strictly before the joint-launch cutover instant. Under the versioned price contract
(`public.product_price_versions`) each one resolves to the superseded Essential window, which
priced Essential at R5,000 for exactly that period. They remain entitled without any standing
"R5,000 is always acceptable" allowance, and none of them was rewritten to do it: their
`product_price_version_id` is deliberately left `null`.

---

## Production — `jvjxlphdyzerrhwcgkup`

**23 orders. 23 of 23 are `essential_self_assessment` at ZAR 500000. Total orders in the database: 23** — so every order that exists in Production is an R5,000 Essential order.

| # | Order reference | Organisation | Status | Paid | Reports | Delivered | Commercially active |
|---|---|---|---|---|---|---|---|
| 1 | MKORD-2026-NI6SED9S | MK Phase 9 UAT 20260709 | payment_received | yes | 0 | no | yes |
| 2 | MKORD-2026-1NMUW1N9 | MK Phase 9 Current Head UAT Pty Ltd | payment_received | yes | 0 | no | yes |
| 3 | MKORD-2026-KDV20GFY | MK Current Head UAT 576188 Pty Ltd | payment_received | yes | 3 | no | yes |
| 4 | MKORD-2026-ZBXNWRTF | MK Phase11 Security UAT 20260709194213 | payment_received | yes | 1 | no | yes |
| 5 | MKORD-2026-GE6G3YHX | MK Phase11 Direct POST UAT 20260709195804 | awaiting_payment | no | 0 | no | yes |
| 6 | MKORD-2026-EBPPMK0O | MK Phase12 Launch UAT 20260709205410 | payment_received | yes | 1 | no | yes |
| 7 | MKORD-2026-RA8NDL3F | MK Phase12 Scenario A | payment_received | yes | 1 | no | yes |
| 8 | MKORD-2026-B8J3LVGG | MK Phase12 Scenario B | payment_received | yes | 1 | no | yes |
| 9 | MKORD-2026-HOLRQBBR | MK Phase12 Scenario C | payment_received | yes | 1 | no | yes |
| 10 | MKORD-2026-LCOGJ2O2 | MK Phase12 Scenario D | payment_received | yes | 1 | no | yes |
| 11 | MKORD-2026-8IKGHJQH | MK Phase12 Scenario E | payment_received | yes | 1 | no | yes |
| 12 | MKORD-2026-7UAQKD7V | MK Phase12 Scenario F | payment_received | yes | 1 | no | yes |
| 13 | MKORD-2026-WNIIUZIB | MK Phase12 Scenario G | payment_received | yes | 1 | no | yes |
| 14 | MKORD-2026-EHA5IMFJ | MK Phase12 Scenario H | payment_received | yes | 1 | no | yes |
| 15 | MKORD-2026-48GWZDLZ | MK Phase12 Scenario I | payment_received | yes | 1 | no | yes |
| 16 | MKORD-2026-4U84FNMQ | MK Phase13 Runtime UAT 20260710221644 | payment_received | yes | 1 | no | yes |
| 17 | MKORD-2026-I05K5UI6 | MK Phase13 PRB Runtime UAT 20260711214237 | awaiting_payment | no | 0 | no | yes |
| 18 | MKORD-2026-N4QV17BC | MK Phase13 PRB Runtime UAT 20260711214916 | awaiting_payment | no | 0 | no | yes |
| 19 | MKORD-2026-7LT7KO4P | MK Commercial PRB Runtime UAT 20260711215125 | payment_received | yes | 0 | no | yes |
| 20 | **MKORD-2026-2Z8TUKGH** | **MK Assist** | payment_received | yes | 6 (1 generated, 5 superseded) | no | yes |
| 21 | **MKORD-2026-24VM28YM** | **WFS** | payment_received | yes | 2 (1 generated, 1 superseded) | no | yes |
| 22 | MKORD-2026-YXL7D5UD | MK Resend Preview Test | awaiting_payment | no | 0 | no | yes |
| 23 | MKORD-2026-960J4HDD | MK Resend Preview Test 2 | awaiting_payment | no | 0 | no | yes |

**Production totals:** 23 orders · 18 paid · 5 unpaid (`awaiting_payment`) · **0 delivered** · 23 commercially active · 0 with a backfilled price version.

### Delivery evidence (why "delivered" is `no` everywhere)

- `public.reports` in Production contains **only** `generated` (15) and `superseded` (8) rows.
  **Zero** reports are in `released` or `approved`.
- `public.manual_report_delivery_attempts` has **zero** rows for any R5,000 order.
- `public.email_events` across the whole Production database: 71 `queued`, 2 `sent`,
  2 `recorded_disabled`.

A report existing in `generated` means the PDF was produced, not that it reached a customer.
Delivery is therefore reported as **not delivered** for all 23.

### The two rows that are not obviously test data

Rows 1–19 and 22–23 carry organisation names that are self-evidently UAT/scenario/preview
fixtures (`... UAT ...`, `Scenario A–I`, `Resend Preview Test`). Only two are not:

- **MKORD-2026-2Z8TUKGH — "MK Assist"** (2026-07-15, paid, 1 generated + 5 superseded reports, not delivered)
- **MKORD-2026-24VM28YM — "WFS"** (2026-07-15, paid, 1 generated + 1 superseded report, not delivered)

These are the two the owner most likely needs to decide about deliberately. This lane does not
classify them further — there is no field in the database that marks an order as synthetic, so
"looks like test data" is an inference from the organisation name and nothing more.

---

## Staging — `penhenkzfrtmcxklodtu`

**12 orders, all `essential_self_assessment` at ZAR 500000, all `payment_received`.** Total orders
in the database: 12. Created 2026-08-03 → 2026-08-07. Every organisation name is a certification
or QA fixture (`MK Synthetic Certification Test`, `MKG29-QA-...`, `PRE-G30-...`, `MKTEST-RC1-...`,
`MK Journey 6 Adaptive Certification Ltd`, `MKTST Integrated Services (Pty) Ltd`).

3 of the 12 have a report in a released/approved state (MKORD-2026-O8E19UPV,
MKORD-2026-72BCEIDN, MKORD-2026-FJH0FU1T).

Staging is not customer-facing and carries no commercial obligation.

---

## What this lane did and did not do

| | |
|---|---|
| Orders read | 35 (23 Production + 12 Staging) |
| Orders modified | **0** |
| Rows inserted/updated/deleted in either environment | **0** |
| Migrations applied to Production or Staging | **0** |
| `orders.product_price_version_id` backfilled | **0** (deliberately left null on all historical rows) |
