# Joint-launch cutover runbook (Essential R7,500 + Comprehensive R35,000)

**"Migrations before code" is necessary but not sufficient.** The catalogue migration changes live
product prices the instant it commits. Between that commit and the matching deployment there would
otherwise be a window in which an ordinary user hits the **old** application contract against the
**new** database catalogue.

This runbook closes that window. Two mechanisms do the actual work — neither is procedural:

| # | Mechanism | Why the window cannot open |
|---|---|---|
| 1 | **RC1 operation freeze** | `public.orders` carries the freeze trigger on the `order_create` surface. While the database is `FROZEN`, **no application version can create an order** — old or new. Migrations and deployment both land inside the freeze. |
| 2 | **Catalogue contract check in `create_paid_order()`** | The RPC is told the catalogue contract the calling build compiled against and refuses the write if the database disagrees. Even with the freeze released early, a stale R5,000 deployment is rejected with `paid_order_catalogue_contract_mismatch` rather than writing a mispriced order. |

Executable gate: `npm run joint-launch:gate-release-window -- --stage <stage>` (read-only; refuses
to run if its own source contains a mutation). It **never** releases the freeze — that is a
deliberate human action taken only after the gate passes at `post-deploy`.

---

## Sequence

### 1. Enter the controlled window
Announce the window. Nothing here is automated by this lane.

### 2. Freeze the mutating surfaces
Activate the RC1 operation freeze. The surfaces that matter for this cutover:
`order_create`, `payment_status`, `generation`, `delivery`.

Freezing is done through the existing audited AAL2 path (`rc1_activate_freeze`), by a platform
admin. This lane does not and cannot perform it.

### 3. Confirm the freeze
```bash
npm run joint-launch:gate-release-window -- --stage pre-migration
```
Must report **PASS**. It asserts the freeze is active, the six joint-launch migrations are **not**
yet applied, and the catalogue is still pre-cutover.

**If it reports STOP, do not continue.**

### 4. Apply the six joint-launch migrations
In order:

| Version | Migration |
|---|---|
| `20260810120000` | `joint_launch_product_catalogue` |
| `20260810121000` | `joint_launch_comprehensive_lifecycle` |
| `20260810122000` | `joint_launch_comprehensive_evidence` |
| `20260810123000` | `joint_launch_versioned_price_entitlement` |
| `20260810124000` | `joint_launch_atomic_paid_order` |
| `20260810125000` | `joint_launch_evidence_orphan_alert` |

Each carries its own verification block and aborts its own transaction on failure.

### 5. Run the migration/postflight contract
```bash
npm run joint-launch:gate-release-window -- --stage post-migration
psql "$TARGET_DB_URL" -f scripts/rc1-production-postflight.sql   # ledger 109, newest 20260810160000
```
`post-migration` asserts: freeze **still** active, all six migrations applied, Essential 750000,
Comprehensive 3500000, no active legacy price, exactly one open price version per product, the
database's open versions match this build's catalogue, and `create_paid_order` /
`order_price_version_entitled` are both reachable.

### 6. Deploy the exact matching application SHA
The deployed SHA must be the one whose `src/lib/commercial/product-catalogue.ts` the gate just
compared against the database. The application still cannot create orders — the freeze holds.

### 7. Smoke, still frozen
```bash
npm run joint-launch:gate-release-window -- --stage post-deploy
```
Then confirm by inspection (order-creating smoke tests must wait for step 8, since order creation is
frozen by design):

- [ ] `GET /score/api/commercial/products` returns Essential **750000** and Comprehensive **3500000**, Advisory `selfServiceOrderable: false`
- [ ] catalogue module and database open price versions agree (gate check `deployed_catalogue_matches_database`)
- [ ] `create_paid_order` and `order_price_version_entitled` reachable (gate)
- [ ] `phase14_generation_entitlement` / `phase14_delivery_entitlement` delegate to the versioned contract (migration `20260810123000` verification block)
- [ ] a known historical R5,000 order still returns `true` from `order_price_version_entitled` — **this is the proof no paid customer lost entitlement**

### 8. Release the freeze — last step, never earlier
Release through the audited AAL2 path. Then complete the order-creating smoke checks:

- [ ] Essential order → amount 750000, `product_price_version_id` set
- [ ] Comprehensive order → amount 3500000, engagement created in `awaiting_payment`
- [ ] a second concurrent Comprehensive attempt on the same assessment returns the **same** order, and no second order exists
- [ ] report entitlement passes for a paid Essential order

---

## Rollback

| Situation | Action |
|---|---|
| Gate STOPs at step 3 or 5 | Do not proceed. The freeze is still on and no user traffic is affected. |
| Migrations applied, deployment fails | **Keep the freeze on.** No order can be created, so the price change is not customer-visible. Fix and redeploy, or roll the catalogue back by opening a new price version — never by editing the existing rows. |
| Problem found after release | Re-freeze `order_create` first, then investigate. |

**Never roll back by editing `product_price_versions` rows in place.** Historical orders resolve
their entitlement through those windows; rewriting one retroactively de-entitles paid orders. A
price correction is always a **new** version.

---

## What this lane did not do

Applied no migration to Staging or Production, deployed nothing, released no freeze, mutated no
existing R5,000 order, called no provider, sent no email, executed no payment.
