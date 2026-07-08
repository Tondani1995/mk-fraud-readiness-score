# V1.1 Methodology Copy Polish - Live UAT Evidence

Date: 2026-07-08  
Environment: Production  
Application path: `https://www.mkfraud.co.za/score/*`  
Fresh UAT assessment reference: `MKFRS-2026-437714274E`

## Result

Live UAT confirmed that fresh assessments now use the polished V1.1 methodology wording.

## Evidence

A fresh assessment was created from `/score/start`.

Reference created:

`MKFRS-2026-437714274E`

The continuation link opened correctly under the deployed `/score` base path:

`/score/assessment/MKFRS-2026-437714274E?token=...`

The exposure profile displayed the expected V1.1 copy signal:

`EXP-03 · Digital channel reliance (portals, apps, online forms, WhatsApp journeys or customer platforms)`

This confirms that new assessments are pulling the polished methodology-facing copy rather than the old short V1.0 wording.

## Methodology Versioning Outcome

Existing earlier assessments were not changed or submitted during this test. The MFRS-V1.0 audit trail therefore remains intact for assessments already created against that methodology version.

Fresh assessments now use MFRS-V1.1-facing copy.

## Important Production Note

The first direct copy-polish migration attempt against MFRS-V1.0 failed because production correctly prevented mutation of a methodology version already used by assessments. The safe production approach was to use a new methodology version, MFRS-V1.1, preserving V1.0 for historical assessment auditability.

## Remaining Repo Hygiene Item

The repository should be reconciled so the stored migration reflects the production-safe versioned approach rather than an in-place update against MFRS-V1.0. A corrective PR should update the migration and tests to document and enforce the V1.1 methodology-versioning pattern.

## Gate Decision

Methodology copy polish live UAT: PASSED for fresh assessments.

Next recommended action: create the repo hygiene PR that replaces the direct V1.0 mutation migration with the versioned MFRS-V1.1 migration pattern used successfully in production.
