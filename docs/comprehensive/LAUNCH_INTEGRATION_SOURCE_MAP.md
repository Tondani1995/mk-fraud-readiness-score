# Comprehensive launch integration source map

This map is the launch-closure source of truth for the active automated Comprehensive journey. The
frozen analytical/report core remains authoritative in `PRODUCT_DESIGN_FREEZE_v1.1.md`,
`src/lib/reports/comprehensive/product-contract.ts`, and the certified assembly, management-model,
renderer, interpretation and validator modules.

## Active journey

```text
assessment completed
  -> Comprehensive selected
  -> create_paid_order (R35,000 versioned entitlement)
  -> payment verified
  -> manual_report_generation_attempt queued/claimed
  -> phase1-manual-fulfilment
       -> frozen Comprehensive assembly + one bounded interpretation
       -> PDF from the Comprehensive renderer
       -> XLSX from the same deterministic Comprehensive delivery model
       -> private Storage upload + byte/checksum verification for both files
       -> finalise_comprehensive_report_package
  -> automatic_release_completed_fulfilment
       -> payment/score/PDF/recipient/entitlement gates
       -> exact PDF + XLSX version binding
       -> report release and automatic delivery queue
  -> issue_customer_report_access_token
  -> customer status/download view
       -> PDF or supporting-register XLSX only
```

| Boundary | Active source | Launch invariant |
| --- | --- | --- |
| Product and price | `src/lib/commercial/product-catalogue.ts`, `src/lib/reports/comprehensive/product-contract.ts`, launch migration | Comprehensive is self-service, `automated_analytical`, R35,000 incl. VAT, `mk_controlled_pdf`. |
| Order | `src/lib/commercial/order-service.ts`, `create_paid_order` | Exact product/price-version snapshot; no reviewed-engagement row is needed or created. |
| Payment trigger | `src/app/score/api/internal/fulfilment-worker/route.ts` and payment-verification RPCs | Verified payment queues the existing fulfilment attempt; no reviewer state is consulted. |
| Analytical generation | `src/lib/reports/comprehensive/manual-generation.ts` | Frozen deterministic source model, one current interpretation architecture, no customer evidence intake. |
| Report package | `src/lib/reports/phase1-manual-fulfilment.ts`, `src/lib/reports/supporting-register-delivery.ts` | PDF and Comprehensive six-register XLSX are independently stored and verified before finalisation. |
| Atomic finalisation | `finalise_comprehensive_report_package` | One report, one register, exact order/report/version binding, `engagement_id` null. The forward RPC-contract migration deliberately renames the historical PostgreSQL-truncated routine to this 37-byte application identifier. |
| Release | `automatic_release_completed_fulfilment` | Existing payment/score/PDF/recipient gates plus exactly one verified Comprehensive register. |
| Customer lifecycle | `src/lib/commercial/customer-order-status.ts`, `CustomerOrderStatusWorkspace.tsx` | Automated status/readiness/delivery only. |
| Customer access | `src/lib/reports/customer-report-access.ts`, `/score/report/access/[token]` | Possession token is bound to order/report; PDF and supporting XLSX only; legacy selectors reject. |
| Operations | `ComprehensiveOperationsWorkspace.tsx`, commercial order-state route | Operations sees automated generation/release/delivery state only. |

## Retired reviewed-engagement exposures found and closed

1. `create_paid_order` created and deduplicated through `comprehensive_engagements`. The later launch
   migration replaces the function body with product-bound order deduplication; the historical table
   remains for legacy compatibility only.
2. `phase1-manual-fulfilment.ts` rendered the Comprehensive PDF and then re-entered
   `buildAndStoreSupportingRegister`, which produced the Essential workbook. Comprehensive now uses
   `renderComprehensiveReportPackage` and `storeVerifiedRegisterWorkbook`, then its own atomic
   finaliser.
3. `phase14_delivery_entitlement` enforced the old Essential-only product/price pair. It now accepts
   the two exact report/product pairs and resolves price through the immutable order version.
4. The automatic release gate had no Comprehensive register release invariant. It now requires the
   exact null-legacy-binding register and releases it after the existing delivery gate passes.
5. `customer-order-status.ts` read engagement state, uploaded evidence, reviewer assignment and
   sign-off before issuing a customer token. It now reads order, attempt, report, artifact and
   delivery-authorisation state only.
6. `CustomerOrderStatusWorkspace.tsx` exposed reviewed lifecycle concepts and five package selectors.
   It now shows payment, automated readiness and two secure downloads.
7. The Comprehensive admin page imported `ComprehensiveReviewWorkspace`, which exposed the retired
   reviewer/evidence/sign-off workflow. It now imports `ComprehensiveOperationsWorkspace`.
8. The commercial order-state route imported the legacy engagement authorisation helper. It now reads
   the automated order state directly.
9. Customer access queried engagement delivery/sign-off and could serve board, presentation and
   workshop selectors. It now checks the exact product/report/version binding and serves only PDF or
   supporting-register XLSX.
10. `artifact-contract.ts` required five reviewed-engagement artifacts. The active contract now
    requires exactly `main_report_pdf` and `supporting_register_xlsx`.

The old `src/lib/comprehensive/*` engagement, evidence, review-record and five-artifact modules and
their admin routes remain available only for Advisory/legacy database compatibility. They are not
imported by active Comprehensive order creation, fulfilment, status, release or customer access.
