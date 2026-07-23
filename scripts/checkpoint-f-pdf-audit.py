#!/usr/bin/env python3
"""Credential-free rendered-PDF audit and review-artifact builder for V7 Checkpoint F."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw
from pypdf import PdfReader


REQUIRED_SECTIONS = [
    "Report governance",
    "Executive diagnosis",
    "Readiness score",
    "Exposure profile",
    "Priority gap dashboard",
    "Critical flags and false comfort",
    "Domain advisory",
    "Material findings",
    "Evidence-based contradictions",
    "Plausible scenarios and assurance tests",
    "Risk register",
    "Control improvement plan",
    "Evidence checklist",
    "Leadership decisions required",
    "30/60/90-Day Roadmap",
    "Leadership agenda",
    "Methodology and limitations",
]

FORBIDDEN = {
    "PDF_FORBIDDEN_CORE_CONTROL_COPY": re.compile(r"\bA core control area\b", re.I),
    "PDF_FORBIDDEN_CREDIBLE_POSITION": re.compile(r"\bThis is a credible position\b", re.I),
    "PDF_FORBIDDEN_DEFENSIBLE_POSITION": re.compile(r"\ba defensible position\b", re.I),
    "PDF_FORBIDDEN_GENUINE_READINESS": re.compile(r"\bgenuine readiness\b", re.I),
    "PDF_FORBIDDEN_INTERNAL_IDENTIFIER": re.compile(
        r"\b(?:QG_[A-Z0-9_]+|(?:MF|RISK|SC|CI|DEC)-[A-Z0-9]*\d[A-Z0-9]*|[0-9a-f]{8}-[0-9a-f-]{27,})\b",
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


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: checkpoint-f-pdf-audit.py <artifact-dir> <metadata-json>")
    artifact = Path(sys.argv[1]).resolve()
    metadata = json.loads(Path(sys.argv[2]).read_text())
    checks: list[dict] = []
    candidate_results: dict[str, dict] = {}
    section_map: dict[str, dict[str, list[int]]] = {}
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

        current_section_map: dict[str, list[int]] = {}
        for heading in REQUIRED_SECTIONS:
            pages = [index + 1 for index, text in enumerate(page_texts) if heading.lower() in text.lower()]
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

    weak_ai = (artifact / "extracted-text" / "mk-essential-v7-materially-weak-ai.txt").read_text()
    weak_fallback = (artifact / "extracted-text" / "mk-essential-v7-materially-weak-fallback.txt").read_text()
    for heading, next_heading in [
        ("Risk register", "Control improvement plan"),
        ("Control improvement plan", "Evidence checklist"),
        ("Leadership decisions required", "30/60/90-Day Roadmap"),
        ("30/60/90-Day Roadmap", "Leadership agenda"),
    ]:
        def selected(text: str) -> str:
            start = text.lower().find(heading.lower())
            end = text.lower().find(next_heading.lower(), start + len(heading))
            return re.sub(r"\s+", " ", text[start:end]).strip()

        record(
            checks,
            "PDF_AI_FALLBACK_AUTHORITY_MISMATCH",
            selected(weak_ai) == selected(weak_fallback),
            "weak-pair",
            heading,
        )

    report = {
        "schemaVersion": "checkpoint-f-pdf-audit-v1",
        "renderDpi": 200,
        "candidateResults": candidate_results,
        "checks": checks,
        "passed": all(item["passed"] for item in checks),
        "failureCount": sum(1 for item in checks if not item["passed"]),
    }
    (artifact / "inspection").mkdir(parents=True, exist_ok=True)
    (artifact / "inspection" / "pdf-audit.json").write_text(json.dumps(report, indent=2) + "\n")
    (artifact / "inspection" / "page-by-page-review.md").write_text("\n".join(review_lines) + "\n")
    (artifact / "inspection" / "section-map.json").write_text(json.dumps(section_map, indent=2) + "\n")
    print(json.dumps({"passed": report["passed"], "failureCount": report["failureCount"], "candidates": candidate_results}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
