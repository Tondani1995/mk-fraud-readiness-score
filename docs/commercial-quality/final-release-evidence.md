# MK FRAUD READINESS PREMIUM PRODUCT

## Release identity

- Branch: `commercial/mk-fraud-readiness-95-quality`
- Final commit: recorded by `git rev-parse HEAD` after this evidence note is committed
- Gate 0 baseline: `7c8aa6f5c2f0500dc5fe57ba3bc9bca71fb54e03`
- Gate 0 ancestry: PASS
- Required preserved commits: `a22ab79929360706c726bcf6d814510e18f95978`, `f4e2158067054c71ed83e24e124f47d4b1b9121f`, `d23e6b10397fd91ff326a7f4d8ccdaab067a7b28`, baseline above
- Production: untouched; source data read from Supabase Staging only

## Programme result

- Binary objective gates replace the superseded scorecard approach.
- Six fixture profiles run through the complete binary gate harness: 875 required rows plus one M1 coverage row, with zero FAIL rows.
- Customer artefacts contain zero prohibited-token or raw-UUID hits.
- The final pack uses persisted Rivonia Essential and Kestrel Comprehensive records.

## Artefact checks

- Essential: 29 pages; 8-sheet supporting register.
- Comprehensive: 36 pages; 8-sheet annotated register.
- Board readout: 7 pages.
- Workshop material: 10 pages.
- Executive presentation: 10 slides; overflow test passed.
- Evidence reconciliation: 12 total, 8 reviewed, 3 supported, 2 insufficient, 2 not supported, 1 reviewed without conclusion; unresolved formula reconciles to 8.
- Visual inspection: final Essential, Comprehensive, board, workshop, presentation and register surfaces inspected; no clipping or blank-content defect remains.

## Verification commands

- `npm run quality:gates` — 876 emitted rows: 875 required rows plus M1 coverage; zero FAIL.
- `npm run quality:scan` — seven current artefacts copied to the owner-review package; zero prohibited-token hits.
- `npm run typecheck`
- `npm test`
- `npm run v7:test-checkpoint-a-unit`
- `npm run bounded:test-essential-contract`
- `npm run pdf:test-commercial-composition`
- `npm run g30:test-pdf-accessibility`
- `npm run joint-launch:test-product-contract`
- `npm run joint-launch:test-comprehensive`
- `npm run joint-launch:test-customer-operability`
- `npm run joint-launch:test-review-authority-refs -- MKORD-2026-7FBBEE23`
- `npm run joint-launch:test-comprehensive-workbook -- MKORD-2026-7FBBEE23`
- bundled presentation overflow test

## Changed-file inventory

- Commercial-quality builders and the binary gate harness under `scripts/commercial-quality/`.
- Comprehensive report, workshop, register, projection and Kestrel certification sources under `src/lib/reports/comprehensive/`.
- Supporting workbook, PDF rendering/template and customer surface fixes.
- Binary gate output, applicability, reconciliation, benchmark and zero-placeholder evidence under `docs/commercial-quality/`.
- Seven final customer artefacts under `outputs/commercial-quality/`.

This is an owner review candidate. It is not a market-ready declaration.

## Legacy contract note

Two older integration suites still assert pre-harness workbook contracts (`Functional Agenda` on Essential and `Roadmap` on Comprehensive) and the unsanitised staging reviewer name. Those assertions conflict with the authoritative objective contract: Essential has exactly eight sheets including `Control Improvements`; Comprehensive has exactly eight sheets without `Roadmap`; customer-facing surfaces must not expose staging/UAT copy. They were not used to override the authoritative gate result.
