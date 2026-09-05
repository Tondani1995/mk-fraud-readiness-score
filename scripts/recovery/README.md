# Essential Retry offline regression

Run on Node 24 or later:

```sh
npm ci
npx playwright install chromium webkit
npm run essential:test-retry-browser
```

The regression server-renders and hydrates the production `FulfilmentActions` component,
executes the production POST handler and real `generateManualPhase1Report` orchestration,
and checks a file-backed SQLite attempt ledger. It tests desktop Chromium, mobile Chromium
and mobile WebKit with nine transport/runtime cases each.

Boundaries replaced by test doubles: admin identity, operation-freeze lookup, report-data
assembly, Supabase RPC/storage adapter, manuscript writer and PDF renderer. Production
PostgreSQL migrations, deployed Next.js routing/auth, real PDF quality and external providers
are **not certified by this harness**. Server-side fetch is prohibited; browser traffic is
restricted to the local test server. No real order identifiers or credentials are used.

The synthetic paid fixture contains three findings consolidated into two risks. It needs the
scenario top-up from a6a5af396b2c64acc93ae1e15573d480afff019c to reach the unchanged minimum
of three scenarios. Each success checks that the original failed attempt is retained with
retry_count 0 and a new attempt progresses REPORT_QUEUED → REPORT_GENERATING → REPORT_READY
with retry_count 1. Forbidden and transport failures must not create an attempt. Native forms
still submit when JavaScript is disabled or the client chunk fails. Duplicate clicks use one
request; network-stack retransmission after disconnection retains the same request key.
