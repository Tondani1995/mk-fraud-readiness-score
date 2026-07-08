# MK Fraud Readiness Score V1.1 - Methodology Copy Polish Decision Note

Date: 2026-07-08  
Branch: `fix/versioned-methodology-and-public-copy`  
Migration: `supabase/migrations/0009_methodology_copy_polish.sql`

## Decision

Proceed with a versioned copy-only polish of the V1 methodology so the respondent-facing assessment reads like a professional MK Fraud product rather than an internal scoring seed.

The production database correctly blocked direct mutation of `MFRS-V1.0` because that methodology version had already been used by assessments. The safe pattern is therefore to preserve `MFRS-V1.0` for existing assessment audit history, create `MFRS-V1.1`, apply the copy polish to `MFRS-V1.1`, and make `MFRS-V1.1` active for fresh assessments.

The polish is deliberately limited to:

- question prompts;
- question help text;
- exposure-factor names and option labels;
- respondent-facing examples that improve clarity across non-financial sectors;
- public UI labels that remove internal methodology codes from the customer experience.

## Guardrails

The following are not changed:

- 10-domain structure;
- 68 question codes;
- question weights;
- domain weights;
- critical-control flags;
- hard-gate flags;
- N/A eligibility rules;
- response scale scoring;
- exposure max points;
- scoring engine logic;
- maturity caps;
- report-generation logic.

Existing assessments remain tied to the methodology version they were created with. Fresh assessments use the active methodology version selected by the application.

## Why a New Methodology Version Is Required

`MFRS-V1.0` is already attached to assessment records. Mutating it in place would weaken auditability because older assessments would appear to have been answered against wording they did not actually see.

`MFRS-V1.1` solves this cleanly:

- `MFRS-V1.0` remains preserved for historical assessments;
- `MFRS-V1.1` carries the polished respondent-facing copy;
- scoring structure remains stable;
- new assessments get the better wording without rewriting the past.

## What Improved

The revised wording:

- uses practical fraud-risk language rather than examiner-style wording;
- improves examples for procurement, refunds, stock, payments, service delivery, WhatsApp journeys, digital platforms, supplier payments and identity misuse;
- makes identity and digital fraud wording work outside financial services;
- avoids asking one respondent to overstate how all employees feel;
- keeps the assessment suitable for municipalities, utilities, retail, healthcare, education, logistics, NGOs, SMEs and other non-financial-sector organisations;
- removes `D1`, `EXP-03`, question-code and phase-label language from the public respondent experience.

## Verification

A dedicated static test was added:

`npm run methodology:copy-test`

The test verifies that:

- `MFRS-V1.1` is created and targeted;
- all 68 expected question codes are present in the V1.1 copy updates;
- all 8 exposure factors are present in the V1.1 copy updates;
- `MFRS-V1.0` content is not mutated in place;
- the migration records the versioned copy-only app setting;
- the migration does not update weights, flags, N/A rules, scale scores or exposure max points;
- key MK Fraud positioning improvements are present.

The admin and respondent static tests also verify that public assessment and snapshot components do not expose internal domain codes, exposure codes, question codes, hard-gate wording or implementation phase labels.

## Post-Merge UAT

After deployment, create a fresh test assessment and review the wording on:

- exposure profile;
- fraud leadership and governance;
- fraud-risk identification;
- operational fraud controls;
- third-party and supply-chain fraud risk;
- digital and identity fraud risk;
- fraud culture and awareness.

The purpose of this UAT is qualitative: confirm that the wording feels clear, professional, sector-neutral and aligned to MK Fraud's positioning.
