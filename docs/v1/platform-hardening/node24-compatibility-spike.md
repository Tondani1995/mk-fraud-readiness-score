# Node 24 Compatibility Spike

## Decision

PR #19 deliberately keeps the application pinned to Node 20.

The current runtime declaration remains:

```json
"engines": {
  "node": "20.x"
}
```

The local runtime hint remains `.nvmrc = 20`, and GitHub Actions continues to use Node 20.

## Why Node 20 stays in PR #19

The Phase 10 premium-report regression suite intentionally guards the Node 20 runtime because the live PDF engine depends on Vercel Chromium shared-library compatibility.

The guard lives in:

- `scripts/phase10-premium-report-tests.mjs`

That guard must remain intact until a separate compatibility spike proves the full PDF path on Vercel. Package-level compatibility alone is not enough evidence for this application, because the risky area is the deployed Chromium/Puppeteer runtime rather than TypeScript compilation or dependency installation.

## What remains unresolved

Vercel's Node 20 deprecation warning remains unresolved in PR #19.

This does not mean Node 24 is known to be incompatible. It means Node 24 has not yet been proven to the required standard for this app's production PDF-generation path.

## Required future spike

A future Node 24 spike must be separate from PR #19 and must prove all of the following before changing the pin:

- a dedicated branch changes the runtime pin from Node 20 to Node 24;
- GitHub Actions passes the full V1 regression suite on that branch;
- Vercel builds a READY preview for the exact Node 24 head;
- the preview confirms Node 24 in the build/runtime evidence;
- Chromium diagnostics and shared-library resolution are inspected;
- `@sparticuz/chromium` resolves in the deployed environment;
- `puppeteer-core` resolves in the deployed environment;
- live PDF generation is proven through the admin-controlled path;
- a real premium report is generated through the admin-controlled path;
- the generated PDF is downloaded and visually checked;
- report release controls remain manual and admin-controlled;
- no PayFast, proof upload, card flow, automated unlock, customer download, scoring change, or report-content change is introduced.

Only after that evidence exists may the Node pin and Phase 10 regression assertion be changed.

## PR #19 boundary

PR #19 is limited to platform and database hardening while retaining Node 20. It may document the future Node 24 work, but it must not implement it.
