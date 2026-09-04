# Admin authentication — Production release blocker

**Status: open. Reported, not remediated.** The owner has ruled that Comprehensive must adopt the
same approved admin model as Essential, and that neither product moves to a new session
architecture in this workstream. This file records the current state so the decision can be taken
with the full inventory in front of it.

**Scope note.** Nothing in this file has been changed. No route was modified.

---

## 1. What the two helpers actually do

`src/lib/auth/admin-route.ts` contains two different things with similar names.

| | `getAdminSession()` / `requireAdmin()` | `getAuthenticatedAdminSession()` / `requireAuthenticatedAdmin()` |
|---|---|---|
| Reads a cookie or token | **No** | Yes — `getAdminAccessTokenFromCookies()` |
| Verifies a Supabase Auth user | **No** | Yes — `anon.auth.getUser(accessToken)` |
| How the actor is chosen | Service client selects any **active** `admin_profiles` row, ordered by `ADMIN_ROLE_PRIORITY` (`platform_admin` first) | The authenticated user's own profile, and only if active |
| Fallback when unresolved | `RUNTIME_READ_ONLY_ADMIN` (`read_only_admin`) | **None** — returns `null` |
| Documented purpose | Read-only console rendering; deployment-bound actor accepted by owner decision | *"Strict authentication for newly introduced mutation/download surfaces."* |

`getAdminSession()` is therefore **actor resolution, not authentication**. Any caller that reaches
the route is served as the highest-priority active admin profile.

In Preview there is exactly **one** active profile and it is `platform_admin`
(`3fea51fe-bbcc-4ec6-a9fd-20233a6634ec`), so `getAdminSession()` resolves to `platform_admin`
unconditionally there.

**Documented intent does not match the implementation.** The `getAdminSession()` docstring states
that *"the strict mutation boundary remains backed by the administrator's own Supabase Auth
session."* That is not true of any route below.

---

## 2. Middleware coverage

`src/middleware.ts` matcher:

```
'/admin/:path*'
'/score/api/readiness-runtime-check'
'/score/api/internal/uat-start-check'
'/score/api/qa/recovery-v10-v12-vhutshilo'
```

`/score/api/admin/*` is **not matched**. The only boundary in front of the admin API is Vercel
Deployment Protection (SSO), which is enabled for all non-custom-domain deployments.

---

## 3. Route inventory

`R` = read-only · `M` = mutation · `D` = download of private customer bytes.

