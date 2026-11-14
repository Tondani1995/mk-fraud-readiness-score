// Publication gates under failure (independent review of the corrective pass, F6), with a render and text-extraction
// double so that the failure is exact: a heading missing from the PDF, a page map that never converges within the
// passes, and the deadline arriving before or during layout. The real composer and the real gate function are used.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/publication-gate-tests.mjs
import fs from 'node:fs';
import { loadFixture, fixturePack } from './lib/b5-fixtures.mjs';
import { deterministicManuscript } from './lib/writer-double.mjs';
import { composeRevisedReportHtml } from '../../src/lib/reports/revised/manuscript/compose.ts';
import { layoutPublication, LayoutDeadline, norm } from '../../src/lib/reports/revised/manuscript/layout.ts';
import { publicationGates } from '../../src/lib/reports/revised/live/produce.ts';

const { fp, plan } = fixturePack(loadFixture('marula'), 'essential');
const base = { md: deterministicManuscript(fp, plan), fp, plan, dateLabel: '14 November 2026', prototype: true };
const outline = composeRevisedReportHtml(base).sections;
const hasContents = plan.sections.some((s) => s.exhibits.includes('contents'));

/** A document double: page 1 cover, then one page per section with its units. `shift(n)` moves sections on render n. */
function docDouble({ shift = () => 0, drop = null } = {}) {
  let renders = 0;
  return {
    renders: () => renders,
    render: async () => { renders += 1; return { pdf: Buffer.from(`%PDF-double-${renders}`), sha256: String(renders) }; },
    texts: async (pdf) => {
      const n = Number(String(pdf).split('-').pop());
      const pages = [{ all: 'cover', heads: 'cover' }];
      outline.forEach((s, i) => {
        for (let k = 0; k < (i === 0 ? 0 : shift(n, i)); k++) pages.push({ all: 'y'.repeat(900), heads: '' });
        const heads = [s.heading, ...s.units].filter((h) => h !== drop).map(norm).join(' ');
        pages.push({ all: `${heads} ${'x'.repeat(900)}`, heads });
      });
      pages.push({ all: 'back', heads: '' });
      return pages;
    }
  };
}
const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };

await T('PG-00', 'A stable document passes every required gate', async () => {
  const d = docDouble();
  const out = await layoutPublication(base, { render: d.render, texts: d.texts });
  const g = publicationGates(out.layout, hasContents);
  return [g.pass && out.layout.contentsComplete, `${out.layout.passes} passes; ${g.required.map((x) => `${x.id}:${x.pass}`).join(' ')}`];
});
await T('PG-01', 'A heading missing from the PDF fails PG-HEADINGS and the report is held', async () => {
  const d = docDouble({ drop: outline[2].heading });
  const out = await layoutPublication(base, { render: d.render, texts: d.texts });
  const g = publicationGates(out.layout, hasContents);
  return [!g.pass && !g.required.find((x) => x.id === 'PG-HEADINGS').pass && !out.layout.contentsComplete, g.required.filter((x) => !x.pass).map((x) => x.detail).join(' | ')];
});
await T('PG-02', 'A page map that moves on every render exhausts the passes, is reported as not converged and is held', async () => {
  const d = docDouble({ shift: (n, i) => (i === outline.length - 1 ? n % 2 : 0) });
  const out = await layoutPublication(base, { render: d.render, texts: d.texts, maxNumberPasses: 3 });
  const g = publicationGates(out.layout, hasContents);
  return [!g.pass && !g.required.find((x) => x.id === 'PG-CONVERGED').pass && d.renders() >= 4, `${d.renders()} renders; ${g.required.filter((x) => !x.pass).map((x) => x.detail).join(' | ')}`];
});
await T('PG-03', 'Deadline before any complete PDF: the layout stops with LayoutDeadline (the caller records a render failure and the retry recomposes)', async () => {
  const d = docDouble();
  let clock = 1000;
  let err = null;
  try { await layoutPublication(base, { render: d.render, texts: d.texts, deadlineAt: 5000, clock: () => clock, minPassMs: 10_000 }); } catch (e) { err = e; }
  return [err instanceof LayoutDeadline && d.renders() === 0, `${err?.name}; renders ${d.renders()}`];
});
await T('PG-04', 'Deadline during the page-number passes: the last complete PDF is returned, reported as not converged, and held', async () => {
  const d = docDouble({ shift: (n, i) => (i === outline.length - 1 ? n % 2 : 0) });
  let clock = 0;
  const render = async (html, o) => { clock += 20_000; return d.render(html, o); };
  const out = await layoutPublication(base, { render, texts: d.texts, deadlineAt: 70_000, clock: () => clock, minPassMs: 10_000 });
  const g = publicationGates(out.layout, hasContents);
  return [!g.pass && out.layout.missing.some((m) => m.startsWith('moved:')), `${out.layout.passes} passes before the deadline; ${g.required.filter((x) => !x.pass).map((x) => x.id).join(', ')}`];
});
await T('PG-05', 'Advisory findings (near-empty pages, moved headings) are recorded but never reported as verified', async () => {
  const g = publicationGates({ missing: [], contentsComplete: true, passes: 2, sparsePages: [7], breakBefore: ['X'] }, true);
  return [g.pass && g.advisory.length === 2, JSON.stringify(g.advisory)];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/publication-gates.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
