// B5 restricted end-to-end journey: two contrasting fictional organisations complete the revised (build 1.6)
// assessment through the real pages of a running deployment, then request Essential and Comprehensive through the
// paid-report panel and the existing paid-order route.
//
//   node scripts/b5-restricted-e2e-journey.cjs <baseUrl> <outDir> [orgKey]
//
// Every answer, hand-off, stop, resume, correction, send, owner answer, decline and order goes through page controls.
// The review API is read only to record outcomes, never to change them. Organisations, people and answers are
// fictional. Role links stand in for sign-in in this candidate (B3), so the run's links are written only to
// <outDir>/.secrets/, which git excludes.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const OUT = process.argv[3] || 'qa-output/b5';
const ONLY = process.argv[4] || null;
const EXTRA_HEADERS = process.env.B5_BYPASS_HEADER ? JSON.parse(process.env.B5_BYPASS_HEADER) : {};
// Protected preview: B5_SHARE_URL is a Vercel share link for the deployment. Opening it once sets the access cookie,
// which every later page load and API read then carries. The link itself is never written to the run's outputs.
const SHARE_URL = process.env.B5_SHARE_URL || null;
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
fs.mkdirSync(path.join(OUT, '.secrets'), { recursive: true });
const coverage = require('../src/lib/readiness-review/data/coverage-map-v1.3.json');
const ROLE = coverage.questionRole;
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7);
const api = async (p) => (await fetch(BASE + p, { cache: 'no-store', headers: EXTRA_HEADERS })).json();

// ------------------------------------------------------------------------------------------- answer policies
const pickFirst = (values, prefs) => prefs.find((v) => values.includes(v)) ?? values.find((v) => v !== 'unknown');
const ORGS = {
  A: {
    key: 'A',
    label: 'Fictional Kestrel Freight (Pty) Ltd',
    legalName: 'Kestrel Freight (Pty) Ltd (fictional)',
    contact: { name: 'Thandi Fictional', email: 'b5-kestrel@example.com', role: 'Chief Financial Officer' },
    profile: { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'logistics', 'PR-04': 'owner', 'PR-03': 'no', 'PR-05': 'no', 'PR-07': 'yes', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'yes', 'PR-11': 'yes' },
    describe: 'Substantial control weaknesses: most controls reported absent or informal, several "I don\'t know" answers, one area handed over.',
    control(qid, values) {
      const k = hash(qid) % 10;
      if (k === 3 && values.includes('unknown')) return 'unknown';
      if (values.includes('1')) return k < 6 ? '1' : k < 9 ? '0' : '2';
      if (values.includes('absent')) return k < 6 ? 'absent' : k < 9 ? 'partial' : 'designed';
      if (values.includes('no') && values.includes('yes')) return k < 7 ? 'no' : 'yes';
      return values.find((v) => v !== 'unknown');
    },
    handOffFirstOfferedArea: true,
    sendRestAfterUnknown: false,
    declineInFirstPackage: true,
    unknownInSecondPackage: true
  },
  B: {
    key: 'B',
    label: 'Fictional Marula Retail Holdings',
    legalName: 'Marula Retail Holdings (Pty) Ltd (fictional)',
    contact: { name: 'Pieter Fictional', email: 'b5-marula@example.com', role: 'Group Risk Officer' },
    profile: { 'PR-01': '250to1000', 'PR-12': '250mto1b', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'yes', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'yes', 'PR-10': 'no', 'PR-11': 'yes' },
    describe: 'Apparently strong controls: every core confirmation reported in place, while the supporting practices behind them are reported weak, so the answers are inconsistent.',
    control(qid, values) {
      const role = ROLE[qid]?.role;
      if (role === 'confirm') return pickFirst(values, ['5', '4', 'full', 'yes']);
      const k = hash(qid) % 10;
      if (values.includes('1')) return k < 7 ? '1' : '2';
      if (values.includes('absent')) return k < 7 ? 'absent' : 'designed';
      if (values.includes('no') && values.includes('yes') && role !== 'scope') return k < 6 ? 'no' : 'yes';
      return pickFirst(values, ['yes', 'full']);
    },
    handOffFirstOfferedArea: false,
    sendRestAfterUnknown: false,
    declineInFirstPackage: false,
    unknownInSecondPackage: true
  }
};

