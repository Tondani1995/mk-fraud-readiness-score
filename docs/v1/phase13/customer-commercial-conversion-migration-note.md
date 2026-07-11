# Phase 13 PR B Migration Note

Migration file:

- `supabase/migrations/0014_phase13_customer_commercial_conversion.sql`

## Purpose

The migration adds additive fields to `public.data_requests` so a private-snapshot respondent can submit a controlled personalised report enquiry.

## Added Fields

- `request_reference text`
- `primary_reason text`
- `areas_of_focus text[] not null default '{}'::text[]`
- `preferred_contact_method text`
- `preferred_consultation_timeframe text`
- `consent_contact boolean not null default false`
- `updated_at timestamptz not null default now()`

## Indexes and Guards

- Unique non-null `request_reference` index.
- Request type/status/created index for admin queue filtering.
- Assessment, organisation, created-at and updated-at indexes.
- Unique active personalised enquiry guard per assessment for `received`, `open` and `in_review` requests.
- Check constraints for controlled reason, contact method, timeframe and enquiry reference format.

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

## Production Status

Not applied by this PR task. Apply only through the controlled production migration process after PR review and approval.
