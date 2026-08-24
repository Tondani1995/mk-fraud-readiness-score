# MK Fraud Readiness — reference artefacts

Owner-supplied design and brand authority for the V1.2 premium closure work. Reference
material only: nothing here is built, imported or served, and nothing in `src/` may depend
on it. It exists so composition and brand can be checked against something fixed rather
than against memory.

| File | SHA-256 (first 16) | What it is |
|---|---|---|
| `MK_Vhutshilo_Essential_Original_Design_Baseline.pdf` | `f5207b81d706dd6f` | Canonical Essential composition. 26 pages. Cover carries `RPT-MKFRS-V12-COMP-VHUTSHILO-V1`. |
| `MK_Vhutshilo_Comprehensive_Original_Design_Baseline.pdf` | `6edeb6f6bf67ba30` | Canonical Comprehensive composition. 49 pages. Cover carries 43.33 / DEVELOPING. |
| `mk-fraud-insights-logo.svg` | `ca8379771381ec3e` | Approved primary logo master. Fully vectorised, no `<text>` element. Fills are `#01123A` and `#47515A` only. |

Both PDFs were generated from the V1.2 Vhutshilo fixture frozen in
`src/lib/adaptive/fixtures/vhutshilo-v12.ts`, so the composition baseline and the
analytical baseline describe the same assessment.

The rule for every increment on this branch: original composition, approved brand,
improved analytical content. Not a redesign.
