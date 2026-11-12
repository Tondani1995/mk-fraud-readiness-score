// Renders the comparison HTML files to PDF with the existing renderer, one file at a time, logging each.
//   node ... scripts/revised-reports/render-pdfs.mjs <dir> [P3,P4]
// Renders every before-, after- and corrected- report present in each organisation folder.
import fs from 'node:fs';
import path from 'node:path';
import { renderHtmlToPdfBuffer, closeRenderBrowser } from '../../src/lib/reports/render-pdf.ts';
const out = path.resolve(process.argv[2] || 'docs/readiness-review/report-correction');
const only = process.argv[3] ? process.argv[3].split(',') : fs.readdirSync(out).filter((d) => fs.statSync(path.join(out, d)).isDirectory());
const NAMES = ['before-essential', 'after-essential', 'corrected-essential', 'before-comprehensive', 'after-comprehensive', 'corrected-comprehensive'];
const pages = {};
for (const key of only) {
  for (const name of NAMES.filter((n) => fs.existsSync(path.join(out, key, `${n}.html`)))) {
    const t0 = Date.now();
    const html = fs.readFileSync(path.join(out, key, `${name}.html`), 'utf8');
    const label = name.startsWith('corrected') ? 'FICTIONAL PROTOTYPE · TEST-FIXTURE FIGURES · NOT A CERTIFIED REPORT' : name.startsWith('after') ? 'FICTIONAL PROTOTYPE' : 'FICTIONAL COMPARISON';
    const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: label });
    fs.writeFileSync(path.join(out, key, `${name}.pdf`), pdf);
    pages[`${key}/${name}`] = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    console.log(key, name, pages[`${key}/${name}`], 'pages', Math.round((Date.now() - t0) / 1000), 's');
  }
}
fs.writeFileSync(path.join(out, 'pdf-pages.json'), JSON.stringify(pages, null, 1) + '\n');
// The browser can hold the process open after closing; the results are written, so exit explicitly.
await Promise.race([closeRenderBrowser(), new Promise((r) => setTimeout(r, 5000))]);
process.exit(0);
