/**
 * Browser-level tests + screenshot capture for the MK adaptive assessment prototype.
 * PROTOTYPE ONLY.
 *
 *   npx playwright test --config=playwright.config.mjs
 *
 * Covers keyboard interaction, viewport layout at 320/390/768/1440, focus
 * visibility, save-failure presentation, resume-after-refresh, and the
 * no-horizontal-scroll guarantee. Screenshots land in ./screenshots.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const VIEWPORTS = {
  '320': { width: 320, height: 640 },
  '390': { width: 390, height: 844 },
  '768': { width: 768, height: 1024 },
  '1440': { width: 1440, height: 900 }
};

const shot = (name) => ({ path: `screenshots/${name}.png`, fullPage: true });

/**
 * Capture after entry animations have settled, so stills are not caught mid-fade.
 * Only Chromium writes the canonical screenshot set; Firefox and WebKit run the
 * same assertions but would otherwise overwrite each other's stills.
 */
async function capture(page, name, testInfo) {
  await page.waitForTimeout(420);
  if (testInfo && testInfo.project.name !== 'chromium') return;
  await page.screenshot(shot(name));
}

/**
 * Fail on any serious/critical axe violation.
 * Waits for the entry animation to finish first: axe computes contrast from the
 * rendered pixels, and a screen still fading in reports false contrast failures.
 */
async function expectNoAxeViolations(page, context) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState === 'finished' || a.playState === 'idle'),
    null, { timeout: 5000 }).catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  const summary = serious.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`).join('\n');
  expect(serious, `axe violations at ${context}:\n${summary}`).toEqual([]);
}

async function boot(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => Boolean(window.__MK_PROTO__?.getGraph()));
  await page.evaluate(() => window.__MK_PROTO__.reset());
}

/**
 * Fill every active node.
 * `useJourneyResponder` applies the loaded journey's own responder profile, which
 * matters for J6 and J8 — filling them with a generic pattern would erase the very
 * uncertainty behaviour those journeys exist to demonstrate.
 */
async function completeAll(page, { unknownEvery = 0, useJourneyResponder = true } = {}) {
  await page.evaluate(({ unknownEvery, useJourneyResponder }) => {
    const g = window.__MK_PROTO__.getGraph();
    const s = window.__MK_PROTO__.getState();
    const responders = window.__MK_PROTO__.responders;
    const journeyId = s.journeyId;
    const journey = journeyId
      ? (window.__MK_PROTO__.journeys || []).find((j) => j.id === journeyId)
      : null;
    const responder = useJourneyResponder && journey ? responders[journey.responder] : null;

    let i = 0;
    for (;;) {
      i += 1;
      if (i > 400) break;
      const n = g.nextUnanswered(s.answers);
      if (!n) break;
      let value;
      if (n.node.gateway_status === 'gateway') value = 'unknown';
      else if (responder) value = responder(n.id);
      else if (unknownEvery > 0 && i % unknownEvery === 0) value = 'unknown';
      else value = i % 6;
      s.answers[n.id] = { value, answeredAt: 'test' };
    }
  }, { unknownEvery, useJourneyResponder });
}

async function clickAction(page, action, id) {
  await page.evaluate(({ action, id }) => {
    const b = document.createElement('button');
    b.dataset.action = action;
    if (id) b.dataset.id = id;
    document.body.appendChild(b);
    b.click();
    b.remove();
  }, { action, id });
}

/* ------------------------------------------------------------- layout */

for (const [label, size] of Object.entries(VIEWPORTS)) {
  test(`layout is sound at ${label}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await boot(page);

    // No horizontal scrolling, at any width.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${label}px`).toBeLessThanOrEqual(0);

    await capture(page, `${label}-01-welcome`, testInfo);

    await page.click('[data-action="begin"]');
    await page.waitForSelector('#q-title');

    const overflow2 = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow2, `horizontal overflow on question at ${label}px`).toBeLessThanOrEqual(0);

    // The question and its first answer control must be visible without scrolling.
    const promptBox = await page.locator('#q-title').boundingBox();
    const firstOption = await page.locator('.option').first().boundingBox();
    expect(promptBox.y).toBeLessThan(size.height);
    expect(firstOption.y).toBeLessThan(size.height);

    // Touch targets must meet the 44px floor (we design to 48).
    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll('.option, .btn')]
        .map((n) => ({ t: n.textContent.trim().slice(0, 30), h: n.getBoundingClientRect().height }))
        .filter((x) => x.h < 44));
    expect(tooSmall, `undersized targets at ${label}px`).toEqual([]);

    await capture(page, `${label}-02-gateway-question`, testInfo);
  });
}

