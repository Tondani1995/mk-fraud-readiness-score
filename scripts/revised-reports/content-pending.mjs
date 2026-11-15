// Controls in the two bound B5 reports whose MK control-content library entry is missing or incomplete: the content MK
// must approve before these reports could be sold (independent review Q4). Customers see neutral method wording instead.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/content-pending.mjs
import fs from 'node:fs';
import { loadFixture } from './lib/b5-fixtures.mjs';
const out = { generated: '2026-11-13', organisations: {} };
const all = new Map();
for (const n of ['kestrel', 'marula']) {
  const r = loadFixture(n).report;
  const pending = r.controls.filter((c) => c.contentPending.length);
  out.organisations[n] = { controls: r.controls.length, complete: r.controls.length - pending.length, pending: pending.map((c) => ({ id: c.id, key: c.key, missing: c.contentPending })) };
  for (const c of pending) all.set(c.id, { id: c.id, key: c.key, missing: c.contentPending, in: [...(all.get(c.id)?.in ?? []), n] });
}
out.distinct = [...all.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/content-pending.json', JSON.stringify(out, null, 2));
for (const [n, o] of Object.entries(out.organisations)) console.log(n, `${o.complete} of ${o.controls} controls with complete library content; ${o.pending.length} pending`);
console.log('distinct controls needing MK content:', out.distinct.length);
