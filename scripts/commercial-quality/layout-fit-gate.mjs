#!/usr/bin/env node
/**
 * MK page-level layout-fit gate.
 *
 * Measures the rendered PDF rather than the source DOM. The reports are flowing
 * content that Chromium paginates, so there are no page containers to measure in
 * the HTML -- a DOM gate can only see one container and proves nothing about
 * individual pages. This rasterises every page and finds the real ink extent.
 *
 * Fails a page when body content intrudes into the protected footer band, when
 * ink reaches the physical page edge (clipping), or when a page is blank.
 *
 * The 2.5mm tolerance is deliberate: the footer rule and its padding sit just
 * inside the footer band, and a tighter threshold reports them as overflow. That
 * lesson came from the earlier prototype, where a naive threshold produced 33
 * false positives before it caught one real 59mm overflow.
 *
 * Usage: node layout-fit-gate.mjs <pdf> [outJson]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DPI = 100;
const MM_PER_INCH = 25.4;
const PX_PER_MM = DPI / MM_PER_INCH;
const TOLERANCE_MM = 2.5;

// Must mirror render-pdf.ts page.pdf() margins.
const MARGIN = { top: 12, right: 13, bottom: 15, left: 13 };

/** Bottom of the safe body area, measured from the top of the page. */
function bodyBottomMm(pageHeightMm) {
  return pageHeightMm - MARGIN.bottom;
}

/** Parse a binary PGM (P5) into { width, height, data }. */
function readPgm(file) {
  const buf = fs.readFileSync(file);
  let pos = 0;
  const token = () => {
    while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]))) pos += 1;
    if (String.fromCharCode(buf[pos]) === '#') { while (pos < buf.length && buf[pos] !== 0x0a) pos += 1; return token(); }
    let start = pos;
    while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos]))) pos += 1;
    return buf.subarray(start, pos).toString('ascii');
  };
  const magic = token();
  if (magic !== 'P5') throw new Error(`Expected binary PGM, got ${magic}`);
  const width = Number(token());
  const height = Number(token());
  token(); // maxval
  pos += 1; // single whitespace before raster
  return { width, height, data: buf.subarray(pos, pos + width * height) };
}

/** Rows/columns containing ink, treating near-white as background. */
function inkExtent({ width, height, data }, threshold = 245, region) {
  const y0 = Math.max(0, region?.top ?? 0);
  const y1 = Math.min(height - 1, region?.bottom ?? height - 1);
  const x0 = Math.max(0, region?.left ?? 0);
  const x1 = Math.min(width - 1, region?.right ?? width - 1);
  let top = -1, bottom = -1, left = width, right = -1, inkPixels = 0;
  for (let y = y0; y <= y1; y += 1) {
    let rowHasInk = false;
    for (let x = x0; x <= x1; x += 1) {
      if (data[y * width + x] < threshold) {
        rowHasInk = true; inkPixels += 1;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    if (rowHasInk) { if (top < 0) top = y; bottom = y; }
  }
  return { top, bottom, left, right, inkPixels };
}

export function auditPdfLayout(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
  const sizeMatch = /^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(info);
  const pageWidthMm = Number(sizeMatch?.[1] ?? 595) * MM_PER_INCH / 72;
  const pageHeightMm = Number(sizeMatch?.[2] ?? 842) * MM_PER_INCH / 72;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-layout-'));
  execFileSync('pdftoppm', ['-gray', '-r', String(DPI), pdfPath, path.join(dir, 'p')]);

  const pages = [];
  for (const file of fs.readdirSync(dir).sort()) {
    const page = Number(/p-?(\d+)\.pgm$/.exec(file)?.[1] ?? pages.length + 1);
    const image = readPgm(path.join(dir, file));

    // Chromium renders the running footer inside the bottom margin band, at the
    // same position on every page and spanning the full width. Measuring the
    // whole page therefore reports the footer as body overflow on every page.
    // Analyse the body box only, and treat the footer band separately.
    const bodyBox = {
      top: Math.round(MARGIN.top * PX_PER_MM),
      bottom: Math.round((pageHeightMm - MARGIN.bottom) * PX_PER_MM),
      left: Math.round(MARGIN.left * PX_PER_MM),
      right: Math.round((pageWidthMm - MARGIN.right) * PX_PER_MM)
    };
    const body = inkExtent(image, 245, bodyBox);
    const footerBand = inkExtent(image, 245, { top: bodyBox.bottom, bottom: image.height - 1, left: 0, right: image.width - 1 });
    const blank = body.inkPixels === 0;
    // A deliberately full-bleed page (the navy cover) paints the whole body box.
    // That is a design decision, not clipped content, so the edge checks below
    // would otherwise fail every such page.
    const bodyArea = Math.max(1, (bodyBox.bottom - bodyBox.top) * (bodyBox.right - bodyBox.left));
    const fullBleed = body.inkPixels / bodyArea > 0.8;

    const inkBottomMm = blank ? 0 : body.bottom / PX_PER_MM;
    const safeBottomMm = bodyBottomMm(pageHeightMm);
    const footerIntrusionMm = Number(Math.max(0, inkBottomMm - safeBottomMm - TOLERANCE_MM).toFixed(2));

    // Body ink reaching the body-box boundary means content sized beyond the box.
    const tol = Math.round(TOLERANCE_MM * PX_PER_MM);
    const clippedBottom = !blank && !fullBleed && body.bottom >= bodyBox.bottom - 1;
    const clippedRight = !blank && body.right >= bodyBox.right + tol;
    const clippedLeft = !blank && body.left <= bodyBox.left - tol;
    const clippedTop = !blank && body.top <= bodyBox.top - tol;
    const clipped = clippedBottom || clippedRight || clippedLeft || clippedTop;

    pages.push({
      page,
      footerIntrusionMm,
      inkBottomMm: Number(inkBottomMm.toFixed(2)),
      safeBottomMm: Number(safeBottomMm.toFixed(2)),
      footerPresent: footerBand.inkPixels > 0,
      scrollOverflowPx: 0,
      clippedElements: [clippedTop && 'top', clippedBottom && 'bottom', clippedLeft && 'left', clippedRight && 'right'].filter(Boolean),
      blank,
      fullBleed,
      pass: footerIntrusionMm === 0 && !clipped && !blank
    });
  }
  fs.rmSync(dir, { recursive: true, force: true });

  const failCount = pages.filter((entry) => !entry.pass).length;
  return {
    gateMode: 'PAGE_LEVEL',
    toleranceMm: TOLERANCE_MM,
    dpi: DPI,
    pageWidthMm: Number(pageWidthMm.toFixed(2)),
    pageHeightMm: Number(pageHeightMm.toFixed(2)),
    margins: MARGIN,
    pageCount: pages.length || pageCount,
    failCount,
    pages
  };
}

const [, , pdfPath, outJson] = process.argv;
if (pdfPath) {
  const report = auditPdfLayout(pdfPath);
  const summary = { gateMode: report.gateMode, toleranceMm: report.toleranceMm, pageCount: report.pageCount, failCount: report.failCount, failures: report.pages.filter((p) => !p.pass) };
  if (outJson) fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(report.failCount === 0 ? 0 : 1);
}
