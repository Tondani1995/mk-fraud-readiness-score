# Essential Retry browser regression

Run on Node 24 or later:

```sh
npm ci
npx playwright install chromium webkit
npm run essential:test-retry-postgres
```

The primary regression uses an **existing local PostgreSQL installation** (`initdb`,
`pg_ctl`, `createdb`, `psql`). Homebrew PostgreSQL 17 is detected on macOS. It creates
an isolated temporary database on a free loopback port, replays all repository migrations,
runs the browser matrix, and stops/removes the database on exit. It never uses cloud
credentials, creates a cloud resource, or incurs provider charges.

The test server renders/hydrates production `FulfilmentActions`, executes the production
POST handler and `generateManualPhase1Report`, checks the real schema-capability gate,
and executes the actual PostgreSQL claim/start/fail/complete functions. The database's
admin profile, paid order, locked score-run, attempt and report relationships are real
synthetic rows. Three browser engines/profiles run nine cases each: desktop Chromium,
mobile Chromium and iPhone WebKit. Normal success also replays the same request key through
the HTTP route and verifies report reuse without another attempt or writer invocation.

The synthetic assembly has three findings consolidated into two risks. The scenario top-up
from a6a5af396b2c64acc93ae1e15573d480afff019c is required to reach the unchanged minimum of
three scenarios. Each success preserves the original failed attempt with retry_count 0
and persists a new retry_count 1 attempt through REPORT_QUEUED → REPORT_GENERATING →
REPORT_READY, with a bound report row. Forbidden and pre-dispatch/transport failures
must not create an attempt. Native forms work without JavaScript or client chunks.

Explicit doubles: route admin identity, freeze lookup, report-data assembly, automation
flags, private object storage, manuscript writer and PDF renderer. Actual provider prose,
PDF quality, Supabase HTTP transport, deployed Next.js routing/session behaviour and
customer delivery are not certified by this harness. PostgreSQL cron/net/vault/auth
platform scaffolding follows the existing migration replay harness. Server-side fetch is
prohibited; browser traffic is restricted to localhost. No real order data or credentials
are used.

`npm run essential:test-retry-browser` retains a faster SQLite-adapter smoke matrix.
It does not replace the PostgreSQL regression.
