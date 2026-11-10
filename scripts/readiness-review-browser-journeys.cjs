// Browser journeys for the Fraud Readiness review track, driven through the real pages of a running build.
// node scripts/readiness-review-browser-journeys.cjs <baseUrl> <outDir>
// The server must run with MK_READINESS_REVIEW_HARNESS=fictional-local (and MK_READINESS_REVIEW_FAULTS=enabled for the
// save-failure journey). Every answer, save and navigation goes through page controls. Engine state is read through the
// review API only to verify outcomes, never to change them. All organisations and answers are fictional.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3200';
const OUT = process.argv[3] || 'qa-output/readiness-review';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'video'), { recursive: true });
const results = [];
const timings = [];
const rec = (id, name, ok, detail) => {
  results.push({ id, name, status: ok ? 'pass' : 'fail', detail });
  console.log(`${id.padEnd(8)} ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `\n         ${detail}` : ''}`);
};
const api = async (p) => (await fetch(BASE + p, { cache: 'no-store' })).json();
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7);
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };

async function createSession(page, label) {
  await page.goto(`${BASE}/review`, { waitUntil: 'networkidle' });
  await page.fill('#review-org', label);
  await page.check('[data-review-start-form] input[type=checkbox]');
  await Promise.all([page.waitForURL(/\/review\/s\/[A-Za-z0-9_-]+$/), page.click('[data-review-start-form] button[type=submit]')]);
  const linksToken = page.url().split('/').pop();
  const links = await page.$$eval('[data-link] a', (as) => Object.fromEntries(as.map((a) => [a.closest('[data-link]').getAttribute('data-link'), a.getAttribute('href').split('/').pop()])));
  return { linksToken, links };
}

/** Default answering policy: profile from a fixed fictional profile, mostly in place, some partial, "unknown" where asked. */
function choose(qid, values, multi, overrides = {}) {
  if (overrides[qid]) return overrides[qid];
  if (multi) {
    if (qid === '__assumptions__') return values.includes('none') ? ['none'] : [values[0]];
    if (qid === 'D5-G-01' || qid === 'D6-S-02') return values.filter((v) => !['none', 'unknown'].includes(v)).slice(0, 2);
    return [values.find((v) => v !== 'unknown')];
  }
  if (qid.startsWith('PR-')) return PROFILE[qid] && values.includes(PROFILE[qid]) ? PROFILE[qid] : values.find((v) => v !== 'unknown');
  const k = hash(qid) % 5;
  if (values.includes('4')) return k === 1 ? '2' : '4';
  if (values.includes('full')) return k === 1 ? 'partial' : 'full';
  if (values.includes('yes')) return 'yes';
  return values.find((v) => v !== 'unknown');
}

async function currentQuestion(page) {
  const done = await page.$('[data-review-complete]');
  if (done) return null;
  const stage = await page.waitForSelector('[data-question-stage]', { timeout: 15000 });
  const qid = await stage.getAttribute('data-question-id');
  const multi = Boolean(await page.$('[data-review-multi]'));
  const values = multi
    ? await page.$$eval('[data-review-multi] input[type=checkbox]', (els) => els.map((e) => e.closest('label').textContent.trim()))
    : await page.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => e.value));
  return { qid, multi, values };
}

async function multiValues(page) {
  // Checkbox labels carry no value attribute; read the step's choices through the API view instead.
  return null;
}

async function answer(page, token, overrides = {}, pick) {
  const q = await currentQuestion(page);
  if (!q) return null;
  const t0 = Date.now();
  if (q.multi) {
    const view = await api(`/review/api/s/${token}`);
    const choices = view.view.step.choices.map((c) => c.value);
    const wanted = (pick ? pick(q.qid, choices, true) : choose(q.qid, choices, true, overrides));
    const boxes = await page.$$('[data-review-multi] input[type=checkbox]');
    for (let i = 0; i < choices.length; i++) if (wanted.includes(choices[i])) await boxes[i].check();
    await page.click('[data-review-multi] button:has-text("Save answer")');
    q.value = wanted;
  } else {
    const v = pick ? pick(q.qid, q.values, false) : choose(q.qid, q.values, false, overrides);
    await page.click(`[data-question-stage] label:has(input[type=radio][value="${v}"])`);
    // Either the optional detail panel opens (answer not yet saved) or the save and transition run.
    await page.waitForFunction((prev) => {
      if (document.querySelector('[data-review-detail]')) return true;
      if (document.querySelector('[data-review-complete]') || document.querySelector('[data-review-message][role=alert]')) return true;
      const s = document.querySelector('[data-question-stage]');
      return s && s.getAttribute('data-question-id') !== prev;
    }, q.qid, { timeout: 20000, polling: 'raf' });
    if (await page.$('[data-review-detail]')) await page.click('[data-review-detail] button:has-text("Save answer")');
    q.value = v;
  }
  const t1 = Date.now();
  await page.waitForFunction((prev) => {
    if (document.querySelector('[data-review-complete]')) return true;
    if (document.querySelector('[data-review-message][role=alert]')) return true;
    const s = document.querySelector('[data-question-stage]');
    const root = document.querySelector('[data-review-interview]');
    return s && s.getAttribute('data-question-id') !== prev && root?.getAttribute('data-transition-phase') === 'idle';
  }, q.qid, { timeout: 20000, polling: 'raf' });
  timings.push({ kind: 'answer-to-next-question', ms: Date.now() - t0, afterDetail: Date.now() - t1, multi: q.multi });
  return q;
}

