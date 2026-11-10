// Automated accessibility scan (axe-core, WCAG 2.0/2.1/2.2 A and AA rules) of a running build at 1440 and 390px.
// node scripts/readiness-review-axe-scan.cjs <baseUrl> <out.json> <pagesJson> [--states]
// Records every outcome axe reports: violations in full, incomplete results (checks axe could not decide, such as
// contrast over images) in full, and pass and inapplicable counts. With --states it also drives and scans the
// interactive and error states of the review track on fictional sessions it creates itself.
// Automated rules find only part of what a manual audit and screen-reader testing would find; both remain outstanding.
const { chromium } = require('playwright');
const fs = require('fs');

const [BASE, OUT, pagesJson] = process.argv.slice(2);
const PAGES = JSON.parse(pagesJson);
const STATES = process.argv.includes('--states');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    const detail = (list) => list.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')), why: v.nodes.slice(0, 2).map((n) => (n.any[0] || n.all[0] || n.none[0] || {}).message || '') }));
    return { violations: detail(r.violations), incomplete: detail(r.incomplete), passes: r.passes.length, passNodes: r.passes.reduce((n, p) => n + p.nodes.length, 0), inapplicable: r.inapplicable.length };
  }, TAGS);
}

async function settle(page) {
  const decline = await page.$('button:has-text("Decline"), button:has-text("Reject"), button:has-text("Necessary only")');
  if (decline) await decline.click().catch(() => {});
  await page.waitForTimeout(300);
}

async function api(path, body) {
  const res = await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return res.json();
}

