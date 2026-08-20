# Legacy R50,000 / personalised-report reference inventory (brief §8)

Every remaining reference to R50,000, "personalised report", `personalised_report_50000`,
`mk_validated_assessment` and "From R50,000", classified as:

- **A — migrate to Comprehensive R35k**
- **B — historical compatibility only** (readable fact; nothing current writes it)
- **C — remove**

**Captured after the joint-launch changes on branch `parallel/joint-launch-core-products`.**

---

## The one decision that drives most of this

**The R50,000 personalised-report enquiry is NOT Comprehensive.** Comprehensive is a R35,000 paid
product with its own order, payment verification, lifecycle and evidence intake. The
personalised-report enquiry is a manual, non-platform consulting intake — commercially it is the
Advisory path, which this lane is explicitly told not to build. So the enquiry flow is left
functioning exactly as it was rather than being renamed into Comprehensive, and its identifiers are
classified **B**, not **A**. Renaming it would have made the platform claim a manual consulting
enquiry was a paid Comprehensive engagement.

---

## A — migrated to Comprehensive R35k

| Reference | Location | What changed |
|---|---|---|
| `mk_validated_assessment` product row, R50,000, "Comprehensive MK-Validated Assessment" | `public.products` | Repriced in place to 3,500,000 cents and relabelled "Comprehensive". Evidence for migrating rather than minting a new code: zero orders reference it in Production or Staging — see [comprehensive-product-code-decision.md](./comprehensive-product-code-decision.md). |
| `advisory_price <> 5000000` replay assertion | `scripts/phase14-migration-replay-assertions.sql:476` | Now asserts Comprehensive at 3,500,000, Essential at 750,000, exactly one open price version per product, and that **no active product carries an R5,000 or R50,000 price**. |
| `'mk_validated_assessment'` hard-coded in the entitlement rejection message | `src/lib/reports/report-entitlement.ts` | Replaced by `COMPREHENSIVE_PRODUCT_CODE` from the authoritative catalogue; the message now describes the reviewer-led workflow instead of "the R50,000 personalised engagement". |
| `'mk_validated_assessment'` hard-coded in the order-notification next step | `src/lib/notifications/phase1-order-notifications.ts:36` | Replaced by `COMPREHENSIVE_PRODUCT_CODE`; the copy now describes evidence intake, named-reviewer validation and sign-off. |
| `COMMERCIAL_OPTION_CODES.fullReport` (`full_report_5000`) at every current call site | `src/lib/orders/manual-eft-orders.ts`, `src/components/assessment/FreeSnapshot.tsx`, commercial-event route | Current code now writes the tier code `essential`. The old value survives only as `legacyFullReport` for reading historical rows. |
| `full_report_5000_selected` event emitted by current code | `src/components/assessment/FreeSnapshot.tsx`, commercial-event route | Current code emits `essential_selected`. The commercial-event route still **accepts** the legacy name from an already-deployed client and translates it, but never persists under it. |
| `'R50,000 personalised engagement'` entitlement test case | `scripts/phase14-autonomous-report-tests.mjs` | Relabelled "Comprehensive order cannot claim the Essential report" — the assertion (that the product code is rejected) is unchanged and still passing. |

## B — historical compatibility only

Nothing in this group is written by any current code path. Each exists because rows carrying the
value already exist in Production or Staging and must stay readable.

