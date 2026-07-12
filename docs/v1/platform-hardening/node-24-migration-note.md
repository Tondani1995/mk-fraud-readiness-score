# Node.js 24 Runtime Migration Note — PR #19

## IMPORTANT: what is and is not committed in this push

This push commits the **runtime declaration** changes (`package.json` `engines.node`, `.nvmrc`, CI `setup-node` version). It does **not** commit a regenerated `package-lock.json`, and `@types/node` is deliberately left at `^20.16.5` for now. Both are real, verified, ready to apply — see "Evidence" below — but the actual byte-for-byte lockfile artifact could not be safely transmitted through this session's tooling within an acceptable error/cost budget (the file is ~256KB; the available push mechanism could not reliably move content that size into the target file without risking silent corruption, which would be worse than not pushing it).

**Immediate follow-up required before merge:** run `npm install` once against this branch's `package.json` (after also bumping `@types/node` back to `^24.13.3`) using Node 24, and commit the resulting `package-lock.json`. This can be done by the repository owner locally, or by Claude in a follow-up session with a working file-transmission path (e.g. a real git-capable environment). Until then, CI's `npm ci` step will keep passing against the **old, unchanged** lockfile, because `@types/node` was deliberately left matching it — this branch is safe to run CI/build against as-is, it just doesn't yet carry the SWC/lockfile fix.

## What changed in this push

- `package.json` `engines.node`: `20.x` → `24.x`
- `package.json` `version`/`description`: updated to stop describing Phase 11 as current
- `package.json` `scripts`: added `platform:test-hardening`
- `.github/workflows/phase7-verification.yml`: `setup-node` version `'20'` → `'24'`; added a `platform:test-hardening` step
- Added `.nvmrc` containing `24` (no `.nvmrc`/`.node-version`/Volta config existed previously)

## What is verified, but NOT yet committed (follow-up)

- `@types/node`: `^20.16.5` → `^24.13.3` (verified compatible, not yet applied — see above)
- `package-lock.json` regeneration (verified working end-to-end under real Node 24.18.0 / npm 11.16.0 — see evidence below — not yet committed)

## What did not change

- Next.js remains `^14.2.13` (resolves to `14.2.35`, same as previously recorded in the Phase 11 exit card)
- React remains `^18.3.1`
- No other dependency version was touched
- `next.config.mjs` content is byte-identical to before this PR
- `tsconfig.json` is unchanged (ES2022 target already compatible with Node 24)

## Evidence

### Clean install under real Node 24

Performed in an isolated environment using the actual Node v24.18.0 / npm 11.16.0 binaries (not simulated):

- `npm install` from a bare `package.json` (no prior lockfile): **471 packages added**, no errors. Only pre-existing transitive-dependency deprecation warnings (`inflight`, `rimraf@3`, `glob@7`/`@10`, `eslint@8.57.1`'s own EOL notice, `@humanwhocodes/*`) — these are unrelated to the Node-version change and were present under Node 20 too.
- Resulting `package-lock.json`: `lockfileVersion: 3`.
- **All 9 platform-specific `@next/swc-*` optional dependencies are now present** in the lockfile (`darwin-arm64`, `darwin-x64`, `linux-arm64-gnu`, `linux-arm64-musl`, `linux-x64-gnu`, `linux-x64-musl`, `win32-arm64-msvc`, `win32-ia32-msvc`, `win32-x64-msvc`) — this is the exact set Vercel's "Found lockfile missing swc dependencies" warning was about.
- `next` resolved to `14.2.35` — confirms no Next.js version change.

### `npm ci` proof

From a fully removed `node_modules`, `npm ci` against the regenerated lockfile: **exit code 0**, 471 packages installed in 11 seconds. Verified `node_modules/next` and `node_modules/@next/swc-linux-x64-gnu` both present afterward.

### Chromium/Puppeteer compatibility (package-resolution level)

- `@sparticuz/chromium@131.0.1` declares `"engines": {"node": ">= 16"}` — satisfied by Node 24.
- `puppeteer-core@23.11.1` declares `"engines": {"node": ">=18"}` — satisfied by Node 24.
- Both packages' `package.json` load without error under Node 24; no install-script failures for either in the `npm ci` log.
- **Not verified in this pass**: an actual Chromium launch + PDF render under Node 24 in a deployment-equivalent environment. This requires the real application source and Supabase connection, which this isolated lockfile-regeneration environment intentionally did not include. This must be confirmed via the Vercel preview build and the Phase 10 report test running in CI under Node 24.

### What was not run in this environment, and why

This verification environment contained only `package.json` (lockfile regeneration doesn't require application source). It does **not** contain the actual `src/` tree, so `next build`, `tsc --noEmit`, and the `phaseN:test-*` scripts were **not** run here — they require the real, private repository source and are verified instead through actual GitHub Actions CI execution and the Vercel preview build against the real PR head, both of which are genuine remote execution environments, not local assertions.
