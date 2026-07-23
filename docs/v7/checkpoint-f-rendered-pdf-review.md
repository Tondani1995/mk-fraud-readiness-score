# Checkpoint F — rendered PDF commercial review

## Review state

- Pull request: **#39**
- Expected branch: `feat/essential-report-v7-commercial-product-hardening`
- Pre-edit head confirmed locally, remotely and on PR #39: `2d2195b75d88ffb9dbb328e67651f6ab7c3afe2d`
- Checkpoint F implementation commit: recorded in the follow-up artifact-publication commit
- Review date: 23 July 2026
- Production AI: **off**
- Production data or credentials used: **none**
- Production migration or write: **none**
- Merge or deployment: **none**
- Decision state: **Checkpoint F implemented; controller visual and release approval remains outstanding**

The candidate set was produced through the real `renderValidatedCommercialPdf()` orchestration seam and the real Chromium renderer. The existing fail-closed commercial quality gate ran before HTML or PDF generation. No quality failure was bypassed.

## Fixed synthetic candidate set

| Candidate | Fixture and narrative mode | Pages | Bytes |
|---|---|---:|---:|
| `mk-essential-v7-materially-weak-ai.pdf` | Materially weak; injected, structurally and factually validated AI editorial plan | 69 | 1,806,203 |
| `mk-essential-v7-materially-weak-fallback.pdf` | Same materially weak assessment authority; AI disabled; deterministic fallback narrative | 69 | 1,803,283 |
| `mk-essential-v7-moderate-ai.pdf` | Moderate control gaps; injected, structurally and factually validated AI editorial plan | 34 | 1,004,972 |
| `mk-essential-v7-clean-assurance-ai.pdf` | Strong clean self-assessment; assurance-validation framing; injected, validated AI editorial plan | 30 | 928,873 |

Every fixture uses a fixed synthetic organisation name, assessment reference, report reference and UTC generation timestamp. Private fixture fields were deliberately populated but verified absent from customer-visible output.

## Render and inspection method

Each candidate was generated twice from the same fixed input. Both PDFs were rendered page-by-page to PNG at 200 DPI. The first and second PNG sets were compared page-for-page and were pixel-identical across all **202** pages.

The publication artifact contains:

- `pdf/` — four candidate PDFs;
- `renders/<candidate>/page-NNN.png` — all 202 first-run page renders;
- `contact-sheets/` — 18 contact sheets covering every page;
- `inspection/pdf-audit.json` — stable-code audit result;
- `inspection/page-by-page-review.md` — a page-level table for all 202 pages;
- `inspection/section-map.json` — customer-visible section-to-page mapping;
- `inspection/commercial-review.md` — this commercial review;
- `extracted-text/` — extracted text for all candidates.

All 18 post-fix contact sheets were inspected. Every final page was checked for clipping, overlap, content outside the print area, blank or footer-only output, duplicated pages, unexpected page breaks, orphaned short records, broken tables, inconsistent header/footer treatment and false clean-assurance language.

### Page-by-page outcome

| Candidate | Pages inspected | Result |
|---|---:|---|
| Materially weak AI | 1–69 | Pass — no remaining visual or structural defect |
| Materially weak fallback | 1–69 | Pass — no remaining visual or structural defect |
| Moderate AI | 1–34 | Pass — no remaining visual or structural defect |
| Clean assurance AI | 1–30 | Pass — no remaining visual or structural defect |

The detailed per-page record is published in `inspection/page-by-page-review.md`; contact-sheet references and individual PNG names are included there.

## Defects found and corrected

1. **Legacy commercial structure and shallow authority.** The old template displayed the legacy roadmap adapter, internal register IDs and abbreviated risk, control, evidence and decision fields. It also contained unsupported assurance phrasing. The renderer now uses the authoritative Checkpoint D advisory model for customer-visible material findings, scenarios, risk register, control plan, evidence checklist, leadership decisions, functional agenda and the only 30/60/90-day roadmap.

2. **Short-record orphan pages.** In the first rendered set, a leadership decision and the last roadmap action could leave a few continuation lines on an otherwise sparse page. Decision and roadmap records now use the explicit short-record pagination class and stay intact. The full set was regenerated and reinspected.

