# Supabase Advisor Inventory - PR #19 Platform and Database Hardening

Production project inspected: `jvjxlphdyzerrhwcgkup`.

Advisor data was refreshed during PR #19. The migration prepared in this PR was **not** applied.

Supabase changelog review: current 2026 database/API breaking-change entries include Data API exposure defaults and security/dashboard updates. Nothing in that review changed this PR's conservative posture: fix only narrowly proven items, document the rest, and do not add broad public access.

## Summary

Implemented in migration `0016_platform_database_hardening.sql`:

- `public.set_updated_at()` explicit `search_path = public`.
- `admin_profiles_select` `auth.uid()` wrapped as `(select auth.uid())` for the Supabase auth init-plan finding.
- Two evidence-backed FK indexes:
  - `reports_order_id_idx` on `public.reports(order_id)`.
  - `assessment_answers_question_id_idx` on `public.assessment_answers(question_id)`.

Parked/documented:

- service-role-only RLS tables with no policies;
- public `citext` relocation;
- `current_admin_role()` / `is_admin_role(...)` security-definer helper redesign;
- leaked-password protection dashboard setting;
- remaining unindexed FK notices;
- repeated multiple-permissive-policy pattern.

## Security Advisors

| Category | Severity | Affected objects | Current purpose | Predates PR #19 | Actual risk | Action | Test evidence |
|---|---:|---|---|---|---|---|---|
| RLS enabled with no policies | INFO | `public.assessment_tokens`, `public.rate_limit_hits` | Server-side token lifecycle and rate-limit bookkeeping | Yes | Ordinary `anon`/`authenticated` roles have broad table privileges from Supabase defaults, but both roles have `rolbypassrls = false`; RLS is enabled and zero policies means ordinary roles default-deny. `service_role`/`postgres` bypass RLS for backend/server administration. | Parked as intentional service-role-only design. Do not add permissive policies merely to silence advisor. | SQL confirmed RLS enabled, zero policies, `anon`/`authenticated` no BYPASSRLS, `service_role`/`postgres` BYPASSRLS. Source search found `assessment_tokens` used by server respondent-token utilities; `rate_limit_hits` appears only in migration/docs. |
| Function search path mutable | WARN | `public.set_updated_at()` | Generic updated-at trigger helper | Yes | Search-path risk is real but narrow. Function body only assigns `new.updated_at = now()` and returns `new`; no table reads/writes or dynamic SQL. | Fixed in migration 0016 by recreating same signature/body with `set search_path = public`. | Function inventory confirmed previous `proconfig` empty, owner `postgres`, language `plpgsql`, not security-definer. Platform test asserts explicit search path. |
| Extension in public schema | WARN | `citext` extension | Case-insensitive email/contact columns | Yes | Moving an extension used by live columns can break casts, defaults and migrations if not sequenced carefully. | Parked for separate controlled extension-relocation migration. | SQL found `citext` columns on `admin_profiles.email`, `data_requests.requested_by_email`, `eft_settings.contact_email`, `email_events.recipient_email`, `orders.customer_email`, `respondents.email`. |
| Signed-in users can execute security-definer functions | WARN | `public.current_admin_role()`, `public.is_admin_role(admin_role[])` | Admin-role RLS helpers | Yes | These helpers are high-impact because they underpin admin-facing policies. `anon` cannot execute; `authenticated` can. In this app, respondents are accountless, while admin UI uses Supabase Auth sessions. | Audited and parked. Do not change security mode, ownership or grants in PR #19 without a dedicated admin-auth regression pass. | SQL confirmed owner `postgres`, `security_definer = true`, `search_path=public`, `anon_execute=false`, `authenticated_execute=true`. Policy scan shows repeated admin-policy dependency. |
| Leaked password protection disabled | WARN | Supabase Auth setting | Password compromise protection | Yes | Dashboard/auth configuration risk; SQL migration cannot fix it. Enabling can change login/signup outcomes. | Parked as dashboard configuration requiring owner approval, rollout and rollback plan. | Advisor output confirms disabled state. No password settings changed. |

## Performance Advisors

| Category | Severity | Affected objects | Current purpose | Predates PR #19 | Actual risk | Action | Test evidence |
|---|---:|---|---|---|---|---|---|
| Unindexed foreign keys | INFO | Repeated across `app_settings`, `assessment_answers`, `assessments`, `audit_logs`, `email_events`, `exposure_answers`, `maturity_cap_events`, `methodology_versions`, `orders`, `payment_proofs`, `questions`, `report_events`, `report_templates`, `reports`, `respondents` and related FK columns | Referential integrity across assessment, scoring, orders, reports, admin and notification tables | Yes | Potential delete/update/join overhead. Live tables remain small, and not every FK has demonstrated query pressure. | Implement only two source-evidenced indexes in migration 0016; park the rest. | Added `reports(order_id)` because admin report-generation logic filters by order. Added `assessment_answers(question_id)` because report assembly embeds `questions:question_id(...)`. Remaining FK notices need a dedicated query-plan pass. |
| Auth RLS init-plan | WARN | `admin_profiles_select` policy | Lets an admin see own profile or platform admin see all admin profiles | Yes | Per-row `auth.uid()` evaluation is a performance smell; the semantic row boundary is still valid. | Fixed in migration 0016 by changing `id = auth.uid()` to `id = (select auth.uid())`. | SQL showed existing policy. Migration preserves the same comparison and leaves `is_admin_role(...)` unchanged. Platform test asserts the scalar subquery. |
| Multiple permissive policies | WARN | Repeated on admin-managed tables including `admin_profiles`, `report_templates`, `reports`, `respondents`, `response_scale`, `score_runs` and other admin-facing configuration/result tables | Admin read policies plus platform-admin manage policies | Yes | Performance overhead and policy complexity, not automatically a data leak. Advisor reports the repeated pattern for many roles because permissive select and manage policies overlap. | Audited and parked as a class. Do not consolidate broad RLS without a dedicated route-by-route admin authorization test. | Representative policy scan confirms pattern: `*_admin_select` plus `*_platform_admin_manage` / manage policy. |
| Unused indexes | INFO | Existing indexes on event, email, data-request, respondent and order tables | Future/admin lookup paths and event queries | Yes | Advisor may report unused before production volume exists. Dropping could remove planned lookup support. | Parked. No index drops in PR #19. | No destructive index changes in migration 0016. |

## Affected Object Appendix

Security objects:

- `public.assessment_tokens`
- `public.rate_limit_hits`
- `public.set_updated_at()`
- `public.current_admin_role()`
- `public.is_admin_role(admin_role[])`
- `public` extension `citext`
- Supabase Auth leaked-password-protection setting

`citext` dependent columns:

- `public.admin_profiles.email`
- `public.data_requests.requested_by_email`
- `public.eft_settings.contact_email`
- `public.email_events.recipient_email`
- `public.orders.customer_email`
- `public.respondents.email`

Representative multiple-policy objects inspected:

- `public.admin_profiles`
- `public.report_templates`
- `public.reports`
- `public.respondents`
- `public.score_runs`

Unindexed-FK advisor object group:

- `public.app_settings`
- `public.assessment_answers`
- `public.assessments`
- `public.audit_logs`
- `public.email_events`
- `public.exposure_answers`
- `public.maturity_cap_events`
- `public.methodology_versions`
- `public.orders`
- `public.payment_proofs`
- `public.questions`
- `public.report_events`
- `public.report_templates`
- `public.reports`
- `public.respondents`

## Migration Status

Migration `0016_platform_database_hardening.sql` is prepared in the PR only. It has not been applied to production or any Supabase environment in this pass.
