# Phase 14 AI Provider Boundary

## Runtime choice

The application runs on Node.js 24. AI SDK `6.0.83` and Zod `4.1.8` remain pinned for the current structured-output implementation. AI SDK 7 is not introduced in this phase.

## Provider routing

The Essential narrative route uses one closed model policy. Selection precedence is:

1. the `premium_report_ai_model` Phase 14 app setting;
2. `MK_REPORT_AI_MODEL` in the deployment environment;
3. the compiled primary `openai/gpt-5-mini`.

Only the approved Mini/Luna/Terra/Sol model identifiers are accepted as explicit overrides. An unsupported or stale override such as `openai/gpt-5.5` resolves safely to the compiled Mini primary and is retained only as a bounded diagnostic. For each logical stage (manuscript and semantic review), the application owns at most four total Mini attempts, then may use `openai/gpt-5.6-luna`, `openai/gpt-5.6-terra` and `openai/gpt-5.6-sol` in that order for an authorised technical or capability failure. SDK retries are disabled with `maxRetries: 0` so physical requests remain observable.

The application does not store a provider API key in Supabase or report provenance. Authentication is expected to use the Vercel deployment environment and AI Gateway configuration.

## Data minimisation

The AI provider receives only the canonical report evidence pack and deterministic roadmap context. It does not receive customer email, phone number, EFT information, admin notes, respondent tokens, Supabase identifiers or environment configuration.

## Failure behaviour

An AI failure is not a report-fulfilment failure by itself. The system moves to approved deterministic report content and continues. Human intervention is reserved for evidence, persistence, PDF or storage failures that cannot be safely retried.
