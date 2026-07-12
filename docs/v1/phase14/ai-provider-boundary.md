# Phase 14 AI Provider Boundary

## Runtime choice

The repository remains on Node.js 20 because of the existing Vercel Chromium/PDF compatibility guard. AI SDK `6.0.83` and Zod `4.1.8` are pinned because they support this runtime. AI SDK 7 is not introduced in this phase.

## Provider routing

The premium-report model is configured through `MK_REPORT_AI_MODEL` or the Phase 14 app setting. The controlled default is `openai/gpt-5.5` through Vercel AI Gateway.

The application does not store a provider API key in Supabase or report provenance. Authentication is expected to use the Vercel deployment environment and AI Gateway configuration.

## Data minimisation

The AI provider receives only the canonical report evidence pack and deterministic roadmap context. It does not receive customer email, phone number, EFT information, admin notes, respondent tokens, Supabase identifiers or environment configuration.

## Failure behaviour

An AI failure is not a report-fulfilment failure by itself. The system moves to approved deterministic report content and continues. Human intervention is reserved for evidence, persistence, PDF or storage failures that cannot be safely retried.