async function runToEnd(page, token, overrides, limit = 200, pick) {
  const answered = [];
  for (let i = 0; i < limit; i++) {
    const q = await answer(page, token, overrides, pick);
    if (!q) break;
    answered.push(q);
  }
  return answered;
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
}

// Geometry of the instrument: area rail, question card, context panel and the prompt itself.
async function instrumentLayout(page) {
  return page.evaluate(() => {
    const r = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { w: Math.round(b.width), x: Math.round(b.left), shown: getComputedStyle(e).display !== 'none' && b.width > 0 };
    };
    return { vw: innerWidth, rail: r('[data-review-areas]'), card: r('.question-instrument'), context: r('[data-review-context]'), prompt: r('[data-question-stage] h1') };
  });
}
let layoutDesk = null;
let layoutPhone = null;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let expectingHttpErrors = false;
  const expectedHttpErrors = [];
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1280, height: 900 } } });
  const page = await desk.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  // J-21 provokes a 503 and a 409 on purpose; the browser logs those responses, and only those are set aside.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expectingHttpErrors && /Failed to load resource: the server responded with a status of (503|409)/.test(m.text())) return expectedHttpErrors.push(m.text());
    errors.push(m.text());
  });

  // ------------------------------------------------------------------ J-01 main respondent journey to the cap
  let main;
  try {
    main = await createSession(page, 'Fictional Retail Group');
    await page.goto(`${BASE}/review/s/${main.links.respondent}`, { waitUntil: 'networkidle' });
    const orientation = await page.textContent('[data-review-orientation]');
    await page.screenshot({ path: path.join(OUT, 'shots', 'after-orientation-1280.png'), fullPage: true });
    await page.click('button:has-text("Begin the interview")');
    const first = await currentQuestion(page);
    layoutDesk = await instrumentLayout(page);
    await page.screenshot({ path: path.join(OUT, 'shots', 'after-question-1280.png') });
    const answered = await runToEnd(page, main.links.respondent, { 'PR-06': 'unknown' });
    await page.waitForSelector('[data-review-complete]');
    await page.screenshot({ path: path.join(OUT, 'shots', 'after-completion-1280.png') });
    const snap = await api(`/review/api/s/${main.links.respondent}/snapshot`);
    const s = snap.view.status;
    rec('J-01', 'Respondent completes orientation and the interview through the page; it stops at the 95-screen limit',
      /95 screens/.test(orientation) && /I don.t know/.test(orientation) && first.qid.startsWith('PR-') && s.screensUsed === 95 && s.stopReason === 'ceiling' && answered.length === 95,
      `orientation explains limit and handoff; first question ${first.qid}; ${answered.length} answers through the page; screens ${s.screensUsed}; stop ${s.stopReason}`);
    const multis = answered.filter((q) => q.multi && ['D5-G-01', 'D6-S-02'].includes(q.qid));
    const exp = await api(`/review/api/s/${main.links.respondent}/export`);
    const stored = multis.map((q) => ({ q: q.qid, v: exp.report.domains.flatMap((d) => d.rows).find((r) => r.id === q.qid)?.answer?.v }));
    rec('J-02', 'Mixed payroll and payment routes chosen on the page are stored as several modes', multis.length > 0 && stored.every((x) => Array.isArray(x.v) && x.v.length === 2),
      multis.length ? stored.map((x) => `${x.q}=${JSON.stringify(x.v)}`).join('; ') : 'neither D5-G-01 nor D6-S-02 was reached on this route');
  } catch (e) {
    rec('J-01', 'Respondent journey to the cap', false, String(e).slice(0, 300));
  }

  // ------------------------------------------------------------------ J-03 Snapshot: unknown route, sections, parity
  try {
    await page.click('a:has-text("Open the Snapshot")');
    await page.waitForSelector('[data-review-snapshot]');
    await page.screenshot({ path: path.join(OUT, 'shots', 'after-snapshot-1280.png'), fullPage: true });
    const fs107 = await page.getAttribute('[data-scenario="FS-D1-07"]', 'data-scenario-status').catch(() => null);
    const apiSnap = await api(`/review/api/s/${main.links.respondent}/snapshot`);
    const exp = await api(`/review/api/s/${main.links.respondent}/export`);
    const pageCounts = await page.$$eval('[data-count]', (els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-count'), Number(e.querySelector('dd span').textContent)])));
    const apiCounts = Object.fromEntries(apiSnap.view.counts.map((c) => [c.key, c.value]));
    const expCounts = Object.fromEntries(exp.views.snapshot.counts.map((c) => [c.key, c.value]));
    const report = exp.report;
    const parity = JSON.stringify(pageCounts) === JSON.stringify(apiCounts) && JSON.stringify(apiCounts) === JSON.stringify(expCounts)
      && apiCounts['reported-gaps'] === report.issues.length && apiCounts.waiting === report.waiting.length && apiCounts['open-scenarios'] === report.unresolvedMaterial.length;
    rec('J-03', 'Unknown profile fact keeps FS-D1-07 open as route-incomplete on the Snapshot page', fs107 === 'route-incomplete' || fs107 === 'waiting',
      `FS-D1-07 on the page: ${fs107}`);
    rec('J-04', 'Snapshot page, API and export carry the same counts, equal to the engine report', parity, `page ${JSON.stringify(pageCounts)}; API ${JSON.stringify(apiCounts)}; export ${JSON.stringify(expCounts)}`);
    const text = await page.textContent('[data-review-snapshot]');
    rec('J-05', 'The Snapshot shows no score, rating, maturity level or confidence', !/\b\d{1,3}\s*\/\s*100\b|maturity level|readiness score|confidence|\brating:/i.test(text), 'scanned the rendered Snapshot text');
  } catch (e) {
    rec('J-03', 'Snapshot checks', false, String(e).slice(0, 300));
  }

  // ------------------------------------------------------------------ J-06 owner continuation after the cap
  try {
    await page.click('[data-review-send-owners] button');
    await page.waitForSelector('[data-review-packages]', { timeout: 15000 });
    const linksView = await api(`/review/api/s/${main.linksToken}`);
    let ownerToken = null;
    for (const f of linksView.view.functions) {
      const v = await api(`/review/api/s/${f.token}`);
      if (v.view.items.some((i) => i.id === 'PR-06')) { ownerToken = f.token; break; }
    }
    const before = (await api(`/review/api/s/${main.links.respondent}/snapshot`)).view.status;
    await page.goto(`${BASE}/review/s/${ownerToken}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, 'shots', 'after-owner-1280.png'), fullPage: true });
    const seen = [];
    for (let i = 0; i < 80; i++) {
      const stage = await page.$('[data-question-stage]');
      if (!stage) break;
      const qid = await stage.getAttribute('data-question-id');
      seen.push(qid);
      const values = await page.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => e.value));
      const multi = Boolean(await page.$('[data-review-multi]'));
      if (multi) {
        await page.locator('[data-review-multi] input[type=checkbox]').first().check();
        await page.click('[data-review-multi] button:has-text("Save answer")');
      } else {
        const v = qid === 'PR-06' ? 'yes' : choose(qid, values, false);
        await page.click(`[data-question-stage] label:has(input[type=radio][value="${v}"])`);
        if (await page.waitForSelector('[data-review-detail]', { timeout: 700 }).catch(() => null)) await page.click('[data-review-detail] button:has-text("Save answer")');
      }
      await page.waitForFunction((prev) => {
        const s = document.querySelector('[data-question-stage]');
        return !s || s.getAttribute('data-question-id') !== prev;
      }, qid, { timeout: 20000 });
    }
    const after = (await api(`/review/api/s/${main.links.respondent}/snapshot`)).view;
    const idx = seen.indexOf('PR-06');
    rec('J-06', 'After the cap, the accountable function answers its package on its own page; a newly opened confirmation follows; respondent screens stay at 95',
      idx >= 0 && seen.includes('D1-L-04') && after.status.screensUsed === 95 && before.screensUsed === 95 && after.status.interview === 'ended' && after.status.ownerAnswers >= 2,
      `owner answered ${seen.length} questions: ${seen.slice(0, 6).join(', ')}${seen.length > 6 ? '…' : ''}; D1-L-04 opened after PR-06: ${seen.includes('D1-L-04')}; respondent screens ${before.screensUsed} then ${after.status.screensUsed}; owner answers ${after.status.ownerAnswers}`);
    const fs107 = after.openScenarios.find((x) => x.id === 'FS-D1-07');
    rec('J-07', 'Once the owner settles the unknown fact, FS-D1-07 is no longer held open by an undecided route', !fs107 || fs107.status !== 'route-incomplete', `FS-D1-07 now ${fs107 ? fs107.status : 'settled'}`);
  } catch (e) {
    rec('J-06', 'Owner continuation after the cap', false, String(e).slice(0, 300));
  }

  // ------------------------------------------------------------------ J-20 why each question is waiting, on the page, against the log
  try {
    await page.goto(`${BASE}/review/s/${main.links.respondent}/snapshot`, { waitUntil: 'networkidle' });
    const items = await page.$$eval('#waiting [data-control]', (els) => els.map((e) => ({ id: e.getAttribute('data-control'), kind: e.getAttribute('data-waiting-kind'), text: e.textContent })));
    const sources = await page.$$eval('[data-waiting-source]', (els) => els.map((e) => [e.getAttribute('data-waiting-source'), Number(e.querySelector('span').textContent)]));
    const exp = await api(`/review/api/s/${main.links.respondent}/export`);
    const last = new Map();
    for (const l of exp.report.log) if (l.q && !String(l.q).startsWith('__')) last.set(l.q, l);
    const rows = new Map(exp.report.waiting.map((r) => [r.id, r]));
    const isUnknown = (v) => v === 'unknown' || (Array.isArray(v) && v.length === 1 && v[0] === 'unknown');
    const wrong = items.filter((it) => {
      const l = last.get(it.id);
      const row = rows.get(it.id);
      if (!row) return true;
      if (it.kind === 'respondent-unknown') return !(l && l.via !== 'owner' && isUnknown(l.v));
      if (it.kind === 'owner-unknown') return !(l && l.via === 'owner' && isUnknown(l.v));
      if (it.kind === 'not-reached') return Boolean(l && !isUnknown(l.v)) || row.assignment?.origin !== 'follow-up';
      if (it.kind === 'owner-opened') return !row.ownerFollowup;
      if (it.kind === 'scope-waiting') return row.state !== 'waiting-scope';
      if (it.kind === 'area') return !row.bulk;
      return true;
    });
    const falseUnknown = items.filter((it) => /I don.t know/.test(it.text) && !isUnknown(last.get(it.id)?.v));
    const sum = sources.reduce((n, [, c]) => n + c, 0);
    rec('J-20', 'Every waiting item on the Snapshot page states why it is waiting, and each reason matches the recorded answers and assignments',
      items.length === exp.report.waiting.length && wrong.length === 0 && falseUnknown.length === 0 && sum === items.length && items.some((i) => i.kind === 'not-reached'),
      `${items.length} items; by source ${JSON.stringify(Object.fromEntries(sources))}; mismatched ${wrong.map((w) => `${w.id}:${w.kind}`).slice(0, 4).join(',') || 'none'}; unknown claimed without an unknown answer ${falseUnknown.length}`);
  } catch (e) {
    rec('J-20', 'Waiting provenance', false, String(e).slice(0, 300));
  }

  // ------------------------------------------------------------------ J-08 reviewer: follow-up, standalone follow-up, validation
  let reviewedId = null;
  try {
    await page.goto(`${BASE}/review/s/${main.links.reviewer}`, { waitUntil: 'networkidle' });
    await page.click('[role=tab]:has-text("Evidence to review")');
    const picks = await page.$$eval('[data-review-pick]', (els) => els.map((e) => e.getAttribute('data-review-pick')));
    reviewedId = picks[0];
    await page.click(`[data-review-pick="${reviewedId}"]`);
    await page.selectOption('[data-review-form] select[name=ev]', 'reviewed-sufficient');
    await page.selectOption('[data-review-form] select[name=con]', 'confirmed');
    await page.fill('[data-review-form] input[name=basis]', 'Fictional sample of three months');
    await page.fill('[data-review-form] input[name=fu]', 'Obtain the branch sample');
    await page.click('[data-review-form] button[type=submit]');
    await page.waitForSelector('[data-review-form] [role=status]');
    const second = picks[1];
    await page.click(`[data-review-pick="${second}"]`);
    await page.fill('[data-review-form] input[name=fu]', 'Check the sample size with the branch');
    await page.click('[data-review-form] button[type=submit]');
    await page.waitForSelector('[data-review-form] [role=status]');
    const third = picks[2];
    await page.click(`[data-review-pick="${third}"]`);
    const seqBefore = (await api(`/review/api/s/${main.links.reviewer}`)).view.seq;
    await page.fill('[data-review-form] input[name=basis]', 'A basis with no decision');
    await page.click('[data-review-form] button[type=submit]');
    const err = await page.textContent('[data-review-form-error]').catch(() => '');
    const seqAfter = (await api(`/review/api/s/${main.links.reviewer}`)).view.seq;
    await page.click('[role=tab]:has-text("Follow-ups")');
    await page.screenshot({ path: path.join(OUT, 'shots', 'after-reviewer-1280.png'), fullPage: true });
    const rv = (await api(`/review/api/s/${main.links.reviewer}`)).view;
    const mg = (await api(`/review/api/s/${main.links.management}`)).view;
    const mkActions = mg.whoActsNext.find((g) => g.actor === 'MK reviewer')?.actions.map((a) => a.text) ?? [];
    rec('J-08', 'A confirmed review with a follow-up and a follow-up saved alone both become reviewer tasks and management actions',
      rv.tasks.some((t) => t.id === reviewedId && t.conclusion === 'Confirmed') && rv.tasks.some((t) => t.id === second && t.conclusion === 'No conclusion yet') && mkActions.some((a) => a.includes('Obtain the branch sample')) && mkActions.some((a) => a.includes('Check the sample size')),
      `tasks ${rv.tasks.map((t) => `${t.id}:${t.conclusion}`).join(', ')}; MK reviewer actions ${mkActions.length}`);
    rec('J-09', 'A reviewer save with nothing to record shows a message and stores nothing', /Choose an evidence state/.test(err) && seqAfter === seqBefore, `message "${err}"; sequence ${seqBefore} then ${seqAfter}`);
  } catch (e) {
    rec('J-08', 'Reviewer follow-up journey', false, String(e).slice(0, 300));
  }

  // ------------------------------------------------------------------ J-10 correction after review: stale record and history
  try {
    const rvBefore = (await api(`/review/api/s/${main.links.reviewer}`)).view.controls.find((c) => c.id === reviewedId);
    await page.goto(`${BASE}/review/s/${main.links.respondent}`, { waitUntil: 'networkidle' });
    await page.click('[data-review-answers] summary');
    await page.click(`[data-review-change="${reviewedId}"]`);
    const values = await page.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => ({ v: e.value, c: e.checked })));
    const current = values.find((x) => x.c)?.v;
    const other = values.find((x) => !x.c && x.v !== 'unknown')?.v;
    await page.click(`[data-question-stage] label:has(input[type=radio][value="${other}"])`);
    await page.waitForSelector('[data-review-complete]', { timeout: 20000 });
    await page.goto(`${BASE}/review/s/${main.links.reviewer}`, { waitUntil: 'networkidle' });
    await page.click('[role=tab]:has-text("Needs re-review")');
    await page.click(`[data-review-pick="${reviewedId}"]`);
    const conclusionCurrent = await page.getAttribute('[data-review-conclusion-current]', 'data-review-conclusion-current');
    await page.selectOption('[data-review-form] select[name=ev]', 'insufficient');
    await page.fill('[data-review-form] input[name=evbasis]', 'Second fictional sample');
    await page.click('[data-review-form] button[type=submit]');
    await page.waitForSelector('[data-review-form] [role=status]');
    await page.screenshot({ path: path.join(OUT, 'shots', 'after-reviewer-stale-1280.png'), fullPage: true });
    const mg = (await api(`/review/api/s/${main.links.management}`)).view;
    const finding = mg.needsRemediation.reviewerFindings.find((f) => f.id === reviewedId);
    const mgPage = await (await fetch(`${BASE}/review/s/${main.links.management}`)).text();
    await page.selectOption('[data-review-form] select[name=con]', 'not-confirmed');
    await page.fill('[data-review-form] input[name=fu]', 'New task after the change');
    await page.click('[data-review-form] button[type=submit]');
    await page.waitForSelector('[data-review-form] [role=status]');
    await page.click('[data-review-history] summary');
    const history = await page.textContent('[data-review-history]');
    rec('J-10', 'After the respondent changes a reviewed answer, the earlier confirmation is shown as not current and new insufficient evidence does not revive it',
      rvBefore && current !== other && conclusionCurrent === 'false' && finding && finding.conclusion === null && finding.followUp === '' && !mg.whoActsNext.some((g) => g.actions.some((a) => a.text.includes('Obtain the branch sample'))),
      `answer ${current} → ${other}; earlier conclusion current: ${conclusionCurrent}; management finding conclusion ${finding && finding.conclusion}, follow-up "${finding && finding.followUp}"; old task in actions: ${mg.whoActsNext.some((g) => g.actions.some((a) => a.text.includes('Obtain the branch sample')))}`);
    rec('J-11', 'Reviewer history keeps the earlier answer version, value and follow-up', /answer version 1/.test(history) && /Obtain the branch sample/.test(history), history.replace(/\s+/g, ' ').slice(0, 240));
  } catch (e) {
    rec('J-10', 'Correction after review', false, String(e).slice(0, 300));
  }

  // ------------------------------------------------------------------ J-21 reviewer drafts survive switching, failure and conflict
  try {
    await page.goto(`${BASE}/review/s/${main.links.reviewer}`, { waitUntil: 'networkidle' });
    await page.click('[role=tab]:has-text("All reported answers")');
    const all = await api(`/review/api/s/${main.links.reviewer}`);
    const respondentAnswered = all.view.controls.filter((c) => c.answeredBy === 'Respondent' && !c.reviewRecord && !c.evidenceRecord && c.id !== reviewedId).map((c) => c.id);
    const [a, b, c, d] = respondentAnswered;
    const fu = '[data-review-form] input[name=fu]';
    await page.click(`[data-review-pick="${a}"]`);
    await page.fill(fu, 'Draft follow-up for A');
    await page.click(`[data-review-pick="${b}"]`);
    const bEmpty = (await page.inputValue(fu)) === '';
    const aIndicator = await page.getAttribute(`[data-review-pick="${a}"] [data-review-draft-indicator]`, 'data-review-draft-indicator').catch(() => null);
    await page.click('[role=tab]:has-text("Follow-ups")');
    await page.click('[role=tab]:has-text("All reported answers")');
    await page.click(`[data-review-pick="${a}"]`);
    const afterSwitch = await page.inputValue(fu);
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[role=tab]:has-text("All reported answers")');
    await page.click(`[data-review-pick="${a}"]`);
    const afterReload = await page.inputValue(fu);
    // Discarding asks first; "Keep it" keeps the draft, "Discard" removes it.
    await page.click('[data-review-discard="current"]');
    const asked = Boolean(await page.$('[data-review-discard-confirm="current"]'));
    await page.click('[data-review-discard-confirm="current"] button:has-text("Keep it")');
    const kept = await page.inputValue(fu);
    await page.click('[data-review-discard="current"]');
    await page.click('[data-review-discard-confirm="current"] button:has-text("Discard")');
    const discarded = (await page.inputValue(fu)) === '' && !(await page.$(`[data-review-pick="${a}"] [data-review-draft-indicator]`));
    // A failed save keeps the draft; the retry saves it once and clears it.
    await page.click(`[data-review-pick="${b}"]`);
    await page.fill(fu, 'Draft follow-up for B');
    expectingHttpErrors = true;
    let failNext = true;
    await page.route(`**/review/api/s/${main.links.reviewer}`, (route) => {
      if (route.request().method() === 'POST' && failNext) {
        failNext = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'save_failed', message: 'Your answer could not be saved. Nothing was recorded; you can try again.' }) });
      }
      return route.continue();
    });
    await page.click('[data-review-form] button[type=submit]');
    await page.waitForSelector('[data-review-form-error]');
    const failMsg = await page.textContent('[data-review-form-error]');
    const keptAfterFailure = await page.inputValue(fu);
    await page.click('[data-review-form] button[type=submit]');
    await page.waitForSelector('[data-review-form] [role=status]');
    await page.unroute(`**/review/api/s/${main.links.reviewer}`);
    const bSaved = (await api(`/review/api/s/${main.links.reviewer}`)).view.tasks.filter((t) => t.id === b && /Draft follow-up for B/.test(t.followUp ?? t.text ?? JSON.stringify(t))).length;
    const clearedAfterSave = (await page.inputValue(fu)) === '';
    // A draft written for one answer version is not attached to a changed answer after a conflict reload.
    await page.click(`[data-review-pick="${c}"]`);
    const versionBefore = Number(await page.textContent('[data-review-form] p').then((t) => (t.match(/version (\d+)/) || [])[1]));
    await page.fill(fu, 'Draft follow-up for C, written against the first answer');
    await page.click(`[data-review-pick="${d}"]`);
    await page.fill(fu, 'Draft follow-up for D');
    const other = await desk.newPage();
    await other.goto(`${BASE}/review/s/${main.links.respondent}`, { waitUntil: 'networkidle' });
    await other.click('[data-review-answers] summary');
    await other.click(`[data-review-change="${c}"]`);
    const vals = await other.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => ({ v: e.value, c: e.checked })));
    const changeTo = vals.find((x) => !x.c && x.v !== 'unknown')?.v;
    await other.click(`[data-question-stage] label:has(input[type=radio][value="${changeTo}"])`);
    if (await other.waitForSelector('[data-review-detail]', { timeout: 700 }).catch(() => null)) await other.click('[data-review-detail] button:has-text("Save answer")');
    await other.waitForSelector('[data-review-complete]', { timeout: 20000 });
    await other.close();
    // The reviewer's next save meets a conflict; the page reloads the session and keeps D's draft for a retry.
    await page.click('[data-review-form] button[type=submit]');
    await page.waitForSelector('[data-review-form-error]');
    const conflictMsg = await page.textContent('[data-review-form-error]');
    const dKept = await page.inputValue(fu);
    await page.click('[data-review-form] button[type=submit]');
    await page.waitForSelector('[data-review-form] [role=status]');
    await page.click(`[data-review-pick="${c}"]`);
    const earlierPanel = await page.getAttribute('[data-review-earlier-draft]', 'data-review-earlier-draft').catch(() => null);
    const cFormEmpty = (await page.inputValue(fu)) === '';
    const cIndicator = await page.getAttribute(`[data-review-pick="${c}"] [data-review-draft-indicator]`, 'data-review-draft-indicator').catch(() => null);
    await page.screenshot({ path: path.join(OUT, 'shots', 'after-reviewer-earlier-draft-1280.png'), fullPage: true });
    await page.click('[data-review-adopt-earlier]');
    const adopted = await page.inputValue(fu);
    expectingHttpErrors = false;
    rec('J-21', 'Reviewer drafts are kept across control and queue switches and a reload, survive a failed save and a conflict, are never attached to a changed answer, and are discarded only after confirmation',
      bEmpty && aIndicator === 'current' && afterSwitch === 'Draft follow-up for A' && afterReload === 'Draft follow-up for A' && asked && kept === 'Draft follow-up for A' && discarded &&
      /Your draft is kept/.test(failMsg) && keptAfterFailure === 'Draft follow-up for B' && bSaved === 1 && clearedAfterSave &&
      /changed in another window/.test(conflictMsg) && dKept === 'Draft follow-up for D' && Number(earlierPanel) === versionBefore && cFormEmpty && cIndicator === 'earlier' && /first answer/.test(adopted),
      `switch kept ${afterSwitch === 'Draft follow-up for A'}, reload kept ${afterReload === 'Draft follow-up for A'}, discard asked ${asked} and removed ${discarded}; failed save "${failMsg.trim().slice(0, 60)}…" kept ${keptAfterFailure === 'Draft follow-up for B'}, retry saved ${bSaved}; conflict kept D ${dKept === 'Draft follow-up for D'}; C draft for version ${earlierPanel} shown apart from version ${versionBefore + 1}, form empty ${cFormEmpty}, adopted on request ${/first answer/.test(adopted)}`);
  } catch (e) {
    rec('J-21', 'Reviewer drafts', false, String(e).slice(0, 300));
  }
  await page.close();
  await desk.close();

  // ------------------------------------------------------------------ J-12 save failure and retry, Back and correction, stop and resume (mobile)
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, recordVideo: { dir: path.join(OUT, 'video'), size: { width: 390, height: 844 } } });
  const mp = await mob.newPage();
  mp.on('pageerror', (e) => errors.push(String(e)));
  try {
    const s2 = await createSession(mp, 'Fictional Logistics Co');
    await mp.goto(`${BASE}/review/s/${s2.links.respondent}?fault=save`, { waitUntil: 'networkidle' });
    await mp.click('button:has-text("Begin the interview")');
    const q1 = await currentQuestion(mp);
    layoutPhone = await instrumentLayout(mp);
    await mp.click(`[data-question-stage] label:has(input[type=radio][value="${choose(q1.qid, q1.values, false)}"])`);
    await mp.waitForSelector('[data-review-message]');
    const failText = await mp.textContent('[data-review-message]');
    await mp.screenshot({ path: path.join(OUT, 'shots', 'after-save-failure-390.png') });
    await mp.click('button:has-text("Try saving again")');
    await mp.waitForFunction((prev) => document.querySelector('[data-question-stage]')?.getAttribute('data-question-id') !== prev, q1.qid);
    const exp1 = await api(`/review/api/s/${s2.links.respondent}/export`);
    const stored = exp1.report.log.filter((l) => l.q === q1.qid).length;
    rec('J-12', 'A failed save keeps the selection, explains that nothing was recorded, and a retry saves exactly once', /could not be saved/.test(failText) && stored === 1, `message "${failText.replace(/\s+/g, ' ').slice(0, 120)}"; stored entries for ${q1.qid}: ${stored}`);

    for (let i = 0; i < 3; i++) await answer(mp, s2.links.respondent);
    const beforeBack = await currentQuestion(mp);
    await mp.click('button:has-text("← Back")');
    await mp.waitForSelector('[data-review-back]');
    const backQ = await mp.getAttribute('[data-question-stage]', 'data-question-id');
    const radios = await mp.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => ({ v: e.value, c: e.checked })));
    const saved = radios.find((r) => r.c)?.v;
    const change = radios.find((r) => !r.c && r.v !== 'unknown')?.v;
    await mp.click(`[data-question-stage] label:has(input[type=radio][value="${change}"])`);
    await mp.waitForSelector('[data-review-message]:has-text("Your change is saved")');
    const exp2 = await api(`/review/api/s/${s2.links.respondent}/export`);
    const row = exp2.report.domains.flatMap((d) => d.rows).find((r) => r.id === backQ) || exp2.report.profile.find((p) => p.id === backQ);
    rec('J-13', 'Back shows the saved answer selected; changing it records a correction with history and returns to the interview',
      Boolean(saved) && saved !== change && Boolean(await mp.$('[data-question-stage]')) && !(await mp.$('[data-review-back]')),
      `back to ${backQ} with saved "${saved}" selected; changed to "${change}"; returned to ${await mp.getAttribute('[data-question-stage]', 'data-question-id')} (was ${beforeBack.qid})`);

    await mp.click('[data-review-stop] button');
    await mp.click('button:has-text("Stop the interview")');
    await mp.waitForSelector('[data-review-complete]');
    const stopText = await mp.textContent('[data-review-complete]');
    await mp.click('button:has-text("Resume the interview")');
    await mp.waitForSelector('[data-question-stage]');
    rec('J-14', 'Stop leaves the interview resumable and resume returns to a question', /stopped the interview/i.test(stopText), stopText.replace(/\s+/g, ' ').slice(0, 140));

    // Lower answer choices and long prompts at narrow widths: the next prompt is in view after each transition.
    const inView = [];
    for (const [w, h] of [[320, 568], [375, 812], [430, 932]]) {
      await mp.setViewportSize({ width: w, height: h });
      for (let i = 0; i < 3; i++) {
        await answer(mp, s2.links.respondent, {}, (qid, values, multi) => (multi ? [values.find((v) => v !== 'unknown' && v !== 'none') ?? values[0]] : [...values].reverse().find((v) => v !== 'unknown' && v !== 'na')));
        const r = await mp.evaluate(() => { const h1 = document.querySelector('[data-question-stage] h1'); const b = h1.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: innerHeight, focus: document.activeElement === h1, overflow: document.documentElement.scrollWidth - innerWidth }; });
        inView.push({ w, ...r });
      }
    }
    rec('J-15', 'At 320, 375 and 430px, after choosing lower answers, the next prompt is in view, focused, and the page does not scroll sideways',
      inView.every((r) => r.top >= 0 && r.top < r.vh && r.focus && r.overflow <= 0), inView.map((r) => `${r.w}: top ${r.top}, focus ${r.focus}, overflow ${r.overflow}`).join('; '));
  } catch (e) {
    rec('J-12', 'Mobile recovery journey', false, String(e).slice(0, 300));
  }
  await mp.close();
  await mob.close();

  // ------------------------------------------------------------------ J-16 keyboard, reduced motion and zoom
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 800 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const s3 = await createSession(p, 'Fictional Clinic Network');
    await p.goto(`${BASE}/review/s/${s3.links.respondent}`, { waitUntil: 'networkidle' });
    await p.keyboard.press('Tab');
    await p.click('button:has-text("Begin the interview")');
    const q = await currentQuestion(p);
    await p.focus('[data-question-stage] input[type=radio]');
    await p.keyboard.press('Space');
    await p.waitForFunction((prev) => document.querySelector('[data-question-stage]')?.getAttribute('data-question-id') !== prev, q.qid, { timeout: 15000 });
    const focus = await p.evaluate(() => document.activeElement?.tagName);
    const ov = await noOverflow(p);
    rec('J-16', 'Keyboard answer with reduced motion at 640px (1280px at 200% zoom): saves, advances and focuses the next prompt without sideways scroll', focus === 'H1' && ov <= 0, `focus ${focus}; overflow ${ov}`);
    await ctx.close();
  } catch (e) {
    rec('J-16', 'Keyboard and reduced motion', false, String(e).slice(0, 300));
  }

  // ------------------------------------------------------------------ J-17 error states
  try {
    const p = await browser.newPage();
    const r = await p.goto(`${BASE}/review/s/notarealtokenAAAAAAAAAAAA`);
    const apiBad = await fetch(`${BASE}/review/api/s/notarealtokenAAAAAAAAAAAA`);
    const conflict = await fetch(`${BASE}/review/api/s/${main.links.respondent}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: 'conflict-check-0001', expectedSeq: 1, action: { type: 'respondent.stop' } }) });
    rec('J-17', 'Unknown links return not found; a stale write is refused as a conflict', r.status() === 404 && apiBad.status === 404 && conflict.status === 409, `page ${r.status()}, API ${apiBad.status}, stale write ${conflict.status}`);
    await p.close();
  } catch (e) {
    rec('J-17', 'Error states', false, String(e).slice(0, 300));
  }

  // ------------------------------------------------------------------ J-22 telemetry from review pages, captured by a local sink
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const sink = [];
    const external = [];
    await p.route('**/score/api/internal/client-error**', async (route) => {
      sink.push({ url: route.request().url(), body: route.request().postData() });
      await route.fulfill({ status: 204, body: '' });
    });
    p.on('request', (r) => { if (!r.url().startsWith(BASE)) external.push(r.url()); });
    await p.goto(`${BASE}/review/s/${main.links.respondent}`, { waitUntil: 'networkidle' });
    await p.evaluate(() => { setTimeout(() => { throw new TypeError('Synthetic review-page error for the local telemetry sink'); }, 0); });
    await p.waitForTimeout(800);
    await p.goto(`${BASE}/review/s/${main.links.respondent}/snapshot`, { waitUntil: 'networkidle' });
    await p.evaluate(() => { Promise.reject(new Error('Synthetic rejection')); });
    await p.waitForTimeout(800);
    const referrer = await p.getAttribute('meta[name=referrer]', 'content');
    const exitIsDocumentLink = await p.$eval('header a[href="/fraud-readiness"]', (a) => a.tagName === 'A');
    await ctx.close();
    const tokens = Object.values(main.links);
    const leaked = sink.filter((x) => tokens.some((t) => (x.body ?? '').includes(t) || x.url.includes(t)));
    const routes = sink.map((x) => { try { return JSON.parse(x.body).route; } catch { return null; } });
    rec('J-22', 'Client errors on review pages reach the monitoring sink with the route template only; no request leaves the site; review pages send no referrer',
      sink.length >= 2 && leaked.length === 0 && routes.includes('/review/s/:token') && routes.includes('/review/s/:token/snapshot') && external.length === 0 && referrer === 'no-referrer' && exitIsDocumentLink,
      `${sink.length} monitoring posts with routes ${JSON.stringify(routes)}; carrying a role link ${leaked.length}; requests to other hosts ${external.length}; referrer policy ${referrer}`);
  } catch (e) {
    rec('J-22', 'Telemetry sink', false, String(e).slice(0, 300));
  }

  rec('J-19', 'The question uses the approved instrument layout: area rail, question card and context panel at 1280px; a full-width card on a 390px phone',
    !!layoutDesk && layoutDesk.rail?.shown && layoutDesk.context?.shown && layoutDesk.card.w >= 600 && layoutDesk.prompt.w >= 400 && !!layoutPhone && !layoutPhone.rail?.shown && layoutPhone.card.w >= layoutPhone.vw - 64 && layoutPhone.prompt.w >= 260,
    `1280: rail ${layoutDesk?.rail?.w}, card ${layoutDesk?.card?.w}, context ${layoutDesk?.context?.w}, prompt ${layoutDesk?.prompt?.w}; 390: rail shown ${layoutPhone?.rail?.shown}, card ${layoutPhone?.card?.w}, prompt ${layoutPhone?.prompt?.w}`);
  rec('J-18', 'No script errors during the journeys (the 503 and 409 that J-21 provokes on purpose are set aside)', errors.length === 0, `${errors.slice(0, 3).join(' | ')}${expectedHttpErrors.length ? `; set aside ${expectedHttpErrors.length} deliberate responses` : ''}`);
  await browser.close();
  const sum = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const median = (k) => { const xs = timings.filter((t) => t.kind === k).map((t) => t.ms).sort((a, b) => a - b); return xs.length ? { n: xs.length, median: xs[Math.floor(xs.length / 2)], p90: xs[Math.floor(xs.length * 0.9)], max: xs.at(-1) } : null; };
  fs.writeFileSync(path.join(OUT, 'journey-results.json'), JSON.stringify({ base: BASE, summary: sum, results, timing: { answerToNextQuestion: median('answer-to-next-question') } }, null, 1));
  console.log(sum, median('answer-to-next-question'));
})();
