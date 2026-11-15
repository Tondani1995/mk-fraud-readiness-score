# Operator console access: finding, containment and the person-bound decision (13 November 2026)

> **Withdrawn, 14 November 2026.** The owner confirmed that the console answering on mkfraud.co.za is the preferred, intended setup, and that no release should change it. The containment described below has been removed from the candidate (`src/middleware.ts` restored to match production `main`; `admin-surface.ts`, its tests and `security-containment-74b16d35.patch` deleted). This document is kept as a record only.

This change is security-only and is kept separate from the reporting, fulfilment and presentation changes so that it can be reviewed on its own. Files: `src/lib/auth/admin-surface.ts` (new), `src/middleware.ts`, `scripts/admin-surface-gate-tests.mjs` (new).

## 1. Finding (confirmed from source and project configuration; not probed)

1. `getAdminSession()` (`src/lib/auth/admin-route.ts`) selects the highest-priority active row in `admin_profiles` (platform_admin first). It does not look at who is making the request. The order-generation, payment-status, delivery, report-download, preview and send-email routes use it (45 files under `src/app` were found by the test in section 3).
2. `src/middleware.ts` protected only the website `/admin` area. Nothing in the application stood in front of `/score/admin/*`, `/score/api/admin/*` or `/score/api/commercial/orders/[ref]`.
3. The owner's operating model (13 November: no passwords, no MFA, no test logins; the console binds to the active admin profile behind Vercel protection) therefore depends entirely on Vercel Authentication.
4. The Vercel project's protection setting, read from the project configuration, is `ssoProtection.deploymentType = all_except_custom_domains`. Vercel Authentication covers `*.vercel.app` hosts. **It does not cover `mkfraud.co.za` or `www.mkfraud.co.za`.**

Taken together, the source and configuration indicate that on the production custom domains the operator console and its APIs would act as the platform administrator for any visitor. This is inferred, not demonstrated: no request was sent to production, no production data was read and no mutation was attempted, as instructed. Other limits may apply that are not visible in the source (for example the RC1 operation freeze on generation, or the production admin profile set). The owner should treat this as urgent and confirm it on production through a safe, owner-run check (for example a GET of `/score/api/admin/me` on the custom domain from a signed-out browser).

The inherited behaviour is not introduced by the revised bridge; the independent review reached the same conclusion from source.

## 2. Containment prepared (not deployed): containment, not authentication

This does not identify the operator, assign the operator's own role or correct audit attribution. The console still acts as whichever profile `getAdminSession()` selects. It only removes the unauthenticated route to the console.

`isAdminSurface()` names the console paths, reads and writes alike: `/score/admin/*`, `/score/api/admin/*` and `/score/api/commercial/orders/[ref]`. `adminHostAllowed()` allows them only on an **exact** list of hosts:

- the hosts Vercel generates for the running deployment (`VERCEL_URL`, `VERCEL_BRANCH_URL`), and only if they are `*.vercel.app`;
- hosts the owner lists exactly in `MK_ADMIN_ALLOWED_HOSTS` after verifying their protection, for example the stable production alias `mk-fraud-platform-tondanis-projects.vercel.app`;
- a local development host, only when not running on Vercel.

No hostname suffix is trusted. An arbitrary `*.vercel.app` name is not evidence of protection: an unrelated `*.vercel.app` host is refused. On every other host the middleware returns a plain 404 with `Cache-Control: no-store`.

**Assumptions, stated explicitly**

- The project's Vercel protection stays `all` or `all_except_custom_domains`, so the deployment's own hosts are protected. If it is ever reduced, set `MK_ADMIN_TRUST_DEPLOYMENT_HOSTS=0` and list only verified hosts.
- Each host added to `MK_ADMIN_ALLOWED_HOSTS` is verified as protected before it is added.

**Failure behaviour**

| Situation | Effect |
|---|---|
| No configuration on Vercel | The console is reachable only on the deployment's own hosts |
| `MK_ADMIN_TRUST_DEPLOYMENT_HOSTS=0` and no list | The console is reachable nowhere |
| A custom domain placed in `VERCEL_URL` | Not trusted |

**Consequences before deploying**

- Operators use the protected host, not `mkfraud.co.za`.
- Operator notification emails build console links from `NEXT_PUBLIC_APP_URL` (default `https://mkfraud.co.za`, in the pinned `src/lib/notifications/message-templates.ts`). Those links would return 404 until a separate console base URL is approved, or operators are told to use the protected host.
- No cron (`vercel.json` is empty) or database `pg_net` call uses these paths.

**Standalone patch against production:** `docs/readiness-review/security-containment-74b16d35.patch` adds `src/lib/auth/admin-surface.ts` and the tests, and changes `src/middleware.ts` (11 lines). It applies cleanly to `74b16d35`. With it applied to a clean `74b16d35` checkout, the gate tests pass (7 of 7, all 45 console files on production's own source gated) and TypeScript passes. It does not depend on, or deploy, any revised-product code.

## 3. Tests (`scripts/admin-surface-gate-tests.mjs`, 7 of 7 pass)

The test bundles the real middleware and runs it against constructed requests (no network, no database):

| Test | Result |
|---|---|
| AS-01 every console page and API, GET and POST, on `mkfraud.co.za`, `www.mkfraud.co.za` and a trailing-dot variant | 42 of 42 refused with 404 |
| AS-02 the same paths on the exact allowed hosts | pass through unchanged |
| AS-03 public and customer paths on the custom domain | unaffected |
| AS-04 an unrelated `*.vercel.app` host, look-alikes, a local host on Vercel, an empty host | refused (also through the middleware) |
| AS-05 middleware matcher covers every gated path | pass |
| AS-06 every file under `src/app` using `getAdminSession()`, `requireAdmin()` or `ProtectedAdminPage` sits under a gated path | 45 files, all gated |
| AS-07 deployment hosts withdrawn; custom domain in `VERCEL_URL`; nothing configured | all refused |

## 4. Person-bound authorisation: prepared design, owner decision DR-08

The mandate asks for person-bound authorisation, role checks and audit attribution. The pieces exist: `getAuthenticatedAdminSession()` and `requireAuthenticatedAdmin()` bind a Supabase Auth access token to an active admin profile with no fallback, and the console's role sets already exist. What does not exist is any way to obtain that session: `setAdminSessionCookies()` has no caller and `/score/admin/login` redirects to the console. Making the routes person-bound without a sign-in flow would lock every operator out; adding a sign-in flow contradicts the owner's direction of 13 November (no passwords, MFA or test logins). It is therefore prepared, not implemented:

1. A passwordless sign-in (Supabase email one-time link to an address already in `admin_profiles`), setting the existing cookies; no passwords and no MFA.
2. One helper used by every route in section 3 that resolves the actor with `requireAuthenticatedAdmin(roles)`, so the audit trail names the person.
3. Tests: unauthenticated (401), authenticated without the role (403), a profile marked inactive (401), cross-order report access (already refused as `report_order_mismatch`), and service failure (refuse, never fall back).

These routes are pinned by the integrity guard (`src/lib`, `src/app/score/api`), so the change needs an owner-approved guard exception like the B5 dispatch hook.

## 5. Review role links

The revised review's role links remain bearer links on an isolated test database, labelled fictional-only on every page. They are not authentication and must stay fictional-only until an access model is approved (DR-09).
