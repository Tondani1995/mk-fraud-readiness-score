// Paced screen recordings of the review track for human review (not a test; the journeys script is the test).
// node scripts/readiness-review-record.cjs <candidateUrl> <outDir> [baselineUrl]
// Produces webm files named by journey. All organisations and answers are fictional; the candidate must run the
// fictional local harness (MK_READINESS_REVIEW_HARNESS=fictional-local, faults enabled for the mobile recording).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const [BASE, OUT, BASELINE] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const pause = (p, ms) => p.waitForTimeout(ms);

async function call(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} ${res.status} ${json.message}`);
  return json;
}
async function newSession(label) {
  const s = await call('POST', '/review/api/sessions', { organisationLabel: label, fictionalConfirmed: true });
  const links = (await call('GET', `/review/api/s/${s.links}`)).view;
  return { links: s.links, respondent: links.tokens.respondent, management: links.tokens.management, reviewer: links.tokens.reviewer, owners: Object.fromEntries(links.functions.map((f) => [f.fn, f.token])) };
}
async function act(token, action) {
  const v = (await call('GET', `/review/api/s/${token}`)).view;
  return (await call('POST', `/review/api/s/${token}`, { actionId: randomUUID(), expectedSeq: v.seq, action })).current.view;
}
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'unknown', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };

async function slowScroll(p, step = 260, wait = 260) {
  const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let y = 0; y < max; y += step) {
    await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
    await pause(p, wait);
  }
  await pause(p, 700);
}
async function settleCookies(p) {
  const decline = await p.$('button:has-text("Decline"), button:has-text("Reject"), button:has-text("Necessary only")');
  if (decline) await decline.click().catch(() => {});
}

/** Answers the question on screen the way a person would. `mode` picks unknown, a detail-panel value or a plain value. */
async function answerOnPage(p, token, mode = 'plain') {
  const view = (await call('GET', `/review/api/s/${token}`)).view;
  if (!view.step) return null;
  const step = view.step;
  const prev = step.q;
  await pause(p, 900);
  if (step.format === 'multi') {
    await p.locator('[data-review-multi] input[type=checkbox]').first().check();
    await pause(p, 400);
    await p.click('[data-review-multi] button:has-text("Save answer")');
  } else {
    const d = step.detailFor ?? {};
    const detail = new Set([...(d.reach ?? []), ...(d.tested ?? []), ...(d.ev ?? [])]);
    const values = step.choices.map((c) => c.value);
    let v;
    if (step.q.startsWith('PR-')) v = PROFILE[step.q] && values.includes(PROFILE[step.q]) ? PROFILE[step.q] : values.find((x) => x !== 'unknown');
    else if (mode === 'unknown') v = 'unknown';
    else if (mode === 'detail') v = values.find((x) => detail.has(x)) ?? values[0];
    else v = values.find((x) => !detail.has(x) && x !== 'unknown') ?? values[0];
    await p.click(`[data-question-stage] label:has(input[type=radio][value="${v}"])`);
    if (await p.waitForSelector('[data-review-detail]', { timeout: 500 }).catch(() => null)) {
      await pause(p, 1400);
      await p.click('[data-review-detail] button:has-text("Save answer")');
    }
  }
  await p.waitForFunction((prev) => {
    const root = document.querySelector('[data-review-interview]');
    const s = document.querySelector('[data-question-stage]');
    return document.querySelector('[data-review-complete]') || document.querySelector('[data-review-message][role=alert]') || (s && s.getAttribute('data-question-id') !== prev && root?.getAttribute('data-transition-phase') === 'idle');
  }, prev, { timeout: 20000 });
  return step;
}

/**
 * Records one clip. A walkthrough error fails the clip: its video is kept for diagnosis, its record says it failed and
 * at which step, and the script exits non-zero. Each clip writes <name>.json with its provenance and completed steps.
 */
async function record(browser, name, viewport, fn, extra = {}) {
  const startedAt = new Date().toISOString();
  const steps = [];
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: OUT, size: viewport }, ...extra });
  const p = await ctx.newPage();
  p.step = (label) => steps.push({ at: new Date().toISOString(), label });
  let error = null;
  try {
    await fn(p);
  } catch (e) {
    error = String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
    console.error('FAILED', name, error);
    process.exitCode = 1;
  }
  const video = p.video();
  await p.close();
  await ctx.close();
  await video.saveAs(path.join(OUT, `${name}.webm`));
  await video.delete();
  const endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ name, status: error ? 'failed' : 'complete', error, base: BASE, viewport, sourceCommit: process.env.MK_SOURCE_COMMIT || null, startedAt, endedAt, durationMs: Date.parse(endedAt) - Date.parse(startedAt), steps }, null, 1));
  console.log(error ? 'recorded with failure' : 'recorded', name, `${steps.length} steps`);
}

(async () => {
  const browser = await chromium.launch();

  if (BASELINE) {
    await record(browser, 'before-site-and-assessment-1440', { width: 1440, height: 900 }, async (p) => {
      for (const url of ['/', '/fraud-readiness', '/score/start', '/score/visual-review/adaptive/mid', '/score/visual-review/calculated/mixed-controls']) {
        const r = await p.goto(BASELINE + url, { waitUntil: 'networkidle' });
        if (!r || r.status() !== 200) throw new Error(`${url} returned ${r && r.status()}`);
        p.step(`${url} loaded`);
        await settleCookies(p);
        await pause(p, 1200);
        await slowScroll(p, 300, 220);
      }
    });
  }

  await record(browser, 'after-site-1440', { width: 1440, height: 900 }, async (p) => {
    for (const url of ['/', '/fraud-readiness', '/review']) {
      const r = await p.goto(BASE + url, { waitUntil: 'networkidle' });
      if (!r || r.status() !== 200) throw new Error(`${url} returned ${r && r.status()}`);
      p.step(`${url} loaded`);
      await settleCookies(p);
      await pause(p, 1200);
      await slowScroll(p, 300, 220);
    }
  });

  // Respondent on a desktop: orientation, answers with the approved transition, an optional detail panel,
  // "I don't know" with the offer to send the rest of an area, Back and a correction, stop, and the Snapshot.
  await record(browser, 'after-respondent-1440', { width: 1440, height: 900 }, async (p) => {
    const s = await newSession('Fictional Retail Group');
    await p.goto(`${BASE}/review/s/${s.respondent}`, { waitUntil: 'networkidle' });
    await pause(p, 2500);
    await slowScroll(p, 200, 300);
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    p.step('orientation shown');
    await p.click('button:has-text("Begin the interview")');
    p.step('interview begun');
    let practice = 0;
    for (let i = 0; i < 40; i++) {
      const view = (await call('GET', `/review/api/s/${s.respondent}`)).view;
      if (!view.step) break;
      const isPractice = !view.step.q.startsWith('PR-') && view.step.q !== '__assumptions__' && view.step.format !== 'multi';
      if (isPractice) practice++;
      const mode = isPractice && practice === 2 ? 'detail' : isPractice && practice === 5 ? 'unknown' : 'plain';
      await answerOnPage(p, s.respondent, mode);
      if (mode === 'unknown') {
        await p.waitForSelector('[data-review-area-handoff]', { timeout: 10000 });
        p.step('"I don\'t know" answered; area handoff offer shown');
        await pause(p, 3500);
        break;
      }
    }
    await answerOnPage(p, s.respondent);
    await answerOnPage(p, s.respondent);
    await pause(p, 800);
    await p.click('button:has-text("← Back")');
    await pause(p, 2200);
    const radios = await p.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => ({ v: e.value, c: e.checked })));
    const change = radios.find((r) => !r.c && r.v !== 'unknown')?.v;
    if (change) {
      await p.click(`[data-question-stage] label:has(input[type=radio][value="${change}"])`);
      if (await p.waitForSelector('[data-review-detail]', { timeout: 500 }).catch(() => null)) await p.click('[data-review-detail] button:has-text("Save answer")');
      await p.waitForSelector('[data-review-message]:has-text("Your change is saved")');
      p.step('earlier answer changed through Back');
      await pause(p, 2500);
    }
    await p.click('[data-review-stop] button');
    await pause(p, 1500);
    await p.click('button:has-text("Stop the interview")');
    await p.waitForSelector('[data-review-complete]');
    p.step('interview stopped');
    await pause(p, 2500);
    await p.click('a:has-text("Open the Snapshot")');
    await p.waitForSelector('[data-review-snapshot]');
    p.step('Snapshot opened');
    await pause(p, 1500);
    await slowScroll(p, 240, 320);
  });

  // Respondent on a phone: a failed save is explained and retried without losing the choice.
  await record(browser, 'after-respondent-save-failure-390', { width: 390, height: 844 }, async (p) => {
    const s = await newSession('Fictional Logistics Co');
    await p.goto(`${BASE}/review/s/${s.respondent}?fault=save`, { waitUntil: 'networkidle' });
    await pause(p, 1800);
    await p.click('button:has-text("Begin the interview")');
    await pause(p, 1200);
    const view = (await call('GET', `/review/api/s/${s.respondent}`)).view;
    const v = PROFILE[view.step.q] ?? view.step.choices[0].value;
    await p.click(`[data-question-stage] label:has(input[type=radio][value="${v}"])`);
    await p.waitForSelector('[data-review-message]');
    p.step('save failure explained');
    await pause(p, 3500);
    await p.click('button:has-text("Try saving again")');
    p.step('retry sent');
    for (let i = 0; i < 6; i++) await answerOnPage(p, s.respondent);
    p.step('six further answers saved');
    await pause(p, 1500);
  }, { isMobile: true, hasTouch: true });

  // Management, an accountable owner and the MK reviewer on one fictional session that has finished its interview.
  await record(browser, 'after-management-owner-reviewer-1440', { width: 1440, height: 900 }, async (p) => {
    const s = await newSession('Fictional Retail Group');
    let view = (await call('GET', `/review/api/s/${s.respondent}`)).view;
    let n = 0;
    while (view.step && n++ < 200) {
      const step = view.step;
      const values = step.choices.map((c) => c.value);
      const k = [...step.q].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7) % 7;
      let value;
      if (step.q.startsWith('PR-')) value = PROFILE[step.q] && values.includes(PROFILE[step.q]) ? PROFILE[step.q] : values.find((x) => x !== 'unknown');
      else if (step.format === 'multi') value = step.q === '__assumptions__' && values.includes('none') ? ['none'] : [values.find((x) => !['none', 'unknown'].includes(x)) ?? values[0]];
      else if (k === 3) value = 'unknown';
      else if (values.includes('4')) value = ['4', '2', '0', null, '5', '4', '4'][k];
      else if (values.includes('full')) value = ['full', 'partial', 'absent', null, 'full', 'full', 'full'][k];
      else value = values.includes('yes') ? 'yes' : values.find((x) => x !== 'unknown');
      view = await act(s.respondent, { type: 'respondent.answer', q: step.q, value });
    }
    await p.goto(`${BASE}/review/s/${s.management}`, { waitUntil: 'networkidle' });
    await pause(p, 2000);
    await slowScroll(p, 300, 260);
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const send = await p.$('[data-review-send-owners] button');
    if (send) {
      await send.scrollIntoViewIfNeeded();
      await pause(p, 1000);
      await send.click();
      await p.waitForSelector('[data-review-packages]', { timeout: 15000 });
      p.step('sent to owners');
      await pause(p, 2000);
    }
    const linksView = (await call('GET', `/review/api/s/${s.links}`)).view;
    let ownerToken = null;
    for (const f of linksView.functions) {
      const v = (await call('GET', `/review/api/s/${f.token}`)).view;
      if (v.items.some((i) => i.id === 'PR-06')) ownerToken = f.token;
    }
    if (!ownerToken) throw new Error('No owner package held PR-06');
    if (ownerToken) {
      await p.goto(`${BASE}/review/s/${ownerToken}`, { waitUntil: 'networkidle' });
      await pause(p, 2500);
      for (let i = 0; i < 3; i++) {
        const stage = await p.$('[data-question-stage]');
        if (!stage) break;
        const qid = await stage.getAttribute('data-question-id');
        if (await p.$('[data-review-multi]')) {
          await p.locator('[data-review-multi] input[type=checkbox]').first().check();
          await pause(p, 500);
          await p.click('[data-review-multi] button:has-text("Save answer")');
        } else {
          const values = await p.$$eval('[data-question-stage] input[type=radio]', (els) => els.map((e) => e.value));
          await pause(p, 1200);
          await p.click(`[data-question-stage] label:has(input[type=radio][value="${qid === 'PR-06' ? 'yes' : values.find((v) => v !== 'unknown')}"])`);
          if (await p.waitForSelector('[data-review-detail]', { timeout: 500 }).catch(() => null)) await p.click('[data-review-detail] button:has-text("Save answer")');
        }
        await p.waitForFunction((prev) => { const s = document.querySelector('[data-question-stage]'); return !s || s.getAttribute('data-question-id') !== prev; }, qid, { timeout: 20000 });
        await pause(p, 1500);
      }
    }
    p.step('owner answered three questions');
    await p.goto(`${BASE}/review/s/${s.reviewer}`, { waitUntil: 'networkidle' });
    await pause(p, 2000);
    await p.click('[role=tab]:has-text("Evidence to review")');
    await pause(p, 1200);
    const pick = await p.getAttribute('[data-review-pick]', 'data-review-pick');
    await p.click(`[data-review-pick="${pick}"]`);
    await pause(p, 1800);
    await p.locator('[data-review-form]').scrollIntoViewIfNeeded();
    await p.selectOption('[data-review-form] select[name=ev]', 'reviewed-sufficient');
    await pause(p, 600);
    await p.fill('[data-review-form] input[name=evbasis]', 'Fictional sample of three months of supplier changes');
    await pause(p, 600);
    await p.selectOption('[data-review-form] select[name=con]', 'confirmed');
    await pause(p, 600);
    await p.fill('[data-review-form] input[name=basis]', 'Sample showed independent call-back on every change');
    await pause(p, 600);
    await p.fill('[data-review-form] input[name=fu]', 'Obtain the branch sample');
    await pause(p, 800);
    await p.click('[data-review-form] button[type=submit]');
    await p.waitForSelector('[data-review-form] [role=status]');
    p.step('reviewer evidence, conclusion and follow-up saved');
    await pause(p, 2500);
    await p.click('[role=tab]:has-text("Follow-ups")');
    await pause(p, 2000);
    await p.goto(`${BASE}/review/s/${s.management}`, { waitUntil: 'networkidle' });
    await pause(p, 1500);
    await slowScroll(p, 300, 280);
  });

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
