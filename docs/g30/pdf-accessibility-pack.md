# G30 PDF accessibility and quality pack

Covers the delivered premium report artefact (J20).

## The distinction this pack turns on

**Visual PDF QA** asks: does the document *look* right — correct pages, no clipping, no overlap,
readable type, consistent numbering, sensible charts and tables. This is well covered at the
certified SHA by `scripts/checkpoint-f-pdf-audit.py` (42 failure codes) and
`scripts/phase-v7-checkpoint-f-rendered-pdf-tests.mjs`.

**Semantic PDF accessibility QA** asks: can assistive technology *understand* the document — is
there a structure tree, are headings marked as headings, are tables marked as tables with header
cells, is the reading order declared, is a document language set, do images carry alternative
text. This is **not covered at all**, and cannot be, because of the renderer.

Conflating the two would let a visually excellent report be signed off as accessible. G30 must
report them separately.

---

## Architectural finding: the PDF is untagged

`src/lib/reports/render-pdf.ts` produces the PDF via Chromium's print-to-PDF (`page.pdf()`), driven
by `puppeteer-core` and `@sparticuz/chromium`. `src/lib/reports/pdf-navigation.ts` then post-processes
the buffer with `pdf-lib` to add a real `/Outlines` bookmark tree and to compute table-of-contents
page numbers from the final layout.

Searching the certified tree for `StructTreeRoot`, `MarkInfo`, `PDF/UA` or `setLang` returns no
production code. Chromium's print-to-PDF does not emit a tagged PDF, and nothing downstream adds
one.

Consequences, all of which G30 must state plainly rather than work around:

- No `/StructTreeRoot` — no logical structure for assistive technology to follow.
- No `/MarkInfo /Marked true` — the document does not declare itself tagged.
- No document `/Lang` — screen readers fall back to the system voice, even though the source HTML
  correctly declares `lang="en-ZA"` (`src/lib/reports/templates/report-template.ts:544`).
- No `/Alt` on any figure, and no artefact marking for decorative content.
- Headings, lists and table cells exist visually but not semantically.

**What *is* present and does help:** a genuine bookmark outline, a table of contents with page
numbers computed from the real layout, and selectable extractable text (the audit script's
`PDF_BLANK_OR_FOOTER_ONLY_PAGE` / `PDF_NEAR_EMPTY_PAGE` checks depend on text extraction, so text
extraction is proven to work).

**Position for G30:** record this as a known architectural limitation of the certified renderer,
with its consequence stated for the customer. Do not attempt to fix it inside G30, and do not
describe the report as an accessible PDF. Producing a tagged PDF would require a different
rendering path and is a product decision for a later gate.

---

## Part A — Visual and content PDF QA

Largely automated. Run `scripts/checkpoint-f-pdf-audit.py` against the delivered artefact and
attach its JSON output.

### PDF-V-01 — Page reading order (visual)

**Procedure:** read the document front to back at 100% zoom. Confirm the visual order matches the
intended narrative order and the table of contents.

**Pass:** every section appears in TOC order; no section is split across a page boundary in a way
that breaks its meaning.

**Automated support:** `PDF_TOC_MISSING`, `PDF_TOC_PAGE_MISMATCH`, `PDF_REQUIRED_SECTION_MISSING`.

### PDF-V-02 — Selectable text

**Procedure:** select a paragraph on pages 1, a mid-document page and the final appendix page.
Copy and paste into a plain-text editor.

**Pass:** real text is selected and pasted, character-accurate, on every page. No page is an image.

**Automated support:** the audit script's text extraction; `PDF_FILE_TOO_SMALL`,
`PDF_RENDERED_PAGE_VISUALLY_BLANK`.

### PDF-V-03 — Heading appearance and hierarchy

**Procedure:** confirm each section heading is visually distinct from body text and that the visual
hierarchy is consistent throughout.

**Pass:** headings are consistently styled and unambiguous at a glance.

*(Semantic heading markup is assessed in Part B, where it is expected to be absent.)*

### PDF-V-04 — Table readability

**Procedure:** for every table (the appendix registers A1–A4 in particular), confirm header rows
are visually distinguished, no cell content is clipped, no row is orphaned from its header across a
page break, and column alignment is consistent.

**Pass:** every table is readable without inferring which column a value belongs to.

**Watch:** a table that breaks across pages without repeating its header row is a visual failure
here and a semantic failure in Part B.

### PDF-V-05 — Chart interpretation

**Procedure:** for every chart or scored visual, confirm the same information is also available in
text or in an adjacent table.

**Pass:** no chart is the sole carrier of any finding. A reader who cannot see the chart still gets
the information.

**Note:** if the report contains no charts at this SHA, record that explicitly — it is a pass, and
it also means Part B's alternative-text gap has no practical impact.

### PDF-V-06 — Contrast

**Procedure:** sample foreground/background for body text, headings, table headers, table body,
callouts and any coloured status indicator. Compute ratios.

**Pass:** ≥ 4.5:1 for body text, ≥ 3:1 for large text. Print-oriented greys are the usual failure —
measure, do not assume.

### PDF-V-07 — Font sizing

**Procedure:** measure the rendered point size of body text, table body text and footnotes.

**Pass:** body ≥ 10 pt; table body ≥ 9 pt; no text below 8 pt. Record any text under 9 pt with its
location.

### PDF-V-08 — Link accessibility

**Procedure:** identify every link in the document. Confirm the link text describes its
destination and that the underlying URI is correct.

**Pass:** no bare URLs as link text where a description is possible; no broken internal link.

