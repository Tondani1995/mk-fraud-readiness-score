# Platform Runtime and Database Hardening (PR #19) — Exit Card

## Status

**Code-level Pass; migration and production assurance outstanding.**

## Source

- Expected/confirmed base `main` commit: `7ecc0916feb9c8acb08c844a8ca22b1551becdb2`
- Branch: `platform/runtime-database-hardening`
- Draft PR title: "Platform runtime and database hardening"

## What this PR does

1. **Node.js 24 runtime alignment (partially committed)** — `package.json` `engines.node`, CI `setup-node`, and `.nvmrc` moved to Node 24 in this push. `@types/node` is **deliberately left at `^20.16.5`** in this push to keep `npm ci` passing against the not-yet-regenerated lockfile — see the follow-up note below. Next.js remains `^14.2.13` (resolves `14.2.35`); React remains `^18.3.1`. No framework upgrade.
2. **Lockfile/SWC repair — verified, NOT yet committed** — regenerating `package-lock.json` from a clean install under real Node 24.18.0/npm 11.16.0 was fully tested and confirmed to add all 9 platform-specific `@next/swc-*` optional dependencies, which would resolve Vercel's "Found lockfile missing swc dependencies" warning. The resulting lockfile file itself could not be safely transmitted through this session's push mechanism (~256KB, high corruption risk) and is **not part of this commit**. This is the single most important open follow-up item — see `docs/v1/platform-hardening/node-24-migration-note.md`.
3. **Operational build metadata** — new shared `src/lib/system/build-info.ts` consolidates the phase/release-channel fallback logic; `/api/health` and `/api/system/build-info` both now use it instead of duplicating a stale `phase-6-consolidated-scoring` fallback (confirmed live in production before this fix).
4. **Supabase advisor audit** — full security + performance advisor pull, PostgreSQL function inventory (owner/security-mode/search_path/grants), RLS policy-to-caller mapping, and FK usage evidence check. See `docs/v1/platform-hardening/supabase-advisor-inventory.md`.
5. **Narrow database hardening** — migration `0016_platform_database_hardening.sql`: `set_updated_at()` search_path fix, `admin_profiles_select` RLS initplan optimization, 2 evidence-backed FK indexes. **Not applied to any environment.**
6. **Dead-config cleanup** — removed `next.config.ts` (confirmed unreferenced by any script/doc/test, inert on Next 14, fully superseded by `next.config.mjs`), with a new boundary test confirming `next.config.mjs` retains the Chromium tracing and webpack externals.

## Distinguishing what was actually done

| Item | Status |
|---|---|
| Code implemented | Yes |
| Node 24 verified locally | Yes — real Node 24.18.0/npm 11.16.0 binaries, genuine `npm install`/`npm ci`, not simulated |
| CI verified on Node 24 | Pending — verify on the exact PR head's GitHub Actions run |
| Preview verified | Pending — verify on the exact PR head's Vercel deployment |
| Migration prepared | Yes — `0016_platform_database_hardening.sql` |
| Migration applied | **No — not applied to any environment** |
| Post-migration advisors run | N/A — migration not applied |
| Production verified | Not touched; this PR is draft-only |
| Parked findings | Documented in full in the advisor inventory — not claimed as fixed |

## Regression boundaries confirmed

No change to: assessment questions, answer handling, scoring, weighting, maturity bands/caps, exposure calculation, critical-control rules, free-snapshot content, report pricing/ordering, EFT instructions, PDF content/layout, report-generation gates, admin authorization behaviour, customer email behaviour, event taxonomy, or notification semantics. Migration `0016` was checked programmatically (in `platform-hardening-tests.mjs`) to contain none of `drop table`, `drop column`, `weight_pct =`, `maturity_band`, `exposure_score`, or `delete from`.

## Explicit no-go confirmation

This PR does not: upgrade Next.js or React, redesign the application, add Phase 14 AI functionality, change report content or scoring, change commercial pricing or payment behaviour, introduce a payment gateway, add customer accounts or new auth providers, broadly rewrite RLS, add permissive policies to silence advisors, relocate `citext`, apply any migration to production, change Supabase Auth password settings, merge the PR, or mark the PR ready for review.

## Remaining conditions before this PR can be merged

0. **Regenerate and commit `package-lock.json` under Node 24, and bump `@types/node` to `^24.13.3`.** This is verified/ready but not yet committed — see the migration note. This is the highest-priority remaining item.
1. GitHub Actions checks pass on the exact draft-PR head commit (not just my local sandbox verification).
2. Vercel preview for the exact PR head reaches `READY`, with Node 24 confirmed in the build log and no SWC/Node-20 warnings.
3. `/score/api/health` and `/score/api/system/build-info` checked live on the preview.
4. `/score/start` smoke-checked on the preview.
5. Migration 0016 reviewed and, separately, deliberately applied by the controller — not part of this PR's scope.
