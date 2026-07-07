# Phase 3 Exit Card

## Phase

Phase 3: Scaffold and Design System

## Single deliverable

Working Next.js project scaffold with MK design system, route structure, environment template and Phase 4 handoff documentation.

## Acceptance test

- App package exists and has a coherent Next.js structure.
- Base public, accountless respondent and admin shell routes are present.
- Design tokens and reusable UI components exist.
- Environment template exists and contains placeholders only.
- Supabase integration is scaffolded but not activated with real secrets.
- No assessment engine, scoring engine, report generation or payment workflow has been built.
- Structural smoke check passes, including schema-contract enum alignment.

## Result

Pending product-owner local run and approval.

## Evidence

Run:

```bash
node scripts/phase3-smoke-check.mjs
```

Then run locally after installing dependencies:

```bash
npm install
npm run dev
```

## No-go boundary

Do not proceed to Phase 4 until this scaffold is approved.


## Phase 3 v1.1 repair note

The scaffold was repaired to align `src/lib/types/domain.ts` with the approved Phase 2 v1.1 Supabase enum contract. The smoke check now fails if legacy scaffold-only enum values reappear.