function choose(org, qid, values, multi) {
  if (multi) {
    if (qid === '__assumptions__') return values.includes('none') ? ['none'] : [values[0]];
    return values.filter((v) => !['none', 'unknown'].includes(v)).slice(0, org.key === 'A' ? 1 : 2);
  }
  if (qid.startsWith('PR-')) return org.profile[qid] && values.includes(org.profile[qid]) ? org.profile[qid] : values.find((v) => v !== 'unknown');
  return org.control(qid, values);
}

// ------------------------------------------------------------------------------------------- page primitives
async function waitSettled(page, prev) {
  try { await waitSettledInner(page, prev); } catch (error) {
    const state = await page.evaluate(() => ({ q: document.querySelector('[data-question-stage]')?.getAttribute('data-question-id'), detail: !!document.querySelector('[data-review-detail]'), message: document.querySelector('[data-review-message]')?.textContent?.slice(0, 160), phases: [...document.querySelectorAll('[data-transition-phase]')].map((e) => e.getAttribute('data-transition-phase')), buttons: [...document.querySelectorAll('main button')].map((b) => b.textContent.trim()).slice(0, 6) })).catch(() => null);
    throw new Error(`waitSettled after ${prev}: ${JSON.stringify(state)}`);
  }
}
async function waitSettledInner(page, prev) {
  await page.waitForFunction((p) => {
    if (document.querySelector('[data-review-complete]') || document.querySelector('[data-review-owner-done]')) return true;
    if (document.querySelector('[data-review-message][role=alert]')) return true;
    const s = document.querySelector('[data-question-stage]');
    const root = document.querySelector('[data-review-interview]') || document.querySelector('[data-review-owner]');
    const idle = !root || !root.hasAttribute('data-transition-phase') || root.getAttribute('data-transition-phase') === 'idle';
    return s && s.getAttribute('data-question-id') !== p && idle;
  }, prev, { timeout: 30000, polling: 'raf' });
}

async function current(page) {
  if (await page.$('[data-review-complete]') || await page.$('[data-review-owner-done]')) return null;
  const stage = await page.waitForSelector('[data-question-stage]', { timeout: 30000 });
  const qid = await stage.getAttribute('data-question-id');
  const multi = Boolean(await page.$('[data-review-multi]'));
  const values = multi ? null : await page.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => e.value));
  return { qid, multi, values };
}

async function answerOnce(page, token, decide) {
  const q = await current(page);
  if (!q) return null;
  if (q.multi) {
    const view = await api(`/review/api/s/${token}`);
    const choices = view.view.step.choices.map((c) => c.value);
    const wanted = decide(q.qid, choices, true);
    const boxes = await page.$$('[data-review-multi] input[type=checkbox]');
    for (let i = 0; i < choices.length; i++) if (wanted.includes(choices[i])) await boxes[i].check();
    await page.click('[data-review-multi] button:has-text("Save answer")');
    q.value = wanted;
  } else {
    const v = decide(q.qid, q.values, false);
    await page.click(`[data-question-stage] label:has(input[type=radio][value="${v}"])`);
    await page.waitForFunction((prev) => {
      if (document.querySelector('[data-review-detail]') || document.querySelector('[data-review-complete]') || document.querySelector('[data-review-owner-done]')) return true;
      if (document.querySelector('[data-review-message][role=alert]')) return true;
      const s = document.querySelector('[data-question-stage]');
      return s && s.getAttribute('data-question-id') !== prev;
    }, q.qid, { timeout: 30000, polling: 'raf' });
    if (await page.$('[data-review-detail]')) await page.click('[data-review-detail] button:has-text("Save answer")');
    q.value = v;
  }
  await waitSettled(page, q.qid);
  const alert = await page.$('[data-review-message][role=alert]');
  if (alert) q.alert = (await alert.textContent()).trim().slice(0, 200);
  return q;
}

