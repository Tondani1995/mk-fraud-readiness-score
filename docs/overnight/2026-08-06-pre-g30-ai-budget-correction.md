# Pre-G30 AI budget correction — offline decision record

Date: 2026-08-06

This record covers the correction for `AI_PROMPT_AND_COST_BUDGET_CONTRACT_MISMATCH` on PR #52. It is an offline artifact only: no AI Gateway request, provider call, email, new journey, or Production mutation is recorded here.

## Retained Journey 4 evidence

- Assessment: `MKFRS-2026-C35A2D462B`
- Order: `MKORD-2026-HB0OT81P`
- Report: `RPT-MKFRS-2026-C35A2D462B-V1`
- Graph fingerprint: `fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab`
- Evidence checksum: `82d56c6678a9999386f662b886e0b3373fd5b32f8edc122ae5c3fb08cff4c62c`
- 68 applicable traces, 9 unknown/visibility traces, 10 domains, 9 gaps, 390 evidence items
- Evidence pack and narrative brief validation passed; required evidence references remained resolvable; prompt-injection instructions remained active.

## Root cause and protected before/after measurements

The previous 250,000-micro cost limit plus a 20,000 total-token limit reserved 5,000 output tokens and therefore admitted only approximately 15,000 input tokens. The unoptimised retained generation prompt measured 71,256 bytes / 17,814 estimated input tokens and was rejected at an estimated 278,140 micros before any AI attempt or Gateway dispatch.

The compact projection removes duplicated deterministic fields while retaining the evidence identifiers, required sections, visibility evidence, grounding fields and closed safety instructions. The corrected generation artifact measures 58,563 bytes / 14,641 estimated input tokens, with protected hash `f34a76e9003a6a3ab9a050a339063646653bde918966d1b481fa88839465fb24`. The representative repair artifact measures 13,654 bytes / 3,414 estimated input tokens, with protected hash `8826af522f527520363bc8bca91953e01dd5cd79958756ce798e91fcbd40ecae70`.

## Coherent envelope

- Maximum input: 19,000 estimated tokens and 76,000 UTF-8 bytes
- Maximum output: 5,000 tokens
- Maximum total per call: 24,000 tokens (`19,000 + 5,000`)
- Conservative estimate: input `10` micros/token plus output `20` micros/token
- Maximum estimated cost per call: 500,000 micros (USD 0.50)
- Maximum combined generate + repair estimate: 1,000,000 micros (USD 1.00)
- Maximum real attempts: one initial call plus one repair; provider retries remain zero

Journey 4’s corrected generation estimate is 246,410 micros and therefore has more than 20% cost headroom. The generation and representative repair estimates together remain below the report-level ceiling. Actual provider usage and cost continue to be checked and fail closed before release.

## Safe diagnostics

Pre-dispatch diagnostics expose only input bytes, estimated input tokens, maximum output, estimated total tokens, estimated cost, limits and one of four closed-vocabulary reasons. The durable attempt row stores the same safe measurements after a claim; raw prompts and customer-entered narrative are not persisted by this correction.

## Offline decision

The exact retained Journey 4 input passes after optimisation. The historical pre-correction measurement fails the old cost limit. Boundary tests cover a passing prompt immediately below the byte boundary, a blocking prompt immediately above it, envelope arithmetic, evidence-reference retention, injection safeguards, and zero provider calls. This is the offline GO gate for one successor Preview certification journey; it does not itself authorise Production or merge PR #52.
