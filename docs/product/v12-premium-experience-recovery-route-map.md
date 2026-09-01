# V1.2 Premium Experience Recovery: Route Map

This map records the customer journey owned by the recovered implementation. The route graph is
shared between the legacy public entry alias and the primary Fraud Readiness entry so the visual
system, copy rules and responsive behaviour cannot drift between routes.

## Public entry

| Surface | Route | Owner | Contract |
| --- | --- | --- | --- |
| Home hero | `/` | `src/components/website/Home/HeroSection.tsx` | Assessment CTA and Fraud Readiness options CTA |
| Fraud Readiness | `/fraud-readiness` | `src/app/(website)/fraud-readiness/page.tsx` | Shared premium storefront |
| Fraud Readiness Score alias | `/fraud-readiness-score` | `src/app/(website)/fraud-readiness-score/page.tsx` | Same shared premium storefront |
| Assessment start | `/score/start` | `src/app/score/start/page.tsx` | Terms gate, minimal organisation profile, adaptive start |
| Public Advisory | `/fraud-readiness/advisory` | `src/app/(website)/fraud-readiness/advisory/page.tsx` | Context-free Advisory enquiry |

The storefront is `FraudReadinessStorefront`. Its three product visuals are the shared
`ProductTierCard` variants: Essential for Diagnose, Comprehensive for Design, and Advisory for
Implement. Prices and inclusions come from `COMMERCIAL_CATALOGUE`; the storefront does not own a
second price or entitlement contract.

## Private assessment and result

| Surface | Route | Owner | Contract |
| --- | --- | --- | --- |
| Tailored assessment | `/score/adaptive/[assessmentRef]?token=...` | `AdaptiveAssessmentExperience` | Private token, server-confirmed saves, current-area progress |
| Snapshot | `/score/snapshot/[assessmentRef]?token=...` | `SnapshotResult` | Persisted result, full-circle score gauge, next-step ladder |
| Paid order | `/score/order/new?ref=...&tier=...&token=...` | `OrderJourney` | Essential or Comprehensive order creation and invoice-aware confirmation |
| Snapshot-linked Advisory | `/score/advisory/[assessmentRef]?token=...` | `AdvisoryEnquiryForm` | Private Snapshot context carried into the enquiry |

The adaptive assessment keeps internal applicability and scoring calculations, but its customer
progress surface exposes a percentage and current area rather than a fixed question denominator.
The legacy native engine is retained for its existing route contract and uses the same customer-safe
progress language.

## Evidence boundary

Evidence for owner review must be captured from the READY Vercel preview whose
`githubCommitSha` equals the GitHub branch HEAD for this implementation. The mobile set includes
320px, 375px or 390px, and 430px widths. Snapshot score evidence covers 100, 60 and 20, including
the Not issued state where applicable. No screenshot from Production or an earlier preview is a
candidate for certification.

Production remains pinned to the owner-provided release SHA. This recovery changes customer UI and
supporting documentation only; it does not change Production, Supabase, report generation or the
existing Puppeteer vulnerability disposition.