**Note:** `PDF_FORBIDDEN_URL` in the audit script constrains which URLs may appear at all — read
its result before judging this case.

### PDF-V-09 — Print readability

**Procedure:** print to A4 on a monochrome printer. Read the printed output.

**Pass:** all content is legible in greyscale; no information is lost when colour is removed; no
content falls in the non-printable margin.

**Note:** the template sets `@page { size: A4 portrait; margin: 0; }` — confirm content is not
clipped by the physical printer margin.

### PDF-V-10 — Page-number consistency

**Procedure:** confirm every page carries a page number, numbering is continuous, and TOC entries
resolve to the correct page.

**Pass:** no gap, no repeat, no TOC entry off by a page.

**Automated support:** `PDF_TOC_PAGE_MISMATCH`, `PDF_PAGE_COUNT_INVALID`,
`PDF_RENDER_PAGE_COUNT_MISMATCH`, `PDF_DUPLICATE_PAGE`.

### PDF-V-11 — No clipping or overlap

**Procedure:** render every page to an image and inspect for text crossing the page edge, text
overlapping text, or an element overlapping the footer.

**Pass:** no clipping and no overlap on any page.

**Automated support:** `PDF_BLANK_OR_FOOTER_ONLY_PAGE`, `PDF_NEAR_EMPTY_PAGE`,
`PDF_RENDERED_PAGE_VISUALLY_BLANK`, `PDF_VISUAL_NONDETERMINISM`.

**Environment note:** `PDF_NEAR_EMPTY_PAGE` is known to be environment-sensitive — it can fail
locally on macOS while passing in CI. Treat the CI result as authoritative and record which
environment produced the attached evidence.

### PDF-V-12 — Zoom behaviour

**Procedure:** in each target viewer (iOS Files/Preview, Android Chrome PDF viewer, macOS Preview,
Chrome, Edge), zoom to 200% and 400%.

**Pass:** text remains sharp (vector, not raster) at 400%; no rendering artefact; the viewer's
reflow mode, where offered, produces readable text.

---

## Part B — Semantic PDF accessibility QA

Every case below is expected to **fail or be not-applicable** at the certified SHA for the reason
given in the architectural finding. Run them anyway and record the actual result: the recorded
gap is the deliverable, and it is what a later remediation gate will be measured against.

Tooling: a PDF structure inspector (Acrobat Pro's accessibility checker, `veraPDF`, or a `pdf-lib`
/ `pypdf` catalogue dump). None of these are repository dependencies; the reviewer supplies them.

### PDF-S-01 — Document declares itself tagged

**Procedure:** inspect the document catalogue for `/MarkInfo << /Marked true >>`.

**Pass:** present.

**Expected:** absent.

### PDF-S-02 — Structure tree present

**Procedure:** inspect the catalogue for `/StructTreeRoot` and dump the structure element tree.

**Pass:** a structure tree exists whose order matches the visual reading order.

**Expected:** absent.

### PDF-S-03 — Document language

**Procedure:** inspect the catalogue for `/Lang`.

**Pass:** `/Lang (en-ZA)`.

**Expected:** absent, despite the source HTML declaring `lang="en-ZA"`.

### PDF-S-04 — Heading semantics

**Procedure:** confirm section headings are `/H1`…`/H6` structure elements.

**Pass:** present and correctly nested.

**Expected:** absent. Bookmarks provide navigation but are not heading semantics.

### PDF-S-05 — Table semantics

**Procedure:** confirm tables are `/Table` with `/TR`, `/TH` and `/TD`, and that header cells carry
scope.

**Pass:** present.

**Expected:** absent. Appendix registers will read as unstructured text runs.

### PDF-S-06 — List semantics

**Procedure:** confirm bulleted and numbered content uses `/L`, `/LI`, `/Lbl` and `/LBody`.

**Expected:** absent.

### PDF-S-07 — Alternative text

**Procedure:** confirm every non-text object carries `/Alt`, and every decorative object is marked
as an artefact.

**Expected:** absent. Impact is limited if PDF-V-05 records that the report contains no charts —
state the finding either way.

### PDF-S-08 — Declared reading order

**Procedure:** compare the structure-tree order against the visual order.

**Expected:** not applicable — there is no structure tree. The reading order a screen reader
actually gets is the content-stream order, which is a rendering artefact rather than a declared
intent. Record what a reader actually produces (see SR-12).

### PDF-S-09 — Bookmarks and navigation

**Procedure:** open the bookmark panel. Confirm every major section and appendix is listed and each
bookmark navigates to the correct page.

**Pass:** present and correct.

**Expected: PASS** — `pdf-navigation.ts` writes a genuine `/Outlines` tree, and
`PDF_BOOKMARKS_MISSING` guards it. This is the one semantic navigation affordance the document
does have, and it should be stated as such.

### PDF-S-10 — Assistive-technology read-through

**Procedure:** SR-12 in the [keyboard and screen-reader pack](keyboard-screenreader-pack.md).

**Pass:** the document is comprehensible when read by VoiceOver in the target viewers.

**Expected:** partially comprehensible — text extraction works, so a linear read produces the
words, but there is no heading navigation, no table structure and no declared language. Record the
transcript.

---

## Reporting requirement

The G30 sign-off must carry two distinct PDF lines:

1. **PDF visual and content quality** — PASS / FAIL with the audit JSON attached.
2. **PDF semantic accessibility** — a recorded statement of the untagged-PDF limitation, its
   customer impact, and an explicit owner decision to accept it for this release or to raise it as
   a follow-up.

Reporting a single combined "PDF: PASS" would misrepresent the artefact and must not be used.
