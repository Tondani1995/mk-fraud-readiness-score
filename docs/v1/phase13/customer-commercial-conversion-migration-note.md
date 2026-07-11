# Phase 13 PR B Migration Note

Migration file:

- `supabase/migrations/0014_phase13_customer_commercial_conversion.sql`

## Purpose

The migration adds additive fields to `public.data_requests` so a private-snapshot respondent can submit a controlled `Advanced Personalised Fraud Readiness Report` enquiry.

## Added Fields

- `request_reference text`
- `primary_reason text`
- `areas_of_focus text[] not null default '{}'::text[]`
- `preferred_contact_method text`
- `preferred_consultation_timeframe text`
- `consent_contact boolean not null default false`
- `updated_at timestamptz not null default now()`

## Controlled Choices

Primary reason values:

- `understand_control_weaknesses`
- `design_strengthen_programme`
- `respond_incident_audit_control`
- `prepare_governance_response`
- `review_policies_controls`
- `other`

Focus area values:

- `fraud_governance_oversight`
- `fraud_risk_identification_assessment`
- `operational_fraud_controls`
- `third_party_supplier_procurement_risk`
- `digital_identity_channel_fraud`
- `fraud_monitoring_detection`
- `incident_response_investigations`
- `fraud_culture_awareness`
- `other`

Contact methods:

- `email`
- `phone`
- `video_meeting`

Consultation timeframes:

- `within_one_week`
- `within_two_weeks`
- `within_one_month`
- `exploring_options`

## Indexes and Guards

- Unique non-null `request_reference` index.
- Request type/status/created index for admin queue filtering.
- Assessment, organisation, created-at and updated-at indexes.
- Unique active personalised enquiry guard per assessment for `received`, `open` and `in_review` requests.
- Check constraints for controlled reason, focus areas, contact method, timeframe and enquiry reference format.

## Security Boundary

- RLS remains enabled on `public.data_requests`.
- `anon` and `authenticated` grants are revoked.
- Admin reads continue through authenticated admin routes and server-side service-role access.
- Respondent writes go through private snapshot-token validated server routes only.

## Explicit Non-Scope

The migration does not touch:

- methodology tables
- scoring tables
- score results
- report tables
- order creation logic
- existing assessment outcomes

It does not create orders, reports, report unlocks, payment obligations, PDF generation, payment gateways or proof-upload features.

## Production Status

Not applied by this PR task. Apply only through the controlled production migration process after PR review and approval.

## Evidence

V1 Verification run #379 passed on implementation head `06a64b2640ecd94f97ef2240abed4b8752f9847d`. Supabase migration application and advisors remain outstanding.
