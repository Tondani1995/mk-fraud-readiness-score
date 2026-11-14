// Essential is PDF-only (independent review of the corrective pass, F3): the validator blocks a promise of an artefact
// Essential does not supply and allows advice that the organisation keep its own records. Each sentence is inserted into
// a passing deterministic Marula Essential manuscript, the way the independent probe did it.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/entitlement-tests.mjs
import fs from 'node:fs';
import { loadFixture, fixturePack } from './lib/b5-fixtures.mjs';
import { deterministicManuscript } from './lib/writer-double.mjs';
import { validateManuscript } from '../../src/lib/reports/revised/manuscript/manuscript.ts';

const PROHIBITED = [
  'Full specifications, records and failure responses are in the supporting workbook.',
  'Every action, with its deliverable and completion test, is in the workbook action register.',
  'See the workbook for the operating detail of each control.',
  'Each action is listed in the action register that accompanies this report.',
  'The wider register lists every scenario with a control reported as a gap.',
  'A spreadsheet supplied with this report sets out the controls.',
  "MK's workbook sets out each control in full.",
  'The remaining findings are in the full register.',
  'Refer to the spreadsheet for the remaining actions.'
];
const ALLOWED = [
  'The finance lead should retain its own spreadsheet of authorised supplier changes.',
  'The fraud risk lead should maintain an action register for management remediation work.',
  'Procurement should keep the contract register current and review it each quarter.',
  'The payroll team should reconcile the spreadsheet of starters and leavers to the payroll each month.',
  'Each exception should be recorded in the risk register with its owner and the date it was closed.',
  'Teams that excel at supplier verification still need an independent check.',
  'The organisation should keep a register of gifts and declarations that its oversight body reviews.'
];
const { fp, plan } = fixturePack(loadFixture('marula'), 'essential');
const md = deterministicManuscript(fp, plan);
const baseline = validateManuscript(md, fp, plan);
const probe = (sentence) => {
  const changed = md.replace(/\n<!-- refs:/, ` ${sentence}\n<!-- refs:`);
  const v = validateManuscript(changed, fp, plan);
  return { sentence, entitlement: v.issues.filter((i) => i.code === 'ENTITLEMENT').map((i) => i.detail), pass: v.pass };
};
const prohibited = PROHIBITED.map(probe);
const allowed = ALLOWED.map(probe);
const compFp = fixturePack(loadFixture('marula'), 'comprehensive');
const compMd = deterministicManuscript(compFp.fp, compFp.plan).replace(/\n<!-- refs:/, ` ${PROHIBITED[0]}\n<!-- refs:`);
const comprehensive = validateManuscript(compMd, compFp.fp, compFp.plan).issues.filter((i) => i.code === 'ENTITLEMENT').length;
const results = [
  { id: 'EN-00', ok: baseline.pass, name: 'The unmodified deterministic Essential manuscript passes', detail: `${baseline.issues.filter((i) => i.blocking).length} blocking` },
  { id: 'EN-01', ok: prohibited.every((p) => p.entitlement.length === 1 && !p.pass), name: 'Every promise of an artefact Essential does not supply is blocked', detail: prohibited.map((p) => `${p.entitlement.length ? 'blocked' : 'MISSED'}: ${p.sentence.slice(0, 50)}`).join(' | ') },
  { id: 'EN-02', ok: allowed.every((p) => p.entitlement.length === 0 && p.pass), name: "Advice about the organisation's own records is allowed (including both sentences from the independent probe)", detail: allowed.map((p) => `${p.entitlement.length ? 'BLOCKED' : 'allowed'}: ${p.sentence.slice(0, 50)}`).join(' | ') },
  { id: 'EN-03', ok: comprehensive === 0, name: 'The rule applies to Essential only; Comprehensive, which includes a workbook, may refer to it', detail: `${comprehensive} entitlement issues in Comprehensive` }
];
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/entitlement.json', JSON.stringify({ results, prohibited, allowed }, null, 2));
process.exit(failed.length ? 1 : 0);
