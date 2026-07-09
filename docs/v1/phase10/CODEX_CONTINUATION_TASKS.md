# Codex Continuation Tasks — Phase 10

When Codex is available again, continue from branch `phase10/pdf-report-engine`.

## Required next steps

1. Pull the branch and run the full stack locally:

```bash
npm install
npm run phase7:test-snapshot
npm run phase8:test-admin
npm run methodology:copy-test
npm run phase9:test-orders
npm run phase10:test-report
npm run typecheck
npm run build
```

2. Fix any TypeScript/build failures introduced by the draft branch.

3. Replace the interim HTML template with the full Claude V2 premium 21-page report template if it passes local build and runtime rendering.

4. Decide with Tondani whether to keep the 36 Claude V2 content blocks as draft-only migration data or leave them outside repo until MK content approval.

5. Prove Puppeteer in the actual runtime environment. If it fails in Vercel, document the blocker and propose a renderer-service fallback.

6. After Phase 9 UAT passes, test a real `payment_received` order through report generation and admin signed download.

7. Update `docs/v1/phase-exit-cards/phase-10-pdf-report-engine.md` with actual evidence.

## Do not do

- Do not merge this PR before PR #12 passes and merges.
- Do not activate draft content blocks without MK approval.
- Do not add payment gateway, proof upload, client portal, live AI recommendations or benchmarks.
