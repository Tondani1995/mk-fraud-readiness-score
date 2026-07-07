# Phase 4 v1.1 Test Plan

## Acceptance tests

| Test | Expected result |
|---|---|
| Anonymous user opens `/start` | Allowed. |
| Start form submitted with valid details and privacy consent | Organisation, respondent, assessment and hashed resume token are created. |
| Start form submitted without privacy consent | Rejected. |
| Resume link opens matching draft assessment | Allowed and shows organisation/respondent summary. |
| `/assessment/[ref]` without token | Blocked. |
| Wrong token for reference | Blocked. |
| Expired, revoked or overused token | Blocked. |
| Submitted/locked assessment with resume token | Blocked. |
| Anonymous user opens `/admin` | Redirects to `/admin/login`. |
| Anonymous user opens `/admin/assessments` | Redirects before any service-role assessment query is executed. |
| Anonymous user opens `/admin/methodology` | Redirects before any service-role methodology query is executed. |
| Anonymous user opens `/admin` dashboard | Redirects before dashboard count queries are executed. |
| Non-admin Supabase user signs in | Rejected. |
| Active MK admin signs in | Admin shell loads. |
| Admin roles use approved enum values | No legacy enum values. |
| Direct respondent database writes | Not available; respondent writes go through server routes only. |

## Hard stop

If a respondent can access admin routes, if an unauthenticated admin route triggers a sensitive service-role query before `requireAdmin()`, if a resume token can open the wrong assessment, if raw tokens are stored in the database, or if the schema migration contains duplicate column definitions, Phase 4 fails.


## v1.1 repair checks

| Repair check | Expected result |
|---|---|
| SQL migration duplicate-column scan | `npm run phase4:smoke` fails if a create-table block repeats a column name. |
| Basic SQL syntax-risk scan | `npm run phase4:smoke` flags double commas, trailing create-table commas and suspicious adjacent JSONB lines. |
| Admin-before-query static guard | Admin pages that use service-role data must call `requireAdmin()` before `createSupabaseServiceClient()` or dashboard data fetches. |
| Service-role use pattern | Service-role data access is allowed only after admin validation or within controlled server actions. |