const log = [];
const note = (org, step, ok, detail) => {
  log.push({ org, step, ok, detail });
  console.log(`${org} ${ok ? 'ok  ' : 'FAIL'} ${step}${detail ? ` | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};

// ------------------------------------------------------------------------------------------- the journey
async function runOrg(browser, org) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: EXTRA_HEADERS });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));
  const shot = (name) => page.screenshot({ path: path.join(OUT, 'shots', `${org.key}-${name}.png`), fullPage: true }).catch(() => {});
  const result = { org: org.key, label: org.label, describe: org.describe, answers: [], events: [] };

  const resumeFile = path.join(OUT, '.secrets', `${org.key}-links.json`);
  let linksToken; let links;
  const resuming = process.env.B5_RESUME === '1' && fs.existsSync(resumeFile);
  if (resuming) {
    ({ linksToken, links } = JSON.parse(fs.readFileSync(resumeFile, 'utf8')));
    note(org.key, 'resumed the existing session at its function packages', true);
  } else {
  // Start through the start form.
  await page.goto(`${BASE}/review`, { waitUntil: 'networkidle' });
  await page.fill('#review-org', org.label);
  await page.check('[data-review-start-form] input[type=checkbox]');
  await Promise.all([page.waitForURL(/\/review\/s\/[A-Za-z0-9_-]+$/, { timeout: 60000 }), page.click('[data-review-start-form] button[type=submit]')]);
  linksToken = page.url().split('/').pop();
  links = await page.$$eval('[data-link] a', (as) => Object.fromEntries(as.map((a) => [a.closest('[data-link]').getAttribute('data-link'), a.getAttribute('href').split('/').pop()])));
  fs.writeFileSync(path.join(OUT, '.secrets', `${org.key}-links.json`), JSON.stringify({ linksToken, links }, null, 1));
  const R0 = links.respondent;
  note(org.key, 'session created through /review', Boolean(R0), `links page with ${Object.keys(links).length} role links`);

  const R = R0;
  await page.goto(`${BASE}/review/s/${R}`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Begin the interview")');
  const decide = (qid, values, multi) => choose(org, qid, values, multi);

  let handedOff = false; let stoppedOnce = false; let sentRest = false;
  for (let i = 0; i < 400; i++) {
    // Area hand-off at area entry (build 1.6), once, through the page control.
    if (org.handOffFirstOfferedArea && !handedOff && await page.$('[data-review-area-delegate] button')) {
      const label = (await page.textContent('[data-review-area-delegate] button')).trim();
      const before = await current(page);
      await page.click('[data-review-area-delegate] button');
      await waitSettled(page, before?.qid ?? null);
      handedOff = true;
      result.events.push({ at: i, event: 'area-handoff', label });
      note(org.key, 'area handed to its accountable function at area entry', true, label);
      continue;
    }
    if (org.sendRestAfterUnknown && !sentRest && await page.$('[data-review-area-handoff] button')) {
      await page.click('[data-review-area-handoff] button');
      sentRest = true;
      result.events.push({ at: i, event: 'send-rest-after-unknown' });
    }
    // Save and resume: stop part-way, reload from the link, resume.
    if (!stoppedOnce && result.answers.length === 20) {
      await page.click('[data-review-stop] button:has-text("Stop here and view the Snapshot")');
      await page.click('[data-review-stop] button:has-text("Stop the interview")');
      await page.waitForSelector('[data-review-complete]', { timeout: 30000 });
      await shot('stopped');
      const statusAtStop = (await api(`/review/api/s/${R}/snapshot`)).view.status;
      await page.goto(`${BASE}/review/s/${R}`, { waitUntil: 'networkidle' });
      await page.click('button:has-text("Resume the interview")');
      await page.waitForSelector('[data-question-stage]', { timeout: 30000 });
      stoppedOnce = true;
      result.events.push({ at: i, event: 'stop-and-resume', interviewAtStop: statusAtStop.interview, answersAtStop: result.answers.length });
      note(org.key, 'stopped after 20 answers, reopened from the link and resumed', statusAtStop.interview !== 'running', `interview at stop: ${statusAtStop.interview}`);
      continue;
    }
    const q = await answerOnce(page, R, decide);
    if (!q) break;
    result.answers.push({ q: q.qid, v: q.value, multi: q.multi });
    if (q.alert) { note(org.key, `page alert at ${q.qid}`, false, q.alert); break; }
  }
  await page.waitForSelector('[data-review-complete]', { timeout: 30000 });
  await shot('interview-complete');
  note(org.key, 'interview completed through the page', true, `${result.answers.length} answers`);

  // Correction: change a profile answer through "Review or change an answer".
  {
    await page.click('[data-review-answers] summary');
    const target = await page.$$eval('[data-review-change]', (els) => els.map((e) => e.getAttribute('data-review-change')).filter((q) => q === 'PR-08' || q === 'PR-10' || q === 'PR-07'));
    if (target.length) {
      const qid = target[0];
      await page.click(`[data-review-change="${qid}"]`);
      await page.waitForSelector(`[data-question-stage][data-question-id="${qid}"]`);
      const values = await page.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => e.value));
      const was = result.answers.find((a) => a.q === qid)?.v;
      const now = values.find((v) => v !== was && v !== 'unknown');
      await page.click(`[data-question-stage] label:has(input[type=radio][value="${now}"])`);
      await page.waitForTimeout(500);
      if (await page.$('[data-review-detail]')) await page.click('[data-review-detail] button:has-text("Save answer")');
      await page.waitForFunction(() => document.querySelector('[data-review-complete]') || (document.querySelector('[data-question-stage]') && !document.querySelector('[data-review-back]')), null, { timeout: 30000 });
      result.events.push({ event: 'correction', q: qid, from: was, to: now });
      note(org.key, 'answer corrected through "Review or change an answer"', true, `${qid}: ${was} -> ${now}`);
      // A correction can reopen the interview for questions it brings into scope.
      for (let i = 0; i < 120; i++) {
        const q = await answerOnce(page, R, decide);
        if (!q) break;
        result.answers.push({ q: q.qid, v: q.value, multi: q.multi, afterCorrection: true });
      }
      await page.waitForSelector('[data-review-complete]', { timeout: 30000 });
    } else {
      note(org.key, 'no profile answer offered for correction', false);
    }
  }

  }
  const R = links.respondent;
  const decide = (qid, values, multi) => choose(org, qid, values, multi);

  // Snapshot: send the open questions to their accountable functions, then answer each package on its own page.
  // Build 1.6 places "I don't know" answers and handed-over areas in their functions' packages at once; the Snapshot
  // offers a further send only after the core stage completes. Each round: send if offered, then work through every
  // function package that has questions waiting, until a round answers nothing.
  for (let round = 1; round <= 4; round++) {
    await page.goto(`${BASE}/review/s/${R}/snapshot`, { waitUntil: 'networkidle' });
    const sendCandidate = await page.$('[data-review-staged-send] button, [data-review-send-owners] button');
    const send = sendCandidate && await sendCandidate.isEnabled() ? sendCandidate : null;
    if (send) {
      await send.click();
      await page.waitForSelector('[data-review-packages]', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(800);
      result.events.push({ event: 'sent-to-owners', round });
      note(org.key, `Snapshot send to accountable functions (round ${round})`, true);
    }
    const answersBefore = result.answers.length + result.events.length;
    const linksView = await api(`/review/api/s/${linksToken}`);
    let pkgIndex = 0;
    for (const f of linksView.view.functions) {
      const ov = await api(`/review/api/s/${f.token}`);
      if (!ov?.view?.items?.length && !ov?.view?.step) continue;
      await page.goto(`${BASE}/review/s/${f.token}`, { waitUntil: 'networkidle' });
      pkgIndex += 1;
      let declined = false; let unknownGiven = false; let answered = 0;
      for (let i = 0; i < 120; i++) {
        if (await page.$('[data-review-owner-done]')) break;
        const stage = await page.$('[data-question-stage]');
        if (!stage) break;
        const qid = await stage.getAttribute('data-question-id');
        if (org.declineInFirstPackage && pkgIndex === 1 && round === 1 && !declined && await page.$('[data-review-decline] button')) {
          await page.click('[data-review-decline] button');
          await page.fill('#decline-reason', 'Fictional: this control is run by the operations team, not by this function.');
          await page.click('[data-review-decline] button:has-text("Decline this question")');
          await waitSettled(page, qid);
          declined = true;
          result.events.push({ event: 'owner-decline', fn: f.fn, q: qid });
          note(org.key, `${f.fn} declined a question with a reason`, true, qid);
          continue;
        }
        const ownerDecide = (id, values, multi) => {
          if (!multi && org.unknownInSecondPackage && pkgIndex === 2 && !unknownGiven && values.includes('unknown')) { unknownGiven = true; result.events.push({ event: 'owner-unknown', fn: f.fn, q: id }); return 'unknown'; }
          return decide(id, values, multi);
        };
        const q = await answerOnce(page, f.token, ownerDecide);
        if (!q) break;
        answered += 1;
        result.answers.push({ q: q.qid, v: q.value, multi: q.multi, fn: f.fn });
        if (q.alert) { note(org.key, `owner page alert at ${q.qid}`, false, q.alert); break; }
      }
      if (answered || declined) note(org.key, `${f.fn} package answered on its own page (round ${round})`, true, `${answered} answers${declined ? ', 1 declined' : ''}${unknownGiven ? ', 1 "I don\'t know"' : ''}`);
    }
    if (result.answers.length + result.events.length === answersBefore && !send) break;
  }

  // Final Snapshot and the paid-report panel.
  await page.goto(`${BASE}/review/s/${R}/snapshot`, { waitUntil: 'networkidle' });
  await shot('snapshot-final');
  const snap = await api(`/review/api/s/${R}/snapshot`);
  result.snapshot = { status: snap.view.status, counts: snap.view.counts?.map((c) => [c.key, c.value]) };
  const snapText = await page.textContent('[data-review-snapshot]');
  note(org.key, 'Snapshot shows no score, rating or maturity level', !/readiness score of|maturity level|\b\d{1,3}\s*\/\s*100\b/i.test(snapText));

  const panel = await page.$('[data-revised-paid-report]');
  note(org.key, 'paid-report panel shown with restricted-test notice', Boolean(panel));
  if (!panel) return { result, consoleErrors };
  await page.fill('[data-revised-paid-report] input[name=organisationLegalName]', org.legalName);
  await page.fill('[data-revised-paid-report] input[name=contactName]', org.contact.name);
  await page.fill('[data-revised-paid-report] input[name=contactEmail]', org.contact.email);
  await page.fill('[data-revised-paid-report] input[name=contactRole]', org.contact.role);
  await page.check('[data-revised-paid-report] input[name=acceptTerms]');
  await page.click('[data-submit-answers]');
  await page.waitForSelector('[data-bound-assessment], [data-panel-error]', { timeout: 60000 });
  const err = await page.$('[data-panel-error]');
  if (err) { note(org.key, 'answers submitted for a paid report', false, (await err.textContent()).trim()); return { result, consoleErrors }; }
  result.assessmentReference = await page.getAttribute('[data-bound-assessment]', 'data-bound-assessment');
  note(org.key, 'answers submitted and bound to an assessment record', true, result.assessmentReference);
  result.orders = {};
  for (const tier of ['essential', 'comprehensive']) {
    await page.click(`[data-order-tier="${tier}"]`);
    await page.waitForFunction((t) => document.querySelectorAll('[data-order-reference]').length >= (t === 'essential' ? 1 : 2) || document.querySelector('[data-panel-error]'), tier, { timeout: 60000 });
    const refs = await page.$$eval('[data-order-reference]', (els) => els.map((e) => ({ ref: e.getAttribute('data-order-reference'), text: e.textContent, href: e.querySelector('a')?.getAttribute('href') })));
    const mine = refs.find((r) => new RegExp(tier === 'essential' ? 'Essential' : 'Comprehensive', 'i').test(r.text));
    if (mine) result.orders[tier] = { orderReference: mine.ref, text: mine.text.replace(/\s+/g, ' ').trim() };
    note(org.key, `${tier} order placed through the existing paid-order route`, Boolean(mine), mine?.text?.replace(/\s+/g, ' ').trim());
    if (mine?.href) fs.writeFileSync(path.join(OUT, '.secrets', `${org.key}-${tier}-order-url.txt`), BASE + mine.href);
  }
  await shot('orders-placed');
  result.consoleErrors = consoleErrors;
  await ctx.close();
  return { result, consoleErrors };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  if (SHARE_URL) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(SHARE_URL, { waitUntil: 'domcontentloaded' });
    const cookies = await ctx.cookies(BASE);
    if (!cookies.length) throw new Error('The share link set no access cookie.');
    EXTRA_HEADERS.Cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    await ctx.close();
    console.log(`access cookie set for ${new URL(BASE).host} (${cookies.map((c) => c.name).join(', ')})`);
  }
  const outcomes = {};
  for (const key of Object.keys(ORGS)) {
    if (ONLY && key !== ONLY) continue;
    try {
      outcomes[key] = (await runOrg(browser, ORGS[key])).result;
    } catch (error) {
      note(key, 'journey aborted', false, String(error).slice(0, 400));
    }
  }
  await browser.close();
  const safe = JSON.parse(JSON.stringify({ base: BASE.replace(/\/\/[^/]+/, '//<host>'), at: new Date().toISOString(), outcomes, log }));
  fs.writeFileSync(path.join(OUT, `journey-${ONLY ?? 'all'}.json`), JSON.stringify(safe, null, 1));
  const failed = log.filter((l) => !l.ok);
  console.log(`\n${log.length - failed.length} ok, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
