#!/usr/bin/env python3
"""Credential-free rendered-PDF audit and review-artifact builder for V7 Checkpoint F."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw
from pypdf import PdfReader


def resolve_head_sha() -> str:
    """Checkpoint F controller review blocker 8: review metadata must be computed from the final
    artifact, not hard-coded -- including the head SHA the candidates were built from.

    Final controller review round: on a pull_request CI run, the checked-out working tree is the
    synthetic merge-ref commit (refs/pull/<PR>/merge), not the PR branch head GitHub ties the
    artifact to -- so `git rev-parse HEAD` alone would silently record the wrong SHA. The workflow
    exports V7_ARTIFACT_HEAD_SHA (github.event.pull_request.head.sha, falling back to github.sha for
    non-PR runs); that always wins when present. `git rev-parse HEAD` remains a local-dev fallback
    for running this script directly, outside CI, where no such env var exists."""
    env_sha = os.environ.get("V7_ARTIFACT_HEAD_SHA", "").strip()
    if env_sha:
        return env_sha
    try:
        repo_root = Path(__file__).resolve().parent.parent
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=str(repo_root), stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return "unknown"


# Checkpoint F controller review blocker 4: executive-core section headings, in rendered order.
# Kept in sync with REPORT_TOC_ENTRIES in src/lib/reports/templates/report-template.ts -- every
# core (non-appendix) key there must appear here, plus "Contents" and the appendix divider/A1-A7
# headings that TOC entry list also tracks.
REQUIRED_SECTIONS = [
    "Contents",
    "Executive summary",
    "What the result means",
    "Domain overview",
    "Priority findings, contradictions and scenarios",
    "Priority risks",
    "Leadership decisions and roadmap",
    "Evidence validation priorities",
    "Methodology, limitations and next steps",
    "Appendix",
    "A1. Complete material findings register",
    "A2. Complete risk register",
    "A3. Complete control improvement register",
    "A4. Complete evidence checklist",
    "A5. Functional agenda",
    "A6. Methodology question-code mapping",
    "A7. Definitions and score basis",
]

FORBIDDEN = {
    "PDF_FORBIDDEN_CORE_CONTROL_COPY": re.compile(r"\bA core control area\b", re.I),
    "PDF_FORBIDDEN_CREDIBLE_POSITION": re.compile(r"\bThis is a credible position\b", re.I),
    "PDF_FORBIDDEN_DEFENSIBLE_POSITION": re.compile(r"\ba defensible position\b", re.I),
    "PDF_FORBIDDEN_GENUINE_READINESS": re.compile(r"\bgenuine readiness\b", re.I),
    "PDF_FORBIDDEN_INTERNAL_IDENTIFIER": re.compile(
        r"\b(?:QG_[A-Z0-9_]+|(?:MF|RISK|SC|CI|DEC|RA)-[A-Z0-9]*\d[A-Z0-9]*|[0-9a-f]{8}-[0-9a-f-]{27,})\b",
        re.I,
    ),
    "PDF_FORBIDDEN_EMAIL": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    "PDF_FORBIDDEN_SECRET": re.compile(
        r"\b(?:sk-[A-Za-z0-9_-]{12,}|service_role|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY)\b", re.I
    ),
    "PDF_FORBIDDEN_URL": re.compile(r"https?://|www\.", re.I),
    "PDF_FORBIDDEN_MARKDOWN": re.compile(r"(?:^|\n)\s{0,3}(?:#{1,6}\s|```|\*\s)", re.M),
    "PDF_FORBIDDEN_AI_PROVENANCE": re.compile(
        r"\b(?:AI provider|generation mode|prompt version|schema version|model identifier)\b", re.I
    ),
}

# Checkpoint F controller review corrections -- additional stable-code gates.
EXPOSURE_BANDS = ["Low", "Moderate", "High", "Severe"]

# Blocker 4: page-count budget by fixture (executive core, or core+appendix combined for now --
# see the "outstanding" note in inspection/commercial-review.md if compression work is incomplete).
PAGE_BUDGET = {"materially-weak": 42, "moderate": 28, "clean": 22}
WORD_BUDGET = {"materially-weak": 15000, "moderate": 8500, "clean": 7500}

# Blocker 3: no checkpoint/fixture/test/pipeline/provider jargon in customer-facing prose.
# Deliberately does NOT ban the bare phrase "evidence pack" -- question-playbooks.ts legitimately
# uses it to mean a physical/document compliance folder (e.g. a supplier's pre-activation evidence
# pack), which is ordinary business English, not internal AI-pipeline jargon.
META_TEST_COPY = re.compile(
    r"\bcheckpoint [a-z]\b|\bdeterministic (?:advisory )?model\b|\bdeterministic evidence pack\b|"
    r"\bprompt version\b|\bschema version\b|\bvalidator\b|\beditorial plan\b|\bfixture\b|"
    r"\btest candidate\b|\bQA artefact\b|\bpipeline\b",
    re.I,
)

# Blocker 6: internal question codes (e.g. D1-Q04) must not appear in the core customer-facing report.
METHOD_CODE = re.compile(r"\bD\d{1,2}-Q\d{2}\b")
METHOD_CODE_LIMIT = 0

# Blocker 1 (rendered-PDF proof): literal absolute-assertion fragments that can only appear if the
# raw (non-resilience) pathway text leaked into a clean-assurance candidate -- mirrors
# ASSURANCE_BODY_ASSERTION_PATTERNS in src/lib/reports/evidence-model/index.ts.
ASSURANCE_SEMANTIC_FAILURE = re.compile(
    r"are not clearly separated|are not documented and rehearsed|is not completely restricted, logged|"
    r"\bhave failed\b|\bhas failed\b|is delayed or uncoordinated|remain unresolved or accepted|"
    r"remain ownerless|cannot be relied upon|may be unable to demonstrate|provide false comfort",
    re.I,
)

# Blocker 5: near-empty/tail-page detection. Cover (1) and the governance/version page (2) are
# allowed exceptions; the final page of each candidate is also exempted in the per-candidate loop.
NEAR_EMPTY_EXEMPT_PAGES = {1, 2}
NEAR_EMPTY_CHAR_THRESHOLD = 600
# Final controller review round: raw dark-pixel *density* (the previous 0.02 ink-ratio threshold)
# is a poor proxy for how much of the page is actually used -- a short paragraph or a small partial
# chart has similar pixel-level darkness to a denser page, since both are mostly whitespace between
# strokes, so a real continuation page (a chart fragment clinging to the top of an otherwise blank
# page) could clear a 2% density bar while leaving most of the page unused. Occupied *area* --
# specifically, how far down the body region the content's bounding box actually extends -- is what
# distinguishes that case. 0.34 means content must span at least roughly a third of the body height;
# below that, more than roughly two-thirds of the body area is unused.
NEAR_EMPTY_OCCUPIED_RATIO_THRESHOLD = 0.34


def body_region_occupied_ratio(image_path: Path) -> float:
    """Fraction of the page body's vertical extent (excluding a thin header/footer band) actually
    spanned by non-white content, measured from the topmost to the bottommost non-white row of the
    body region. Unlike raw dark-pixel density, this catches a page whose only content is a small
    chart fragment or a couple of trailing rows clinging to the top of the page while the remaining
    two-thirds-plus of the body is blank."""
    with Image.open(image_path).convert("L") as image:
        width, height = image.size
        top = int(height * 0.05)
        bottom = int(height * 0.95)
        region = image.crop((0, top, width, bottom))
        mask = region.point(lambda p: 255 if p < 235 else 0)
        bbox = mask.getbbox()
        if bbox is None:
            return 0.0
        _, content_top, _, content_bottom = bbox
        return (content_bottom - content_top) / region.height if region.height else 0.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def record(checks: list[dict], code: str, passed: bool, candidate: str, detail: str) -> None:
    checks.append(
        {
            "code": code,
            "passed": bool(passed),
            "candidate": candidate,
            "detail": detail,
        }
    )


def normalise_page(text: str) -> str:
    text = re.sub(r"MK Essential Report\s*·\s*Confidential\s*\d+\s*/\s*\d+", "", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip().lower()


def create_contact_sheets(candidate: str, images: list[Path], output_dir: Path) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    emitted: list[str] = []
    per_sheet = 12
    thumb_width = 330
    thumb_height = 467
    columns = 3
    rows = 4
    gutter = 30
    header = 55
    for sheet_index in range(0, len(images), per_sheet):
        batch = images[sheet_index : sheet_index + per_sheet]
        canvas = Image.new(
            "RGB",
            (
                columns * thumb_width + (columns + 1) * gutter,
                rows * thumb_height + (rows + 1) * gutter + header,
            ),
            "white",
        )
        draw = ImageDraw.Draw(canvas)
        draw.text((gutter, 18), f"{candidate} — pages {sheet_index + 1}–{sheet_index + len(batch)}", fill="#071b3d")
        for offset, path in enumerate(batch):
            image = Image.open(path).convert("RGB")
            image.thumbnail((thumb_width, thumb_height))
            x = gutter + (offset % columns) * (thumb_width + gutter)
            y = header + gutter + (offset // columns) * (thumb_height + gutter)
            canvas.paste(image, (x, y))
            draw.rectangle((x - 1, y - 1, x + image.width, y + image.height), outline="#b8b1a5")
            draw.text((x + 5, y + 5), str(sheet_index + offset + 1), fill="#a61b1b")
        out = output_dir / f"{candidate}-{sheet_index // per_sheet + 1:02d}.png"
        canvas.save(out, optimize=True)
        emitted.append(str(out.relative_to(output_dir.parent)))
    return emitted


def render_commercial_review(candidate_results: dict[str, dict], head_sha: str) -> str:
    """Checkpoint F controller review blocker 8: every number here is read straight out of
    candidate_results / head_sha, computed earlier in this same run from the final artifact -- never
    hard-coded from a previous run. Also drops the prior "9.75/10" self-score rubric: an
    implementation agent cannot award controller approval, so this document states findings and
    defers the release decision explicitly instead of grading itself."""
    lines = [
        "# Checkpoint F -- rendered PDF commercial review (generated)",
        "",
        "This file is generated by scripts/checkpoint-f-pdf-audit.py from the final candidate PDFs "
        "produced in this run. It is a factual summary of what was checked, not a controller approval "
        "and not a self-awarded score -- Claude cannot approve Checkpoint F.",
        "",
        "## Review state",
        "",
        f"- Head SHA at generation time: `{head_sha}`",
        "- Production AI: **off**; production data/credentials used: **none**; production migration, "
        "write, merge or deployment: **none**.",
        "- Decision state: **awaiting controller review**.",
        "",
        "## Candidate artifact metadata (computed from the final PDFs)",
        "",
        "| Candidate | Mode | Fixture | Pages | Bytes | SHA-256 |",
        "|---|---|---|---:|---:|---|",
    ]
    for name in sorted(candidate_results):
        result = candidate_results[name]
        lines.append(
            f"| `{name}.pdf` | {result['mode']} | {result['fixture']} | {result['pages']} | "
            f"{result['bytes']:,} | `{result['sha256']}` |"
        )
    lines.extend([
        "",
        "## What was checked",
        "",
        "See `inspection/pdf-audit.json` for the complete, stable-coded check list (structural "
        "validity, A4 dimensions, required sections, forbidden legacy/internal-identifier/PII/secret/"
        "URL patterns, blank/near-empty/duplicate pages, pixel determinism, AI-vs-fallback "
        "deterministic authority, clean-assurance semantics, exposure-heading accuracy, internal "
        "question-code exposure, page-count budget and AI-narrative differentiation).",
        "",
        "See `inspection/ai-vs-fallback-review.md` and `inspection/clean-assurance-semantic-review.md` "
        "for the two review-specific defect classes this correction round targeted.",
        "",
        "## Outstanding",
        "",
        "Controller review of the published PDFs and artifacts, followed by an explicit release "
        "decision, remains required. PR #39 must remain draft and unmerged until that decision.",
        "",
    ])
    return "\n".join(lines) + "\n"


def verify_review_metadata(review_markdown: str, candidate_results: dict[str, dict], head_sha: str) -> bool:
    # Final controller review round: when the workflow has exported a PR-head override (the only
    # situation where the checked-out git commit can be a merge-ref rather than the real PR head --
    # see resolve_head_sha()), the generated head_sha must be exactly that override. This is the
    # guard that actually stops a merge-ref SHA from silently passing: if some future change
    # reintroduces an unconditional `git rev-parse HEAD` anywhere in the head-SHA path, head_sha
    # would again diverge from the override and this check fails the build.
    expected_override = os.environ.get("V7_ARTIFACT_HEAD_SHA", "").strip()
    if expected_override and head_sha != expected_override:
        return False
    if f"`{head_sha}`" not in review_markdown:
        return False
    for name, result in candidate_results.items():
        row = (
            f"| `{name}.pdf` | {result['mode']} | {result['fixture']} | {result['pages']} | "
            f"{result['bytes']:,} | `{result['sha256']}` |"
        )
        if row not in review_markdown:
            return False
    return True


def write_ai_vs_fallback_review(artifact: Path, checks: list[dict]) -> None:
    relevant = [c for c in checks if c["code"] in ("PDF_AI_FALLBACK_AUTHORITY_MISMATCH", "PDF_AI_BODY_NOT_RENDERED", "PDF_FALLBACK_RENDERED_AS_AI", "PDF_AI_NOT_MATERIALLY_DIFFERENT", "PDF_AI_GENERIC_REPETITION", "PDF_META_TEST_COPY")]
    lines = [
        "# AI vs fallback narrative review",
        "",
        "Checks that the AI editorial narrative and the deterministic fallback narrative render "
        "identical authoritative material findings, risks, controls, evidence, decisions and roadmap "
        "actions for the same assessment, that the AI narrative differs materially across fixtures "
        "(not just by organisation name), and that no checkpoint/test/pipeline jargon reached "
        "customer-facing prose.",
        "",
        "| Code | Candidate | Passed | Detail |",
        "|---|---|---|---|",
    ]
    for item in relevant:
        lines.append(f"| {item['code']} | {item['candidate']} | {'yes' if item['passed'] else 'NO'} | {item['detail']} |")
    (artifact / "inspection" / "ai-vs-fallback-review.md").write_text("\n".join(lines) + "\n")


def write_clean_assurance_semantic_review(artifact: Path, checks: list[dict], candidate_results: dict[str, dict]) -> None:
    relevant = [c for c in checks if c["code"] in ("PDF_CLEAN_ASSURANCE_SEMANTIC_FAILURE", "PDF_CLEAN_FALSE_FAILURE_LANGUAGE")]
    clean_candidates = [name for name, result in candidate_results.items() if result["fixture"] == "clean"]
    lines = [
        "# Clean-assurance semantic review",
        "",
        "Checkpoint F controller review blocker 1: a clean/assurance-priority candidate must preserve "
        "the reported strong/operating control state and never assert failure, absence, non-"
        "documentation, non-separation, unrestricted access or incomplete operation as a present fact. "
        "Treatment must begin with independent validation, with redesign conditional on a validated "
        "defect.",
        "",
        f"Clean candidates checked: {', '.join(clean_candidates) or 'none'}.",
        "",
        "| Code | Candidate | Passed | Detail |",
        "|---|---|---|---|",
    ]
    for item in relevant:
        lines.append(f"| {item['code']} | {item['candidate']} | {'yes' if item['passed'] else 'NO'} | {item['detail']} |")
    (artifact / "inspection" / "clean-assurance-semantic-review.md").write_text("\n".join(lines) + "\n")


def write_manifest(artifact: Path, candidate_results: dict[str, dict], report: dict) -> None:
    files = sorted(str(p.relative_to(artifact)) for p in artifact.rglob("*") if p.is_file())
    manifest = {
        "schemaVersion": "checkpoint-f-manifest-v1",
        "headSha": report["headSha"],
        "fileCount": len(files),
        "files": files,
        "candidateCount": len(candidate_results),
        "auditPassed": report["passed"],
    }
    (artifact / "inspection" / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> int:
    # Isolated, fast debug entry point used by the PR-head-vs-merge-ref regression test (F16 in
    # phase-v7-checkpoint-f-rendered-pdf-tests.mjs) -- prints only the SHA resolve_head_sha() would
    # use, without rendering or auditing any candidate.
    if len(sys.argv) == 2 and sys.argv[1] == "--print-resolved-head-sha":
        print(resolve_head_sha())
        return 0
    if len(sys.argv) != 3:
        raise SystemExit("usage: checkpoint-f-pdf-audit.py <artifact-dir> <metadata-json>")
    artifact = Path(sys.argv[1]).resolve()
    metadata = json.loads(Path(sys.argv[2]).read_text())
    checks: list[dict] = []
    candidate_results: dict[str, dict] = {}
    section_map: dict[str, dict[str, list[int]]] = {}
    toc_bookmark_map: dict[str, dict] = {}
    review_lines = [
        "# Checkpoint F page-by-page rendered review",
        "",
        "All candidate pages were rasterised at 200 DPI. Automated image, structure and text checks "
        "were run on every page. Contact sheets are provided for the required controller visual review; "
        "generation of this file is not controller approval.",
        "",
    ]

    for item in metadata["candidates"]:
        name = item["name"]
        pdf_path = artifact / "pdf" / f"{name}.pdf"
        render_dir = artifact / "renders" / name
        repeat_dir = artifact.parent / "repeat-renders" / name
        images = sorted(render_dir.glob("page-*.png"))
        repeats = sorted(repeat_dir.glob("page-*.png"))

        signature = pdf_path.read_bytes()[:5]
        record(checks, "PDF_INVALID_SIGNATURE", signature == b"%PDF-", name, f"signature={signature!r}")
        size = pdf_path.stat().st_size
        record(checks, "PDF_FILE_TOO_SMALL", size >= 20_000, name, f"bytes={size}")

        reader = PdfReader(str(pdf_path))
        page_texts = [(page.extract_text() or "") for page in reader.pages]
        full_text = "\n".join(page_texts)
        extracted_path = artifact / "extracted-text" / f"{name}.txt"
        extracted_path.parent.mkdir(parents=True, exist_ok=True)
        extracted_path.write_text(full_text, encoding="utf-8")

        record(checks, "PDF_PAGE_COUNT_INVALID", len(reader.pages) >= 10, name, f"pages={len(reader.pages)}")
        a4_ok = True
        for page in reader.pages:
            width = float(page.mediabox.width)
            height = float(page.mediabox.height)
            if abs(width - 595.28) > 1.5 or abs(height - 841.89) > 1.5:
                a4_ok = False
        record(checks, "PDF_PAGE_SIZE_NOT_A4", a4_ok, name, "all pages must be A4 portrait")
        record(checks, "PDF_ORGANISATION_MISSING", item["organisation"] in full_text, name, item["organisation"])
        record(checks, "PDF_REPORT_REFERENCE_MISSING", item["reportReference"] in full_text, name, item["reportReference"])

        # Blocker 2: the exposure headline must name the authoritative band and no other band.
        exposure_band = item.get("exposureBand")
        if exposure_band:
            other_bands = [b for b in EXPOSURE_BANDS if b != exposure_band]
            heading_ok = f"{exposure_band} exposure with" in full_text and not any(f"{b} exposure with" in full_text for b in other_bands)
            record(checks, "PDF_EXPOSURE_HEADING_MISMATCH", heading_ok, name, f"expected band={exposure_band}")

        # Blocker 4: page-count budget by fixture (executive core + implementation appendix).
        budget = PAGE_BUDGET.get(item["fixture"])
        if budget:
            record(checks, "PDF_EXCESSIVE_PAGE_COUNT", len(reader.pages) <= budget, name, f"pages={len(reader.pages)} budget={budget}")

        # Blocker 3: no checkpoint/fixture/test/pipeline jargon in customer-facing prose.
        meta_matches = sorted(set(match.group(0) for match in META_TEST_COPY.finditer(full_text)))
        record(checks, "PDF_META_TEST_COPY", not meta_matches, name, f"matches={meta_matches[:8]}")

        # Blocker 6: internal question codes (e.g. D1-Q04) must not appear in the core report.
        # The appendix's "A6. Methodology question-code mapping" table is the one place codes are
        # intentionally shown (see APPENDIX_START_MARKER in report-template.ts), so this only scans
        # the text before the appendix divider, matching "core report" in the brief's own wording.
        core_text = full_text.split("A1. Complete material findings register", 1)[0]
        method_code_matches = METHOD_CODE.findall(core_text)
        record(checks, "PDF_INTERNAL_METHOD_CODE_OVERUSE", len(method_code_matches) <= METHOD_CODE_LIMIT, name, f"count={len(method_code_matches)} limit={METHOD_CODE_LIMIT}")

        # Blocker 1 (rendered-PDF proof): a clean-assurance candidate must never assert failure or
        # absence as fact -- same literal-phrase regression guard as the evidence-model-level
        # QG_CLEAN_ASSURANCE_SEMANTIC_FAILURE gate (see evidence-model/index.ts), applied here to the
        # actual rendered text so a template-level regression is caught too.
        if item["fixture"] == "clean":
            assurance_matches = sorted(set(match.group(0) for match in ASSURANCE_SEMANTIC_FAILURE.finditer(full_text)))
            record(checks, "PDF_CLEAN_ASSURANCE_SEMANTIC_FAILURE", not assurance_matches, name, f"matches={assurance_matches[:8]}")

        current_section_map: dict[str, list[int]] = {}
        for heading in REQUIRED_SECTIONS:
            # The bare word "Appendix" also appears in core cross-references ("...is in Appendix
            # A1"), so it needs the same distinctive-marker search as REPORT_TOC_ENTRIES' "Appendix"
            # key in report-template.ts, not a literal substring match.
            search_text = "The complete, authoritative registers behind the executive summary" if heading == "Appendix" else heading.lower()
            # Page 2 (Contents) legitimately lists every heading as a TOC row -- exclude it here
            # (except for "Contents" itself, whose real body is page 2) so the map reflects where
            # each section's real body actually is, matching the PDF outline.
            pages = [index + 1 for index, text in enumerate(page_texts) if (index != 1 or heading == "Contents") and search_text.lower() in text.lower()]
            current_section_map[heading] = pages
            record(checks, "PDF_REQUIRED_SECTION_MISSING", bool(pages), name, heading)
        section_map[name] = current_section_map

        for code, pattern in FORBIDDEN.items():
            matches = sorted(set(match.group(0) for match in pattern.finditer(full_text)))
            record(checks, code, not matches, name, f"matches={matches[:8]}")

        blank_pages = [index + 1 for index, text in enumerate(page_texts) if len(normalise_page(text)) < 35]
        record(checks, "PDF_BLANK_OR_FOOTER_ONLY_PAGE", not blank_pages, name, f"pages={blank_pages}")
        normalised = [normalise_page(text) for text in page_texts]
        duplicate_pages: list[tuple[int, int]] = []
        for left in range(len(normalised)):
            if len(normalised[left]) < 80:
                continue
            for right in range(left + 1, len(normalised)):
                if normalised[left] == normalised[right]:
                    duplicate_pages.append((left + 1, right + 1))
        record(checks, "PDF_DUPLICATE_PAGE", not duplicate_pages, name, f"pairs={duplicate_pages}")

        record(checks, "PDF_RENDER_PAGE_COUNT_MISMATCH", len(images) == len(reader.pages), name, f"renders={len(images)} pdf={len(reader.pages)}")
        deterministic = len(images) == len(repeats) and all(
            sha256(first) == sha256(second) for first, second in zip(images, repeats)
        )
        record(checks, "PDF_VISUAL_NONDETERMINISM", deterministic, name, f"first={len(images)} repeat={len(repeats)}")

        image_failures = []
        for page_number, image_path in enumerate(images, start=1):
            with Image.open(image_path).convert("RGB") as image:
                bbox = ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox()
                if bbox is None:
                    image_failures.append(page_number)
        record(checks, "PDF_RENDERED_PAGE_VISUALLY_BLANK", not image_failures, name, f"pages={image_failures}")

        marker_present = item["aiMarker"] in full_text
        if item["mode"] == "ai":
            record(checks, "PDF_AI_BODY_NOT_RENDERED", marker_present, name, item["aiMarker"])
        else:
            record(checks, "PDF_FALLBACK_RENDERED_AS_AI", not marker_present, name, item["aiMarker"])

        if item["fixture"] == "clean":
            false_failure = bool(re.search(r"\b(?:critical|major) control condition\b", full_text, re.I))
            record(checks, "PDF_CLEAN_FALSE_FAILURE_LANGUAGE", not false_failure, name, "clean assurance must not be described as a failed control")

        # Blocker 5: near-empty/tail-page detection using body-area analysis, not just "any text".
        # A page counts as near-empty when BOTH the extracted body-text count is low AND the
        # rendered body region (excluding header/footer bands) leaves more than roughly two-thirds
        # of its vertical extent unoccupied by content -- requiring both signals avoids flagging
        # legitimately sparse-but-intentional pages (a table with few but large cells, for instance)
        # on text count alone, while still catching a page whose only content is a small chart
        # fragment or a couple of trailing rows (low text, low occupied area, but not literally
        # blank, so a pixel-difference-from-white check alone would miss it).
        near_empty_pages: list[int] = []
        for page_number, image_path in enumerate(images, start=1):
            if page_number in NEAR_EMPTY_EXEMPT_PAGES or page_number == len(images):
                continue
            page_text = page_texts[page_number - 1] if page_number <= len(page_texts) else ""
            # Allowed exception: an intentional section divider (the appendix opening page), which
            # deliberately carries only a short orienting sentence -- identified by its fixed
            # content signature, not by hard-coding a specific page number.
            if "APPENDIX" in page_text and page_text.strip().startswith("APPENDIX\nAppendix\n"):
                continue
            body_chars = len(normalise_page(page_text))
            if body_chars >= NEAR_EMPTY_CHAR_THRESHOLD:
                continue
            occupied_ratio = body_region_occupied_ratio(image_path)
            if occupied_ratio < NEAR_EMPTY_OCCUPIED_RATIO_THRESHOLD:
                near_empty_pages.append(page_number)
        record(checks, "PDF_NEAR_EMPTY_PAGE", not near_empty_pages, name, f"pages={near_empty_pages}")

        # Blocker 4: word-count budget, reported alongside the page-count budget.
        word_count = len(full_text.split())
        word_budget = WORD_BUDGET.get(item["fixture"])
        if word_budget:
            record(checks, "PDF_EXCESSIVE_WORD_COUNT", word_count <= word_budget, name, f"words={word_count} budget={word_budget}")

        # Blocker 7: every PDF over 20 pages needs a customer-facing contents page with accurate
        # page numbers and a matching PDF bookmark/outline tree.
        toc_entry: dict = {"pages": len(reader.pages), "tocPrinted": {}, "bookmarks": [], "mismatches": []}
        if len(reader.pages) > 20:
            contents_text = page_texts[1] if len(page_texts) > 1 else ""
            record(checks, "PDF_TOC_MISSING", "Contents" in contents_text, name, "customer-facing contents page required for PDFs over 20 pages")

            toc_printed: dict[str, int] = {}
            for line in (l.strip() for l in contents_text.splitlines()):
                match = re.match(r"^(.*\S)\s+(\d{1,4})$", line)
                if match and match.group(1) not in ("CONTENTS", "Contents") and "MK Essential Report" not in match.group(1):
                    toc_printed[match.group(1)] = int(match.group(2))
            toc_entry["tocPrinted"] = toc_printed

            outline_entries: list[dict] = []

            def flatten_outline(items, depth: int = 0) -> None:
                for outline_item in items:
                    if isinstance(outline_item, list):
                        flatten_outline(outline_item, depth + 1)
                        continue
                    try:
                        page_num = reader.get_destination_page_number(outline_item) + 1
                    except Exception:
                        page_num = None
                    outline_entries.append({"title": outline_item.title, "page": page_num, "depth": depth})

            flatten_outline(reader.outline or [])
            toc_entry["bookmarks"] = outline_entries
            record(checks, "PDF_BOOKMARKS_MISSING", len(outline_entries) > 0, name, f"bookmark_count={len(outline_entries)}")

            bookmark_page_by_title = {entry["title"]: entry["page"] for entry in outline_entries}
            mismatches = []
            for heading in REQUIRED_SECTIONS:
                if heading == "Contents":
                    continue
                actual_pages = current_section_map.get(heading, [])
                actual = actual_pages[0] if actual_pages else None
                printed = toc_printed.get(heading)
                bookmarked = bookmark_page_by_title.get(heading)
                if printed != actual:
                    mismatches.append(f"{heading}: toc_printed={printed} actual={actual}")
                if bookmarked != actual:
                    mismatches.append(f"{heading}: bookmark={bookmarked} actual={actual}")
            toc_entry["mismatches"] = mismatches
            record(checks, "PDF_TOC_PAGE_MISMATCH", not mismatches, name, f"mismatches={mismatches[:6]}")
        toc_bookmark_map[name] = toc_entry

        sheets = create_contact_sheets(name, images, artifact / "contact-sheets")
        review_lines.extend(
            [
                f"## {name}",
                "",
                f"- Mode: {item['mode']}",
                f"- Fixture: {item['fixture']}",
                f"- PDF: {len(reader.pages)} pages, {size:,} bytes",
                f"- Contact sheets: {', '.join(sheets)}",
                "",
                "| Page | Text | Raster | Duplicate | Visual preflight |",
                "|---:|---|---|---|---|",
            ]
        )
        for index, text in enumerate(page_texts, start=1):
            raster = images[index - 1].name if index <= len(images) else "missing"
            duplicate = "clear" if not any(index in pair for pair in duplicate_pages) else "review"
            visual = "non-blank; controller review pending" if index not in image_failures else "blank defect"
            review_lines.append(
                f"| {index} | {len(normalise_page(text))} chars | {raster} | {duplicate} | {visual} |"
            )
        review_lines.append("")
        candidate_results[name] = {
            "mode": item["mode"],
            "fixture": item["fixture"],
            "pages": len(reader.pages),
            "bytes": size,
            "sha256": sha256(pdf_path),
            "renderCount": len(images),
            "contactSheets": sheets,
        }

    def extract_text(name: str) -> str:
        return (artifact / "extracted-text" / f"{name}.txt").read_text()

    def section(text: str, heading: str, next_heading: str) -> str:
        # The contents page lists every tracked heading as a plain-text TOC row, so the *first*
        # occurrence of `heading` is always that row, not the real section body -- skip it and use
        # the second occurrence (mirrors the startPage=3 skip in pdf-navigation.ts's page-map scan).
        lower = text.lower()
        first = lower.find(heading.lower())
        start = lower.find(heading.lower(), first + len(heading))
        end = lower.find(next_heading.lower(), start + len(heading))
        # Strip the page-number footer before comparing -- AI and fallback candidates can have
        # slightly different total page counts (AI prose is longer), so "Confidential 17 / 34" vs
        # "Confidential 16 / 33" would otherwise register as a content difference even when the
        # actual deterministic authority (risk/control/decision/roadmap text) is identical.
        footer_free = re.sub(r"MK Essential Report\s*·\s*Confidential\s*\d+\s*/\s*\d+", "", text[start:end])
        return re.sub(r"\s+", " ", footer_free).strip()

    weak_ai = extract_text("mk-essential-v7-materially-weak-ai")
    weak_fallback = extract_text("mk-essential-v7-materially-weak-fallback")
    for heading, next_heading in [
        ("A2. Complete risk register", "A3. Complete control improvement register"),
        ("A3. Complete control improvement register", "A4. Complete evidence checklist"),
        ("Leadership decisions required", "30/60/90-day roadmap"),
        ("30/60/90-day roadmap", "Evidence validation priorities"),
    ]:
        record(
            checks,
            "PDF_AI_FALLBACK_AUTHORITY_MISMATCH",
            section(weak_ai, heading, next_heading) == section(weak_fallback, heading, next_heading),
            "weak-pair",
            heading,
        )

    # Blocker 3: an AI narrative must be materially different across fixtures, not the same
    # template sentence with only the organisation name swapped in -- normalise each candidate's
    # own organisation name to a shared placeholder before comparing, so real org-name differences
    # (which are expected and fine) cannot mask an otherwise-identical body.
    # Anchored on fixed marker text (see AI_SYNTHESIS_MARKER in the checkpoint-F candidate script
    # and "leadership should sequence its decisions..." in report-template.ts's decisionsBlock)
    # rather than section headings, which now span a merged, multi-subsection core page and no
    # longer bound the executive/leadership prose precisely on their own.
    AI_MARKER = "This diagnosis draws together the complete set of recorded assessment evidence"
    LEADERSHIP_MARKER = "leadership should sequence its decisions rather than approve all of them at once"
    ai_items = {i["name"]: i for i in metadata["candidates"] if i["mode"] == "ai"}
    ai_texts = {name: extract_text(name) for name in ai_items}
    normalised_leadership = {}
    normalised_executive = {}
    for name, text in ai_texts.items():
        org = ai_items[name]["organisation"]
        normalised = re.sub(r"\s+", " ", text.replace(org, "{{ORG}}"))
        exec_start = normalised.find(AI_MARKER)
        normalised_executive[name] = normalised[exec_start:exec_start + 700] if exec_start >= 0 else ""
        leadership_start = normalised.find(LEADERSHIP_MARKER)
        normalised_leadership[name] = normalised[leadership_start:leadership_start + 400] if leadership_start >= 0 else ""

    ai_names = sorted(ai_texts)
    for left, right in [(a, b) for i, a in enumerate(ai_names) for b in ai_names[i + 1 :]]:
        record(
            checks, "PDF_AI_NOT_MATERIALLY_DIFFERENT",
            normalised_executive[left] != normalised_executive[right] or normalised_leadership[left] != normalised_leadership[right],
            f"{left}-vs-{right}", "executive/leadership narrative must differ once organisation names are normalised",
        )

    # Blocker 3: domain commentary must vary by domain/response pattern within one report, not
    # repeat one formula sentence for all ten domains (see BAND_OPENER differentiation upstream).
    NO_GAP_CLOSER_TEMPLATES = [
        "is whether that position holds under a complete-population test",
        "is independent testing across the complete population",
        "is to prove that position under a full-population review",
        "would hold up under independent, complete-population scrutiny",
    ]
    for name, text in ai_texts.items():
        template_counts = [text.count(template) for template in NO_GAP_CLOSER_TEMPLATES]
        total_occurrences = sum(template_counts)
        distinct_templates_used = sum(1 for count in template_counts if count > 0)
        record(
            checks, "PDF_AI_GENERIC_REPETITION",
            total_occurrences <= 1 or distinct_templates_used > 1,
            name, f"closer-sentence-occurrences={total_occurrences} distinct-templates={distinct_templates_used}",
        )

    head_sha = resolve_head_sha()
    (artifact / "inspection").mkdir(parents=True, exist_ok=True)

    # Blocker 8: generate the commercial review from the final candidate_results/head_sha computed
    # above, then re-parse what was actually written and require an exact match -- so a future
    # regression back to a hand-edited/stale review document fails closed instead of silently
    # publishing numbers that disagree with the real artifact.
    review_markdown = render_commercial_review(candidate_results, head_sha)
    (artifact / "inspection" / "commercial-review.md").write_text(review_markdown)
    metadata_ok = verify_review_metadata(review_markdown, candidate_results, head_sha)
    record(checks, "PDF_REVIEW_METADATA_MISMATCH", metadata_ok, "commercial-review.md", "generated review must match final candidate_results and head SHA exactly")

    write_ai_vs_fallback_review(artifact, checks)
    write_clean_assurance_semantic_review(artifact, checks, candidate_results)

    report = {
        "schemaVersion": "checkpoint-f-pdf-audit-v1",
        "renderDpi": 200,
        "headSha": head_sha,
        "candidateResults": candidate_results,
        "checks": checks,
        "passed": all(item["passed"] for item in checks),
        "failureCount": sum(1 for item in checks if not item["passed"]),
    }
    (artifact / "inspection" / "pdf-audit.json").write_text(json.dumps(report, indent=2) + "\n")
    (artifact / "inspection" / "page-by-page-review.md").write_text("\n".join(review_lines) + "\n")
    (artifact / "inspection" / "section-map.json").write_text(json.dumps(section_map, indent=2) + "\n")
    (artifact / "inspection" / "toc-bookmark-map.json").write_text(json.dumps(toc_bookmark_map, indent=2) + "\n")
    write_manifest(artifact, candidate_results, report)

    print(json.dumps({"passed": report["passed"], "failureCount": report["failureCount"], "candidates": candidate_results}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