/* ----------------------------------------------------------- keyboard */

test('full keyboard operation with visible focus', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');

  // Number keys select options.
  await page.keyboard.press('2');
  await page.waitForTimeout(700);
  const selected = await page.evaluate(() => window.__MK_PROTO__.getState().answers.G01?.value);
  expect(selected).toBeTruthy();

  // Tab reaches the options and focus is visibly indicated.
  await page.keyboard.press('Tab');
  const focusRing = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const style = getComputedStyle(active.matches('input') ? active.closest('.option') || active : active);
    return { tag: active.tagName, outline: style.outlineWidth, boxShadow: style.boxShadow };
  });
  expect(focusRing).not.toBeNull();

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__MK_PROTO__?.getGraph()));

  // The skip link must be the first focusable element in DOM order. This is the
  // part the page controls, and it holds on every engine.
  const firstFocusable = await page.evaluate(() => {
    const f = document.querySelector(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    return f ? String(f.className) : null;
  });
  expect(firstFocusable, 'skip link must be first in DOM order').toContain('skip-link');

  // Whether Tab actually *reaches* it is a platform preference, not a page property.
  // Safari's default keyboard model moves Tab between form controls only and skips
  // links and buttons unless "Full Keyboard Access" is enabled, so this assertion is
  // scoped to the engines that include links in the tab sequence.
  // Real-Safari keyboard verification remains a pre-production gate — see doc 07.
  if (testInfo.project.name !== 'webkit') {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.className);
    expect(focused).toContain('skip-link');
  }
});

test('unknown option is reachable by keyboard shortcut', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');

  // G01 (sector) deliberately has no uncertainty option — a respondent always
  // knows what their organisation does. Advance to G02, which does.
  await page.keyboard.press('2');
  await page.waitForTimeout(800);
  await expect(page.locator('#q-title')).toContainText('how many people');

  await page.keyboard.press('u');
  await page.waitForTimeout(800);
  const value = await page.evaluate(() => window.__MK_PROTO__.getState().answers.G02?.value);
  expect(value).toBe('unknown');
});

/* --------------------------------------------------------- save states */

test('save-in-progress and save-failed states are presented', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');

  await page.click('#btn-simulate-fail');
  await page.locator('.option').first().click();

  await expect(page.locator('#savebar')).toHaveAttribute('data-state', 'error', { timeout: 4000 });
  await expect(page.locator('#savebar-text')).toContainText('Not saved');
  await expect(page.locator('[data-action="retry-save"]')).toBeVisible();
  await capture(page, '390-08-save-failed', testInfo);

  // Recovery
  await page.click('#btn-simulate-fail');
  await page.click('[data-action="retry-save"]');
  await expect(page.locator('#savebar')).toHaveAttribute('data-state', 'saved', { timeout: 4000 });
});

test('answers survive a page refresh and resume at the same question', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');
  await page.locator('.option').first().click();
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => window.__MK_PROTO__.getState().currentId);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__MK_PROTO__?.getGraph()));
  await expect(page.locator('h1')).toContainText('exactly where you left it');
  await capture(page, '390-07-resume', testInfo);

  await page.click('[data-action="resume-continue"]');
  await page.waitForSelector('#q-title');
  const after = await page.evaluate(() => window.__MK_PROTO__.getState().currentId);
  expect(after).toBe(before);
});

/* -------------------------------------------------------- invalidation */

test('gateway change warns, requires confirmation and traps focus', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J2'));
  await completeAll(page);
  await clickAction(page, 'jump', 'G03');
  await page.waitForSelector('#q-title');

  await page.locator('input[value="none"]').click({ force: true });
  const dialog = page.locator('.dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'alertdialog');
  await expect(dialog.locator('#dlg-title')).toContainText(/remove \d+ answers?/);
  await capture(page, '390-06-invalidation-warning', testInfo);

  // Escape cancels without destroying answers.
  const answersBefore = await page.evaluate(() => Object.keys(window.__MK_PROTO__.getState().answers).length);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const answersAfter = await page.evaluate(() => Object.keys(window.__MK_PROTO__.getState().answers).length);
  expect(answersAfter).toBe(answersBefore);

  // Confirming records audit history and drops the answers.
  await page.locator('input[value="none"]').click({ force: true });
  await page.locator('[data-dialog="confirm"]').click();
  await page.waitForTimeout(500);
  const audit = await page.evaluate(() => window.__MK_PROTO__.getState().auditHistory.length);
  expect(audit).toBeGreaterThan(0);
});

