# MK Fraud Readiness Score V1 - Methodology Copy Polish Decision Note

Date: 2026-07-08  
Branch: `v1/methodology-copy-polish`  
Migration: `supabase/migrations/0009_methodology_copy_polish.sql`

## Decision

Proceed with a copy-only polish of the V1 methodology so the respondent-facing assessment reads like a professional MK Fraud product rather than an internal scoring seed.

The polish is deliberately limited to:

- question prompts;
- question help text;
- exposure-factor names and option labels;
- respondent-facing examples that improve clarity across non-financial sectors.

## Guardrails

The following are not changed:

- methodology version code;
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

## Why a New Migration Was Used

The original Phase 5 methodology seed remains intact. This copy polish is added through a new migration so the change is auditable and can be reviewed separately from the original scoring design.

## What Improved

The revised wording:

- uses practical fraud-risk language rather than examiner-style wording;
- improves examples for procurement, refunds, stock, payments, service delivery, WhatsApp journeys, digital platforms, supplier payments and identity misuse;
- makes identity and digital fraud wording work outside financial services;
- avoids asking one respondent to overstate how all employees feel;
- keeps the assessment suitable for municipalities, utilities, retail, healthcare, education, logistics, NGOs, SMEs and other non-financial-sector organisations.

## Verification

A dedicated static test was added:

`npm run methodology:copy-test`

The test verifies that:

- all 68 expected question codes are present;
- all 8 exposure factors are present;
- the migration records the copy-only app setting;
- the migration does not update weights, flags, N/A rules, scale scores or exposure max points;
- key MK Fraud positioning improvements are present.

## Post-Merge UAT

After deployment, create or resume a test assessment and review the wording on:

- exposure profile;
- D1 governance;
- D2 fraud-risk identification;
- D3 operational controls;
- D7 third-party risk;
- D8 digital and identity fraud;
- D9 culture and awareness.

The purpose of this UAT is qualitative: confirm that the wording feels clear, professional, sector-neutral and aligned to MK Fraud's positioning.
