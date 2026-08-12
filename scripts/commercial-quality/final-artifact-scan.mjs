#!/usr/bin/env node
// Reporting Bible v1.1 is manuscript-first. The former PDF scanner is intentionally
// replaced by the owner-review gate: no final artefact scan can pass before the
// Fact Pack, Story Plan, AI manuscript, factual/editorial validation and owner
// approval stages have completed.
await import('./v11-manuscript-gate-scan.mjs');
