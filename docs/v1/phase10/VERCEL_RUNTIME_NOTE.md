# Vercel Runtime Note

This branch adds Puppeteer as the first-pass PDF renderer dependency.

GitHub Actions skips the Chromium download during install using `PUPPETEER_SKIP_DOWNLOAD=true` so static tests, typecheck and build can run quickly. Runtime report generation still requires a working Chromium/Puppeteer setup in the deployed or local environment.

If Vercel serverless cannot run Puppeteer reliably, the fallback should be a small private rendering service called from the admin generation route. Do not claim Phase 10 PASS until a real PDF is generated through the actual application route.
