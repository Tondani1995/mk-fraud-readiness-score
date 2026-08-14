#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { renderHtmlToPdfBuffer } from '../../src/lib/reports/render-pdf.ts';

const outputDir = path.resolve(process.env.BOUNDED_RIVONIA_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/v1.1-bounded-section-engine-rivonia');
const manuscriptPath = path.join(outputDir, 'assembled', 'essential-manuscript.md');
const manifestPath = path.join(outputDir, 'generation-manifest.json');
const pdfPath = path.join(outputDir, 'pdf', 'essential-owner-preview.pdf');
const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function markdownToBody(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push(`<p>${escapeHtml(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('# ')) { flush(); blocks.push(`<h1>${escapeHtml(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push(`<h2 class="slot-heading">${escapeHtml(line.slice(3))}</h2>`); continue; }
    paragraph.push(line.trim());
  }
  flush();
  return blocks.join('\n');
}

const manuscript = await fs.readFile(manuscriptPath, 'utf8');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const body = markdownToBody(manuscript);
const html = `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<title>MK Fraud Readiness — Rivonia Health Logistics — Essential Owner Preview</title>
<style>
  :root { --navy:#12304a; --blue:#1c5b83; --ink:#243746; --muted:#627487; --rule:#d9e1e8; --accent:#d8912d; }
  * { box-sizing:border-box; }
  @page { size:A4; margin: 16mm 16mm 18mm; }
  body { color:var(--ink); font: 10.5pt/1.55 Arial, Helvetica, sans-serif; margin:0; }
  .cover { min-height: 245mm; display:flex; flex-direction:column; justify-content:space-between; padding:16mm 4mm 8mm; page-break-after:always; }
  .eyebrow { color:var(--accent); font-weight:700; letter-spacing:.14em; text-transform:uppercase; font-size:8pt; }
  .cover h1 { color:var(--navy); font-size:29pt; line-height:1.08; max-width:155mm; margin:12mm 0 7mm; }
  .cover h2 { color:var(--blue); font-size:15pt; font-weight:400; margin:0; }
  .cover-grid { display:grid; grid-template-columns:1fr 1fr; gap:5mm; margin-top:15mm; }
  .metric { border-top:3px solid var(--accent); padding-top:3mm; }
  .metric span { display:block; color:var(--muted); font-size:8pt; text-transform:uppercase; letter-spacing:.08em; }
  .metric strong { display:block; color:var(--navy); font-size:18pt; margin-top:1mm; }
  .notice { background:#f1f5f8; border-left:4px solid var(--blue); padding:4mm; font-size:9pt; }
  .report-body h1 { color:var(--navy); font-size:20pt; line-height:1.15; margin:0 0 7mm; padding-top:2mm; page-break-before:always; border-bottom:1px solid var(--rule); padding-bottom:3mm; }
  .report-body h1:first-of-type { page-break-before:avoid; }
  .slot-heading { color:var(--blue); font-size:15pt; line-height:1.2; margin:8mm 0 3mm; page-break-after:avoid; }
  p { margin:0 0 4mm; orphans:3; widows:3; }
  .footer-note { color:var(--muted); font-size:8pt; border-top:1px solid var(--rule); margin-top:9mm; padding-top:3mm; }
</style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="eyebrow">MK Fraud Readiness v1.1 · Essential · Owner Preview</div>
      <h1>Rivonia Health Logistics (Pty) Ltd</h1>
      <h2>Bounded narrative section-engine proof</h2>
      <div class="cover-grid">
        <div class="metric"><span>Assessment</span><strong>${escapeHtml(manifest.assessmentReference)}</strong></div>
        <div class="metric"><span>Recorded position</span><strong>${escapeHtml(`${manifest.score} / 100`)}</strong></div>
        <div class="metric"><span>Maturity</span><strong>${escapeHtml(manifest.maturity)}</strong></div>
        <div class="metric"><span>Bounded slots</span><strong>${escapeHtml(manifest.slots.length)}</strong></div>
      </div>
    </div>
    <div class="notice"><strong>Owner review candidate — not customer delivery.</strong><br>Generated from deterministic assessment analysis, Blueprint-owned narrative slots and approved bounded AI explanations. Commercial owner review remains pending. Production, Supabase, orders, payments and deployment were not touched.</div>
  </section>
  <main class="report-body">${body}<div class="footer-note">MK Fraud Readiness v1.1 · Essential owner preview · Commercial owner review pending</div></main>
</body>
</html>`;

await fs.mkdir(path.dirname(pdfPath), { recursive: true });
const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: 'MK Fraud Readiness · Essential · Owner Preview' });
if (!pdf.length || pdf.subarray(0, 4).toString('ascii') !== '%PDF') throw new Error('Owner preview renderer did not produce a PDF.');
await fs.writeFile(pdfPath, pdf);
const nextManifest = { ...manifest, output: { ...manifest.output, pdf: 'pdf/essential-owner-preview.pdf', pdfCreated: true, pdfBytes: pdf.length } };
await fs.writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
console.log(JSON.stringify({ passed: true, pdfPath, bytes: pdf.length, pages: 'validated by pdfinfo/render inspection step', customerDelivery: 'NONE' }, null, 2));