| Route (`/score/api/...`) | Methods | Kind | Auth helper | Role check | Strict session required? |
|---|---|---|---|---|---|
| `/admin/me` | GET | R | `getAdminSession` | — | no |
| `/admin/backlog-reconciliation` | POST | M | `getAdminSession` | — | **yes** |
| `/admin/backlog-reconciliation/export` | GET | R | `getAdminSession` | — | no |
| `/admin/assessments/[ref]/score` | POST | M | `requireAdmin` | `platform_admin` | **yes** |
| `/admin/assessments/[ref]/generate-essential-report` | POST | M | `getAdminSession` | `platform_admin` | **yes** |
| `/admin/assessments/[ref]/reports/[id]/download` | GET | D | `getAdminSession` | `platform_admin` | **yes** |
| `/admin/reports/[id]/download` | GET | D | `getAdminSession` | `platform_admin` | **yes** |
| `/admin/reports/[id]/preview` | GET | D | `getAdminSession` | `platform_admin` | **yes** |
| `/admin/reports/[id]/send-email` | POST | M | `getAdminSession` | `platform_admin` | **yes** |
| `/admin/orders/[ref]/generate-report` | POST | M | `getAdminSession` | `platform_admin` | **yes** |
| `/admin/orders/[ref]/mark-delivered` | POST | M | `getAdminSession` | `platform_admin` | **yes** |
| `/admin/orders/[ref]/fulfilment/approve` | POST | M | `getAdminSession` | — | **yes** |
| `/admin/orders/[ref]/fulfilment/reject` | POST | M | `getAdminSession` | — | **yes** |
| `/admin/orders/[ref]/fulfilment/retry` | POST | M | `getAdminSession` | — | **yes** |
| `/admin/orders/[ref]/fulfilment/recover` | POST | M | `getAdminSession` | — | **yes** |
| `/admin/orders/[ref]/delivery/retry` | POST | M | `getAdminSession` | `DELIVERY_RETRY_ROLES` | **yes** |
| `/admin/orders/[ref]/delivery/revoke-token` | POST | M | `getAdminSession` | — | **yes** |
| `/admin/orders/[ref]/delivery/reissue-token` | POST | M | `getAdminSession` | — | **yes** |
| `/admin/orders/[ref]/delivery/correct-recipient` | POST | M | `getAdminSession` | — | **yes** |
| `/admin/operational-alerts/[id]/transition` | POST | M | `requireAdmin` | `platform_admin` | **yes** |
| `/admin/phase14-activation/settings` | POST | M | `requireAdmin` | `platform_admin` | **yes** |
| `/admin/phase14-activation/gate` | POST | M | `requireAdmin` | `platform_admin` | **yes** |
| `/admin/phase14-activation/feature-policy` | POST | M | `requireAdmin` | `platform_admin` | **yes** |
| `/admin/phase14-activation/ai-route-policy` | POST | M | `requireAdmin` | `platform_admin` | **yes** |
| `/admin/phase14-activation/runtime-secret` | POST | M | `requireAdmin` | `platform_admin` | **yes** |
| `/admin/delivery/premium-report` | POST | M | none (env-gated) | — | **yes** |
| `/admin/comprehensive/[ref]` † | GET | R | `getAdminSession` | `platform_admin` | retire |
| `/admin/comprehensive/[ref]/generate` † | POST | M | `getAdminSession` | — | retire |
| `/admin/comprehensive/[ref]/finalise` † | POST | M | `getAdminSession` | `platform_admin` | retire |
| `/admin/comprehensive/[ref]/reviewer` † | POST | M | `getAdminSession` | — | retire |
| `/admin/comprehensive/[ref]/review-records` † | GET, POST | M | `getAdminSession` | — | retire |
| `/admin/comprehensive/[ref]/evidence/[id]` † | POST | M | `getAdminSession` | — | retire |
| `/admin/comprehensive/[ref]/transition` † | POST | M | `getAdminSession` | — | retire |
| `/admin/rc1-*` (9 routes) | none exported | — | — | — | dead files |

† Retired reviewed-engagement lifecycle — see section 5.

**Totals: 33 route files with exported handlers. 0 use the strict session.**
`getAuthenticatedAdminSession()` and `requireAuthenticatedAdmin()` are **dead code**.

---

## 4. Recommended migration

Not to be done in the Comprehensive closure. Sequenced so Essential is never destabilised.

1. **Keep `getAdminSession()` for read-only rendering.** That is its documented, accepted purpose.
2. **Move the 24 mutation/download routes to `requireAuthenticatedAdmin([...])`**, preserving each route's existing role set exactly. This is the change the code already anticipates — the helper exists and is unused.
3. **Fill the role gaps.** Nine mutation routes carry no role check at all and inherit whatever `getAdminSession()` returns: the four `fulfilment/*` routes, three `delivery/*` routes, and `backlog-reconciliation`. Give each an explicit allowlist.
4. **Correct the docstring** on `getAdminSession()`, which currently asserts a strict boundary that does not exist.
5. **Add middleware coverage** for `/score/api/admin/*` as defence in depth, so a future route cannot be added without a session check.
6. **Delete the nine `rc1-*` route files** that export no handler.
7. **Regression:** a test asserting that every file under `src/app/score/api/admin/**` exporting POST/PATCH/PUT/DELETE, or a GET returning private bytes, uses `requireAuthenticatedAdmin`.

Until (2) lands, Vercel Deployment Protection is the only control preventing an unauthenticated
caller from acting as `platform_admin` against fulfilment, delivery, token, activation and report
download surfaces.

---

## 5. Retired Comprehensive reviewer surfaces

`/score/admin/comprehensive/[orderReference]` and `ComprehensiveReviewWorkspace.tsx` implement the
retired human-reviewed lifecycle: named reviewer, evidence classification, review records,
executive-presentation upload, sign-off, `review_complete`, signed-off release, and
`comprehensive_engagements`.

The active automated Comprehensive product uses none of it — `comprehensive_engagements` has **0
rows**, and `automatic_release_completed_fulfilment()` raises
`comprehensive_active_order_still_depends_on_reviewed_engagement` if an active order ever depended
on one.

These surfaces remain reachable in the active admin experience and should be removed from active
navigation and runtime. Historical records and migrations stay for audit.
