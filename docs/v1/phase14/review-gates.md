# Phase 14A Review Gates

1. V1 Verification passes on the exact PR head.
2. Vercel preview builds on Node 24 with existing Chromium/PDF behaviour intact. (Updated from the original Node 20 gate once the Node 24 runtime migration was completed and proven via a real packaged-Chromium render smoke test -- see scripts/phase14-node24-chromium-smoke.mjs and docs/v1/platform-hardening/node24-compatibility-spike.md for the historical decision record.)
3. Migration `0017` receives controller review before application.
4. Fixture UAT proves AI, repair and deterministic fallback paths.
5. No email is sent before Phase 14B assurance.
