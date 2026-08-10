# Comprehensive product code — decision and evidence (MP-101)

**Question the brief posed:** can the existing `mk_validated_assessment` product code be safely
migrated/aliased to Comprehensive (option A), or is a new Comprehensive product code required
(option B)? "Do not guess."

**Decision: A — migrate in place. The Comprehensive product code is `mk_validated_assessment`.**

---

## Evidence

Read-only `SELECT` against both environments on 2026-08-10:

```sql
select p.product_code, p.name, p.price_cents, p.active,
       (select count(*) from public.orders o where o.product_id = p.id) as order_count
from public.products p order by p.display_order;
```

| Environment | product_code | name (before) | price_cents (before) | **order_count** |
|---|---|---|---|---|
| Production `jvjxlphdyzerrhwcgkup` | `free_snapshot` | Free Snapshot | 0 | 0 |
| Production | `essential_self_assessment` | Essential Self-Assessment Report | 500000 | 23 |
| Production | `mk_validated_assessment` | Comprehensive MK-Validated Assessment | 5000000 | **0** |
| Staging `penhenkzfrtmcxklodtu` | `free_snapshot` | Free Snapshot | 0 | 0 |
| Staging | `essential_self_assessment` | Essential Self-Assessment Report | 500000 | 12 |
| Staging | `mk_validated_assessment` | Comprehensive MK-Validated Assessment | 5000000 | **0** |

**Zero orders reference `mk_validated_assessment` in either environment.**

## Why that evidence settles it

1. **There is no historical order snapshot to preserve.** The instruction not to delete historical
   data compatibility without evidence is satisfied: the evidence is that no order, in any
   environment, has ever referenced this product. Nothing downstream can break.
2. **Option B would leave a live R50,000 contract behind.** A new Comprehensive row alongside an
   `active = true`, `requires_payment_verification = true`, R50,000 `mk_validated_assessment` row
   is exactly the "current customer-facing R50k product contract survives" state the launch tests
   forbid. Deactivating the old row and adding a new one is strictly more moving parts than
   repricing the row that is already correct in every respect except price and label.
3. **The row's non-price attributes were already right for Comprehensive.**
   `delivery_mode = 'mk_led_validated_engagement'` and `requires_payment_verification = true` are
   what a reviewer-led, evidence-validated engagement needs. Only `price_cents` (5000000 → 3500000)
   and `name` ("Comprehensive MK-Validated Assessment" → "Comprehensive") change.
4. **The internal code is not the customer-facing name.** The catalogue deliberately separates
   `productCode` (machine identity, stable) from `label` (customer-facing, free to change). Keeping
   `mk_validated_assessment` as the internal identity while the customer sees "Comprehensive" is
   the separation working as intended, not a leak of the old product into the new one.
5. **`report_type` already contains `mk_validated`.** A new product code would create a second
   identity for the same concept next to an enum value that already names it.

## What Comprehensive is NOT

Comprehensive is **not** a renamed R50,000 personalised report. It is a R35,000 paid product with
its own order, its own payment verification, its own lifecycle
(`public.comprehensive_engagements`) and its own evidence intake. The R50,000 personalised-report
**enquiry** flow is a separate, manual, non-platform path and is left exactly as it was — see
[legacy-commercial-reference-inventory.md](./legacy-commercial-reference-inventory.md).

## Migration compatibility

`supabase/migrations/20260810120000_joint_launch_product_catalogue.sql` records the R50,000 window
as a closed `product_price_versions` row (`version_number = 1`, `effective_to = <cutover>`) rather
than discarding it, so the product carries a continuous, auditable price history even though no
order ever used that window.