3. **Sparse clean-assurance pages.** The first clean candidate gave “no material contradiction” and an uncapped false-comfort statement separate pages with excessive unused space. Clean/uncapped results now retain every required heading while consolidating related assurance content. The clean candidate reduced from 32 to 30 pages without hiding evidence or inventing weakness.

4. **Internal-ID audit false positives.** The first scanner treated ordinary words such as “risk-based” as internal risk IDs. The stable rule now requires the internal prefix plus a numeric identifier. The corrected audit still blocks `QG_`, UUIDs and numeric `MF-`, `RISK-`, `SC-`, `CI-` and `DEC-` identifiers.

No blocking defect remained after the final full double-render.

## Automated audit result

Checkpoint F passed **15/15** tests with **zero** blocking audit failures. The audit verified:

- PDF signatures, non-trivial size, A4 portrait dimensions and page counts;
- expected organisation and report references;
- every required commercial section;
- no blank, footer-only, visually blank or duplicated page;
- one 200-DPI raster for every physical page;
- pixel-identical repeated renders;
- no forbidden legacy copy, raw evidence references, internal identifiers, UUIDs, private email, secret pattern, URL, Markdown marker or AI provenance;
- AI narrative placement only in AI candidates;
- fallback narrative absence from AI mode;
- identical deterministic risk, control, evidence, decision and roadmap authority between the weak AI and weak fallback candidates;
- no false control-failure language in the clean assurance candidate;
- no duplicate risk, leadership-decision or roadmap authority;
- `Not yet requested` for every evidence checklist item.

## AI and fallback comparison

The weak AI and weak fallback PDFs intentionally differ in the executive, false-comfort, leadership, domain and gap commentary written by the validated editorial layer. Their material findings, contradictions, scenarios, risks, controls, evidence requirements, decisions, roadmap actions, measures, dependencies and accountability are derived from the same deterministic advisory model and were verified equal.

The clean candidate uses assurance-validation scenarios and does not convert a strong self-reported result into a fabricated control failure. It continues to state the self-assessment limitation and the need for independent operating evidence.

## Commercial review rubric

| Category | Score / 10 | Review note |
|---|---:|---|
| Executive usefulness | 9.7 | Clear diagnosis, priority framing, decisions and accountable actions |
| Evidence fidelity | 9.9 | Full authoritative fields rendered without raw internal references |
| Risk and control specificity | 9.8 | Cause, event, impacts, rationales, design, test and escalation are visible |
| Decision and roadmap quality | 9.8 | Distinct decisions; one authoritative dependency-aware roadmap |
| Visual hierarchy and navigation | 9.6 | Consistent A4 hierarchy, section markers, page numbering and continuation tables |
| Readability and pagination | 9.5 | Dense weak case remains readable; no clipping, overlaps or orphaned short records |
| AI/fallback integrity | 9.9 | Narrative varies while deterministic accounting and authority remain unchanged |
| Clean-assurance integrity | 9.8 | Strong result remains strong; assurance need is stated without invented failure |
| Privacy and release safety | 10.0 | Synthetic only; no credentials, private fields, production activation, merge or deploy |
| Price-worthiness | 9.5 | Substantive, evidence-linked advisory deliverable with controller-ready review artifacts |
| **Overall** | **9.75** | Arithmetic mean |

Every category and the overall score meet the 9.5 recommendation threshold. The release candidate is therefore recommended for controller visual and commercial review. This recommendation is **not** controller approval and is **not** authority to merge, activate production AI or deploy.

## Known limitations and outstanding decision

- The review uses fixed synthetic fixtures, not production customer data.
- Pixel determinism was established in the Checkpoint F Chromium environment; a future browser-version change should rerun the same audit.
- Chromium writes volatile PDF container metadata, so PDF-file hashes are recorded in each run’s `pdf-audit.json` but are not used as the visual-determinism criterion. The 200-DPI page PNGs are the deterministic comparison authority.
- The materially weak case is deliberately long because it exposes all authoritative fields for 11 findings, 46 evidence items, six decisions and 11 roadmap actions. The density is appropriate for a reference-grade Essential Report, but the controller should make the final commercial judgement.
- Automated and agent visual inspection do not replace controller approval.

**Outstanding:** controller review of the published PDFs and artifacts, followed by an explicit release decision. PR #39 must remain draft and unmerged until that decision.