| Reference | Location | Why it must stay |
|---|---|---|
| `'full_report_5000_selected'`, `'personalised_report_50000_selected'` in the event-type union | `src/lib/analytics/assessment-events.ts` | `public.assessment_events` rows already carry these values. Removing them from the union would make existing rows untypeable. |
| Same two values in the DB check constraint | `supabase/migrations/20260810120000_joint_launch_product_catalogue.sql` (rewritten constraint) | Dropping them from the allowlist would not delete the rows, it would only make the constraint un-appliable. The rewritten constraint keeps both and adds the tier-named events. |
| Same two values in `InternalNotificationType` | `src/lib/notifications/internal-notifications.ts` | Queued/sent `email_events` rows already carry them. |
| `COMMERCIAL_OPTION_CODES.legacyFullReport`, `.legacyPersonalisedReport` | `src/lib/snapshot/commercial-insights.ts` | Renamed from `fullReport`/`personalisedReport` so the legacy nature is visible at every call site rather than hidden. `CURRENT_COMMERCIAL_OPTION_CODES` names the only two a current path may write. |
| `request_type = 'personalised_report_50000'` and its five check constraints | `supabase/migrations/0014_phase13_customer_commercial_conversion.sql`, `src/lib/admin/personalised-enquiries.ts`, `src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts` | The literal is the discriminator for the existing enquiry constraints and index. Changing it needs a data migration of live `data_requests` rows for a flow this lane does not own. |
| The personalised-report enquiry route, admin enquiry pages and `personalised-enquiries.ts` | `src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts`, `src/app/score/admin/enquiries/**`, `src/lib/admin/personalised-enquiries.ts` | The manual advisory enquiry path, unchanged and still working. It creates no order, no payment obligation and no report — it already records `payment_obligation: false, order_created: false`. |
| `'From R50,000 including VAT'` customer copy and the enquiry form | `src/components/assessment/FreeSnapshot.tsx` | Customer-facing copy. This lane does not own customer UI; the copy change belongs to the UI lane alongside the Comprehensive/Advisory presentation. **Flagged for that lane** — see "Known gap" below. |
| `'From R50,000 including VAT'` inside the Phase 13 migration's settings note | `supabase/migrations/0014_phase13_customer_commercial_conversion.sql:121` | An applied historical migration. Editing an applied migration's payload would break the accepted-checksum verification. |
| `report_type` enum value `mk_validated` | `supabase/migrations/0001_phase2_v1_1_schema_rls.sql` | Enum values cannot be removed without a type rewrite, and the value correctly names the Comprehensive report type. |
| `r50000_automation_enabled` Phase 14 safety flag (must be `false`) | `public.app_settings` | A disabled-automation assertion, not a product contract. |

## C — removed

| Reference | Location | Why removal was safe |
|---|---|---|
| `ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS = 500000` | `src/lib/reports/report-entitlement.ts` | The whole point of the versioned price contract: entitlement no longer compares against any hard-coded amount. Verified by `joint-launch:test-product-contract` ("the catalogue is the only place a price literal lives"). |
| `getDefaultDetailedReportProduct()` — "first active payment-verified product by display_order" | `src/lib/orders/manual-eft-orders.ts` | Only ever correct while Essential happened to be the lowest-ordered paid product. With Comprehensive now also active and payment-verified, a display-order change would have silently sold the wrong product. Replaced by an explicit lookup on `ESSENTIAL_PRODUCT_CODE`. |
| `if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000` in `phase14_generation_entitlement` and `phase14_delivery_entitlement` | `supabase/migrations/20260810123000_joint_launch_versioned_price_entitlement.sql` | **The same bug, in SQL.** Two live SECURITY DEFINER functions pinned the R5,000 price and read `products.price_cents` at call time, so the reprice would have broken automatic release and delivery for BOTH new R7,500 orders and every already-paid R5,000 order. Both now delegate to `public.order_price_version_entitled(order_id)`, the SQL mirror of the TypeScript contract. The migration rewrites only that predicate (via `pg_get_functiondef`, preserving every other line byte-for-byte) and fails if any function still pins a price literal. 0017 originally installed the same predicate in `assert_premium_report_generation_entitlement` and `assert_premium_report_delivery_entitlement`, but a full replay of the committed chain confirms later migrations replaced both bodies and neither carries a price check any more. |
| The live-catalogue-price entitlement check (`productPriceCents !== <constant>`) | `src/lib/reports/report-entitlement.ts` | A catalogue reprice must never invalidate a legitimately paid order. `productPriceCents` is retained on `AssembledReportData` for diagnostics but is no longer an entitlement input. |
| `'R5,000 including VAT'` / `'From R50,000 including VAT'` as the *current* product contract in the replay assertions | `scripts/phase14-migration-replay-assertions.sql` | Superseded by the joint-launch assertions. |

---

## Known gap deliberately left for the UI lane

`src/components/assessment/FreeSnapshot.tsx` still presents the second commercial option as the
"From R50,000" personalised-report enquiry. Its option codes and analytics events were corrected
(Essential is now `essential` / `essential_selected`), but the **customer-facing copy, the pricing
shown, and the choice between Comprehensive and Advisory are UI decisions this lane does not own**
(brief §"It does NOT own: generic customer UI redesign"). The server contracts the UI needs are in
place and documented:

- `GET /score/api/commercial/products` — the full tier ladder with prices, including Advisory marked `selfServiceOrderable: false`
- `POST /score/api/assessments/{ref}/paid-order` with `{ tier: 'essential' | 'comprehensive' }`

Until the UI lane wires those up, no customer can reach Comprehensive from the snapshot page. That
is a presentation gap, not a contract gap.
