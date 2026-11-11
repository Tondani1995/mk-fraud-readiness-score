// Renders the comparison HTML files to PDF with the existing renderer, one file at a time, logging each.
import fs from 'node:fs';
import path from 'node:path';
import { renderHtmlToPdfBuffer, closeRenderBrowser } from '../../src/lib/reports/render-pdf.ts';
const out = path.resolve(process.argv[2] || 'docs/readiness-review/report-comparison');
const only = process.argv[3] ? process.argv[3].split(',') : fs.readdirSync(out).filter((d) => fs.statSync(path.join(out, d)).isDirectory());
const pages = {};
for (const key of only) {
  for (const name of ['before-essential', 'after-essential', 'before-comprehensive', 'after-comprehensive']) {
    const t0 = Date.now();
    const html = fs.readFileSync(path.join(out, key, `${name}.html`), 'utf8');
    const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: `FICTIONAL ${name.startsWith('after') ? 'PROTOTYPE' : 'COMPARISON'}`});
    fs.writeFileSync(path.join(out, key, `${name}.pdf`), pdf);
    pages[`${key}/${name}`] = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    console.log(key, name, pages[`${key}/${name}`], 'pages', Math.round((Date.now() - t0) / 1000), 's');
  }
}
await closeRenderBrowser();
fs.writeFileSync(path.join(out, 'pdf-pages.json'), JSON.stringify(pages, null, 1));
