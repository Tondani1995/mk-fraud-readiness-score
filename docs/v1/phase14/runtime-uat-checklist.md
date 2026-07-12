# Phase 14A Runtime UAT Checklist

## Safety gate

- [ ] Migration `0017` reviewed before application.
- [ ] All automation flags remain false during initial preview deployment.
- [ ] R50,000 enquiries do not create report fulfilments.
- [ ] Existing manual report generation still produces the current PDF.

## Evidence and narrative

- [ ] Evidence checksum is stable for identical persisted assessment data.
- [ ] Customer contact details and EFT details are absent from AI input.
- [ ] AI output contains every scored domain and every reportable gap.
- [ ] Invalid evidence references are rejected.
- [ ] Unsupported benchmarks, guarantees and compliance conclusions are rejected.
- [ ] One repair attempt is recorded.
- [ ] Provider failure produces deterministic fallback without human approval.

## Fulfilment and PDF

- [ ] One `payment_received` event creates one fulfilment when enabled.
- [ ] Duplicate payment updates reuse the same fulfilment.
- [ ] A replay does not create a duplicate report version or storage object.
- [ ] PDF generation succeeds with AI narrative.
- [ ] PDF generation succeeds with deterministic fallback.
- [ ] Stored report checksum matches the generated PDF.
- [ ] Fulfilment ends at `ready_for_delivery` in Phase 14A.

## Admin and observability

- [ ] Admin order detail shows current status, step, mode, attempts and failure reason.
- [ ] Manual generate/regenerate remains available as fallback.
- [ ] Generation runs record model, prompt/schema versions, checksum, validation and usage where available.
- [ ] No secret or hidden credential is persisted.

## Preview assurance

- [ ] GitHub Actions pass on exact PR head.
- [ ] Vercel preview build is READY.
- [ ] Node remains 20.x and Next remains 14.2.35.
- [ ] Chromium/Puppeteer PDF smoke passes.
- [ ] No error or fatal runtime logs appear.
- [ ] No customer email is sent in Phase 14A.