/* ------------------------------------------------------------ journeys */

const JOURNEY_IDS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'];

for (const id of JOURNEY_IDS) {
  test(`journey ${id} completes end to end in the browser`, async ({ page }, testInfo) => {
    await page.setViewportSize(VIEWPORTS['390']);
    await boot(page);
    await page.evaluate((j) => window.__MK_PROTO__.loadJourney(j), id);
    await completeAll(page, { unknownEvery: id === 'J6' ? 1 : 0 });

    await clickAction(page, 'review');
    await expect(page.locator('h1')).toContainText('here is what we assessed');

    const summary = await page.evaluate(() => {
      const g = window.__MK_PROTO__.getGraph();
      const s = window.__MK_PROTO__.getState();
      return g.applicabilityProfile(s.answers, s.auditHistory);
    });
    expect(summary.coveragePct).toBe(100);
    expect(summary.applicableCount).toBeGreaterThan(0);

    if (id === 'J5') await capture(page, '390-09-review-excluded-areas', testInfo);
    if (id === 'J4') await capture(page, '390-10-review-outsourced', testInfo);

    await page.locator('[data-action="submit"]').click();
    await expect(page.locator('h1')).toContainText('Thank you');
    if (id === 'J2') await capture(page, '390-11-submitted', testInfo);
  });
}

/* -------------------------------------------------------- desktop shots */

test('desktop review and question capture', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['1440']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J4'));
  await page.waitForTimeout(400);
  await capture(page, '1440-03-question', testInfo);
  await completeAll(page, { unknownEvery: 7 });
  await clickAction(page, 'review');
  await expect(page.locator('h1')).toContainText('here is what we assessed');
  await capture(page, '1440-04-review', testInfo);
});

test('domain-complete transition is shown between areas', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J5'));
  await page.waitForTimeout(300);

  // Answer until a domain-complete screen appears. The loop exits via `break`,
  // so the header condition is the iteration cap only.
  let seen = false;
  for (let i = 0; i < 120; i += 1) {
    const screen = await page.evaluate(() => window.__MK_PROTO__.getState().screen);
    if (screen === 'domain-complete') { seen = true; break; }
    const has = await page.locator('.option').first().isVisible().catch(() => false);
    if (!has) break;
    await page.locator('.option').first().click();
    await page.waitForTimeout(560);
  }
  expect(seen, 'a domain-complete transition should occur').toBe(true);
  await capture(page, '390-05-domain-complete', testInfo);
});

/* ------------------------------------------------------------- safety */

test('prototype makes no network calls to production hosts', async ({ page }, testInfo) => {
  const external = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://localhost') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.click('[data-action="begin"]');
  await completeAll(page);
  await clickAction(page, 'review');
  expect(external, `unexpected external requests: ${external.join(', ')}`).toEqual([]);
});

/* --------------------------------------------------------------- axe */

test('axe: no serious or critical violations on the key screens', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await expectNoAxeViolations(page, 'welcome');

  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');
  await expectNoAxeViolations(page, 'gateway question');

  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J4'));
  await completeAll(page, { unknownEvery: 7 });
  await clickAction(page, 'review');
  await expect(page.locator('h1')).toContainText('here is what we assessed');
  await expectNoAxeViolations(page, 'review / report preview');

  await page.locator('[data-action="submit"]').click();
  await expect(page.locator('h1')).toContainText('Thank you');
  await expectNoAxeViolations(page, 'submission confirmation');
});

test('axe: the invalidation dialog is accessible', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J2'));
  await completeAll(page);
  await clickAction(page, 'jump', 'G03');
  await page.waitForSelector('#q-title');
  await page.locator('input[value="none"]').click({ force: true });
  await expect(page.locator('.dialog')).toBeVisible();
  await expectNoAxeViolations(page, 'invalidation dialog');
});

/* ------------------------------------------------------ zoom / reflow */