/** Interactive and error states, each reached through the page on a fresh fictional session. */
async function stateScans(browser, width, height) {
  const out = [];
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
  const page = await ctx.newPage();
  const record = async (name) => out.push({ name, url: page.url().replace(/\/s\/[^/?#]+/, '/s/:token'), width, state: true, ...(await scan(page)) });
  const s = await api('/review/api/sessions', { organisationLabel: 'Fictional Accessibility Co', fictionalConfirmed: true });
  const links = (await api(`/review/api/s/${s.links}`)).view;

  // Orientation, then a failed save (fault injection), then the optional detail panel.
  await page.goto(`${BASE}/review/s/${s.respondent}?fault=save`, { waitUntil: 'networkidle' });
  await record('interview orientation');
  await page.click('button:has-text("Begin the interview")');
  await page.waitForSelector('[data-question-stage]');
  await record('interview question');
  const first = (await api(`/review/api/s/${s.respondent}`)).view.step;
  await page.click(`[data-question-stage] label:has(input[type=radio][value="${first.choices[0].value}"])`);
  await page.waitForSelector('[data-review-message]');
  await record('interview save failure');
  await page.click('button:has-text("Try saving again")');
  // Answer forward until a question offers the optional detail panel, then until "I don't know" raises the handoff offer.
  let detailSeen = false;
  let handoffSeen = false;
  for (let i = 0; i < 40 && !(detailSeen && handoffSeen); i++) {
    await page.waitForFunction(() => document.querySelector('[data-review-interview]')?.getAttribute('data-transition-phase') === 'idle');
    const step = (await api(`/review/api/s/${s.respondent}`)).view.step;
    if (!step) break;
    if (step.format === 'multi') {
      await page.locator('[data-review-multi] input[type=checkbox]').first().check();
      await page.click('[data-review-multi] button:has-text("Save answer")');
      continue;
    }
    const d = step.detailFor ?? {};
    const detailValues = [...(d.reach ?? []), ...(d.tested ?? []), ...(d.ev ?? [])];
    const practice = !step.q.startsWith('PR-') && step.q !== '__assumptions__';
    let value = step.choices.find((c) => c.value !== 'unknown' && !detailValues.includes(c.value))?.value ?? step.choices[0].value;
    if (practice && !detailSeen && detailValues.length) value = detailValues[0];
    else if (practice && detailSeen && !handoffSeen) value = 'unknown';
    await page.click(`[data-question-stage] label:has(input[type=radio][value="${value}"])`);
    // Wait for the panel or for the save to finish, whichever comes first; never a fixed time.
    await page.waitForFunction((prev) => {
      if (document.querySelector('[data-review-detail]') || document.querySelector('[data-review-complete]') || document.querySelector('[data-review-area-handoff]') || document.querySelector('[data-review-message][role=alert]')) return true;
      const st = document.querySelector('[data-question-stage]');
      return !st || st.getAttribute('data-question-id') !== prev;
    }, step.q, { timeout: 20000, polling: 'raf' });
    if (await page.$('[data-review-detail]')) {
      if (!detailSeen) await record('interview optional detail panel');
      detailSeen = true;
      await page.click('[data-review-detail] button:has-text("Save answer")');
    }
    if (value === 'unknown') {
      await page.waitForSelector('[data-review-area-handoff]', { timeout: 10000 }).catch(() => null);
      if (await page.$('[data-review-area-handoff]')) {
        handoffSeen = true;
        await record('interview area handoff offer');
      }
    }
  }
  await page.click('[data-review-stop] button');
  await record('interview stop confirmation');
  await page.click('button:has-text("Stop the interview")');
  await page.waitForSelector('[data-review-complete]');
  await record('interview completion');

  // Reviewer: a control open with the form, a validation error, a draft with its discard confirmation.
  await page.goto(`${BASE}/review/s/${links.tokens.reviewer}`, { waitUntil: 'networkidle' });
  await page.click('[role=tab]:has-text("All reported answers")');
  const pick = await page.getAttribute('[data-review-pick]', 'data-review-pick');
  await page.click(`[data-review-pick="${pick}"]`);
  await record('reviewer control open');
  await page.fill('[data-review-form] input[name=basis]', 'A basis with no decision');
  await page.click('[data-review-form] button[type=submit]');
  await page.waitForSelector('[data-review-form-error]');
  await record('reviewer validation error and unsaved draft');
  await page.click('[data-review-discard="current"]');
  await record('reviewer discard confirmation');

  // Owner package after sending to owners from the management view.
  await page.goto(`${BASE}/review/s/${links.tokens.management}`, { waitUntil: 'networkidle' });
  const send = await page.$('[data-review-send-owners] button');
  if (send) {
    await send.click();
    await page.waitForSelector('[data-review-packages]', { timeout: 15000 });
    await record('management after sending to owners');
  }
  const fns = (await api(`/review/api/s/${s.links}`)).view.functions;
  for (const f of fns) {
    const v = (await api(`/review/api/s/${f.token}`)).view;
    if (v.step) {
      await page.goto(`${BASE}/review/s/${f.token}`, { waitUntil: 'networkidle' });
      await record('owner package question');
      break;
    }
  }
  await page.goto(`${BASE}/review/s/notarealtokenAAAAAAAAAAAA`);
  await record('unknown link (not found)');
  await ctx.close();
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
    const page = await ctx.newPage();
    for (const [name, url] of Object.entries(PAGES)) {
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await settle(page);
      rows.push({ name, url: url.replace(/\/s\/[^/?#]+/, '/s/:token'), width: w, state: false, ...(await scan(page)) });
    }
    await ctx.close();
    if (STATES) rows.push(...(await stateScans(browser, w, h)));
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify({ base: BASE, axe: require('axe-core/package.json').version, tags: TAGS, rows }, null, 1));
  const total = rows.reduce((s, r) => s + r.violations.length, 0);
  const incomplete = rows.reduce((s, r) => s + r.incomplete.length, 0);
  const ids = [...new Set(rows.flatMap((r) => r.incomplete.map((i) => i.id)))];
  console.log(`${rows.length} scans (${rows.filter((r) => r.state).length} interactive or error states); ${total} rule violations; ${incomplete} incomplete results (${ids.join(', ') || 'none'})`);
  rows.filter((r) => r.violations.length).forEach((r) => console.log('  ', r.name, r.width, r.violations.map((v) => `${v.id}(${v.impact},${v.nodes})`).join(' ')));
  process.exit(total ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
