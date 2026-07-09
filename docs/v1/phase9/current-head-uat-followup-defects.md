# Phase 9 Current-Head UAT Follow-up Defects

Current-head UAT on PR #12 confirmed the core respondent and admin manual EFT journey, but two final issues blocked readiness.

## Defect 1: Preview respondent link host

Preview-generated respondent links pointed to the canonical production host instead of the exact Vercel preview host used for UAT.

Fix approach:

- Build the public respondent base URL from the request host first.
- Use `x-forwarded-host` when present, falling back to `host` and then `request.url` origin.
- Avoid allowing `NEXT_PUBLIC_APP_URL` to override Vercel preview/current-head runtime links.

## Defect 2: Customer-facing benchmark wording

The free snapshot still included the word `benchmarks` in a negative boundary statement.

Fix approach:

- Remove the word from customer-facing snapshot copy.
- Keep the boundary without listing that term in the UI.

PR #12 remains draft until current-head CI and UAT confirm both issues are fixed.