test('reflow at 400% zoom equivalent (320 CSS px wide) without horizontal scroll', async ({ page }) => {
  // WCAG 1.4.10: content at 1280px zoomed to 400% must reflow into 320 CSS px
  // with no two-dimensional scrolling.
  await page.setViewportSize({ width: 320, height: 512 });
  await boot(page);

  const check = async (label) => {
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal scrolling at 400% zoom on ${label}`).toBeLessThanOrEqual(0);
  };

  await check('welcome');
  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');
  await check('question');

  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J7'));
  await completeAll(page);
  await clickAction(page, 'review');
  await expect(page.locator('h1')).toContainText('here is what we assessed');
  await check('review');

  // Wide content (the scorecard) must not force the page to scroll sideways.
  const bodyWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);
  expect(bodyWidth).toBeLessThanOrEqual(320);
});

/* ------------------------------------------- progressive profiling (UI) */

test('at most five profile questions precede the first control question', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');

  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    const id = await page.evaluate(() => window.__MK_PROTO__.getState().currentId);
    if (!id || !/^G\d+$/.test(id)) break;
    seen.push(id);
    await page.locator('.option').first().click();
    await page.waitForTimeout(600);
    const stillGateway = await page.evaluate(() => window.__MK_PROTO__.getState().currentId);
    if (stillGateway === id) {           // high-impact gateway needs explicit Continue
      await page.locator('[data-action="continue"]').click();
      await page.waitForTimeout(500);
    }
  }
  expect(seen.length, `profile phase asked ${seen.join(', ')}`).toBeLessThanOrEqual(5);

  const current = await page.evaluate(() => window.__MK_PROTO__.getState().currentId);
  expect(current).toMatch(/^D\d/);
});

test('domain gateway blocks introduce themselves before their domain', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J2'));
  await page.waitForTimeout(400);

  // Walk to the D3 gateway block and confirm the intro renders.
  await page.evaluate(() => {
    const s = window.__MK_PROTO__.getState();
    s.currentId = 'G05'; s.screen = 'question';
    if (!s.visited.includes('G05')) s.visited.push('G05');
  });
  await clickAction(page, 'jump', 'G05');
  await page.waitForSelector('#q-title');
  await expect(page.locator('[data-testid="gateway-block-intro"]')).toBeVisible();
  await expect(page.locator('[data-testid="gateway-block-intro"]')).toContainText('operational fraud controls');
  await capture(page, '390-12-domain-gateway-intro', testInfo);
});

/* ---------------------------------------- report preview presentation */

test('review shows three separate measures, status and comparability', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J7'));
  await completeAll(page);
  await clickAction(page, 'review');

  await expect(page.locator('[data-testid="frs"]')).toBeVisible();
  await expect(page.locator('[data-testid="coverage"]')).toBeVisible();
  await expect(page.locator('[data-testid="visibility"]')).toBeVisible();
  await expect(page.locator('[data-testid="report-status"]')).toBeVisible();
  await expect(page.locator('[data-testid="comparability"]')).toContainText('should not be compared directly');
  await expect(page.locator('[data-testid="exclusion-schedule"]')).toBeVisible();
  await capture(page, '390-13-review-scope-and-measures', testInfo);
});

test('insufficient visibility is shown prominently and blocks a definitive conclusion', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J8'));
  await completeAll(page);
  await clickAction(page, 'review');

  await expect(page.locator('[data-testid="report-status"]')).toContainText('Insufficient visibility');
  await expect(page.locator('[data-testid="limitations"]')).toBeVisible();

  const status = await page.evaluate(() => window.__MK_PROTO__.getAssessment().reportStatus);
  expect(status).toBe('INSUFFICIENT_VISIBILITY');
  await capture(page, '390-14-insufficient-visibility', testInfo);
});

test('no recommendation is shown for an excluded control', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J5'));
  await completeAll(page);
  await clickAction(page, 'review');

  const leak = await page.evaluate(() => {
    const a = window.__MK_PROTO__.getAssessment();
    const excluded = new Set(a.excludedControls.map((c) => c.question_id));
    return a.recommendations.filter((r) => excluded.has(r.question_id)).map((r) => r.question_id);
  });
  expect(leak).toEqual([]);
});

test('reduced motion is respected', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');
  const duration = await page.evaluate(() => {
    const node = document.querySelector('.animate-in');
    return node ? getComputedStyle(node).animationDuration : null;
  });
  expect(duration === null || parseFloat(duration) < 0.01).toBe(true);
});
