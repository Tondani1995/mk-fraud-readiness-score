// The one-person review experience (owner direction, 15 November 2026): contact details at the start, overall progress
// with time left, MK notifications that never carry a private link, and the interview and Snapshot without hand-offs,
// optional detail or free text. Pure checks and source checks; no database, network or browser.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/review-experience-tests.mjs
import fs from 'node:fs';
import { validateContact } from '../../src/lib/readiness-review/contacts.ts';
import { reviewNoticeMessage } from '../../src/lib/readiness-review/review-notifications.ts';
import { overallProgress } from '../../src/lib/readiness-review/progress.ts';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const refused = (input) => { try { validateContact(input); return false; } catch (e) { return e?.code === 'invalid_input' || /invalid_input|Enter/.test(String(e?.message)); } };
const stage = (o) => ({ answered: 0, withFunctions: 0, declined: 0, unknownToFunction: 0, open: 0, applicableSoFar: 0, complete: false, pct: 0, ...o });
const status = (used, core, breadth, current = 'core') => ({ screensUsed: used, limit: null, pctOfLimit: null, stages: { current, core: stage(core), breadth: stage(breadth) } });

await T('RX-01', 'Contact: name and a valid work email are required, role is optional, values are trimmed and the email lower-cased', async () => {
  const ok = validateContact({ fullName: '  Thandi   Example ', email: ' Thandi@Example.CO.ZA ', roleTitle: '' });
  const pass = ok.fullName === 'Thandi Example' && ok.email === 'thandi@example.co.za' && ok.roleTitle === null
    && refused({ fullName: '', email: 'a@b.co' }) && refused({ fullName: 'A', email: 'not-an-email' }) && refused(null);
  return [pass, JSON.stringify(ok)];
});
await T('RX-02', 'MK notifications name the person and organisation, never include a review link, and escape what the respondent typed', async () => {
  const contact = { fullName: 'A <b>Person</b>', email: 'a@b.co', roleTitle: 'CFO' };
  const kinds = ['started', 'completed', 'stalled'].map((kind) => reviewNoticeMessage({ kind, organisationLabel: 'Org & Co', contact, actionCount: 12, lastActivityAt: '2026-11-15T10:00:00Z', inactiveHours: 24 }));
  const noLink = kinds.every((m) => !/\/review\/s\/|https?:\/\//.test(m.text + m.html));
  const escaped = kinds.every((m) => m.html.includes('A &lt;b&gt;Person&lt;/b&gt;') && m.html.includes('Org &amp; Co') && !m.html.includes('<b>Person'));
  const subjects = kinds.map((m) => m.subject);
  return [noLink && escaped && /started/.test(subjects[0]) && /completed/.test(subjects[1]) && /stalled/.test(subjects[2]) && kinds.every((m) => !m.text.includes('—')), subjects.join(' | ')];
});
await T('RX-03', 'Progress is overall and moves forward: a typical review early on, the open confirmations later, never 100% before the end', async () => {
  const start = overallProgress(status(1, { open: 33, applicableSoFar: 33 }, { open: 0, applicableSoFar: 0 }));
  const midCore = overallProgress(status(30, { answered: 25, open: 8, applicableSoFar: 33 }, { open: 10, applicableSoFar: 10 }));
  const breadth = overallProgress(status(70, { answered: 33, applicableSoFar: 33, complete: true }, { answered: 35, open: 39, applicableSoFar: 74 }, 'breadth'));
  const nearEnd = overallProgress(status(107, { answered: 33, applicableSoFar: 33, complete: true }, { answered: 72, open: 2, applicableSoFar: 74 }, 'breadth'));
  const ordered = start.pct < midCore.pct && midCore.pct < breadth.pct && breadth.pct < nearEnd.pct && nearEnd.pct <= 99;
  const minutes = start.minutesLeft >= 15 && start.minutesLeft <= 22 && nearEnd.minutesLeft === 1;
  return [ordered && minutes, `start ${start.pct}% ${start.minutesLeft} min; core ${midCore.pct}%; breadth ${breadth.pct}% ${breadth.minutesLeft} min; end ${nearEnd.pct}% ${nearEnd.minutesLeft} min`];
});
await T('RX-04', 'The interview has no orientation, hand-offs, optional detail, free text or per-stage counts; answering a single question saves at once', async () => {
  const interview = fs.readFileSync('src/components/readiness-review/ReviewInterview.tsx', 'utf8');
  const question = fs.readFileSync('src/components/readiness-review/ReviewQuestion.tsx', 'utf8');
  const banned = ['respondent.assignArea', 'Begin the interview', 'Core stage', 'Breadth stage', 'data-review-detail', 'ReviewAreaRail', 'Stop the interview'];
  const found = banned.filter((b) => interview.includes(b) || question.includes(b));
  const noText = !/<textarea|type="text"/.test(question);
  const savesOnChoose = /onChange=\{\(\) => \{\s*if \(saving\) return;\s*setChosen\(c\.value\);\s*onSubmit\(c\.value\);/.test(question);
  return [found.length === 0 && noText && savesOnChoose && /% complete/.test(interview) && /minutes left|'minute' : 'minutes'/.test(interview), found.length ? `still present: ${found.join(', ')}` : 'clean'];
});
await T('RX-05', 'Start: production asks for name, work email, organisation and optional role, links to the live terms and goes straight to the interview', async () => {
  const form = fs.readFileSync('src/components/readiness-review/ReviewStartForm.tsx', 'utf8');
  const route = fs.readFileSync('src/app/review/api/sessions/route.ts', 'utf8');
  const ok = /name="fullName"/.test(form) && /name="email" type="email"/.test(form) && /name="roleTitle"/.test(form) && /\/fraud-readiness-assessment-terms/.test(form)
    && !/fraud-readiness-score\/terms/.test(form) && /production \? json\.respondent : json\.links/.test(form)
    && /validateContact\(body\?\.contact\)/.test(route) && route.indexOf('validateContact') < route.indexOf('await createSession(String');
  return [ok, ok ? 'contact validated before anything is stored' : 'missing'];
});
await T('RX-06', 'The production Snapshot has no functions, packages, owner links or stage tables; MK is told on completion and stalled reviews ride the hourly job', async () => {
  const doc = fs.readFileSync('src/components/readiness-review/SnapshotDocument.tsx', 'utf8');
  const live = doc.slice(doc.indexOf('function LiveSnapshot'), doc.indexOf('export function SnapshotDocument'));
  const banned = ['SendToOwners', 'OwnerPackagesNote', 'StageOutstanding', 'StatusPanel', 'managementToken', 'accountable function', 'Waiting for an owner'];
  const found = banned.filter((b) => live.includes(b));
  const action = fs.readFileSync('src/app/review/api/s/[token]/route.ts', 'utf8');
  const cron = fs.readFileSync('src/app/score/api/internal/adaptive-stalled-leads/route.ts', 'utf8');
  const ok = found.length === 0 && /if \(customer \|\| \(ordering === 'live' && !view\.fictional\)\) return <LiveSnapshot/.test(doc) && /notifyReviewCompleted/.test(action) && /monitorReviewStalledLeads/.test(cron);
  return [ok, found.length ? `still present: ${found.join(', ')}` : 'clean'];
});

await T('RX-07', 'The local customer preview never applies on a deployment and never creates a real session', async () => {
  const harness = fs.readFileSync('src/lib/readiness-review/harness.ts', 'utf8');
  const route = fs.readFileSync('src/app/review/api/sessions/route.ts', 'utf8');
  const ok = /status\.reason === 'fictional-local' && process\.env\.MK_READINESS_REVIEW_CUSTOMER_PREVIEW === '1' && !process\.env\.VERCEL/.test(harness)
    && /fictional: reviewHarnessStatus\(\)\.reason !== 'production'/.test(route) && /contact && contactsAvailable\(\)/.test(route);
  return [ok, ok ? 'local harness only; sessions stay fictional; no contact stored without the database' : 'guard missing'];
});
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
