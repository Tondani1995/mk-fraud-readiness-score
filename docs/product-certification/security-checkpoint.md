# Product certification security checkpoint

25 October 2026. From 3fced66f, design/mk-management-clarity. The design baseline was provisionally accepted; the subsequent spatial brief reopens presentation in a separate worktree. No production release, paid provisioning or deployment is authorised.

Scoped corrections: recovery opts into fail-closed limiter decisions, limits actual JSON body bytes to 4096 after rate limiting, rejects cross-site Fetch Metadata, and retains private failure/success responses. Assessment metadata suppresses referrers. All other rate-limit callers keep their existing policy. The recovery service, token validators/SQL, scoring engine, questionnaire timing and presentation are unchanged.

Tests: recovery-security-review-tests.mjs executes the actual route/limiter/private validator against synthetic infrastructure; recovery-postgres-tests.mjs adds actual restricted-role execution denial to the existing concurrency/score preservation test. certification-freeze-tests.mjs protects 582 source/assets/Tailwind files against 3fced66f, with only the three documented security exceptions and exact metadata-only layout difference. certification-policy-observations.mjs executes the unchanged calculator for owner evidence.

Residuals require explicit review: consume/issue are separate transactions and failed replies can spend a use; Snapshot render validates with consume:false, so max uses is not a strict per-view quota; other helper callers remain fail-open; trusted proxy/header, hosted PostgREST/RLS and real no-replay counts are unverified. This is an internal adversarial review, not independent staffed certification.

The decision-grade report, ten source-grounded copy proposals, methodology comparisons, staging costs/credentials and usability protocol are in the task outputs/product-certification folder. No representative participants are available, so zero usability sessions are claimed. Current provider supports payment double/disabled only; email test mode is not an enforced sink. Production remains NO-GO.
