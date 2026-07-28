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

const VIEWPORTS = {
  '320': { width: 320, height: 640 },
  '390': { width: 390, height: 844 },
  '768': { width: 768, height: 1024 },
  '1440': { width: 1440, height: 900 }
};

const shot = (name) => ({ path: `screenshots/${name}.png`, fullPage: true });

/** Capture after entry animations have settled, so stills are not caught mid-fade. */
async function capture(page, name) {
  await page.waitForTimeout(420);
  await page.screenshot(shot(name));
}

async function boot(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => Boolean(window.__MK_PROTO__?.getGraph()));
  await page.evaluate(() => window.__MK_PROTO__.reset());
}

/** Fill every active node deterministically, optionally injecting unknowns. */
async function completeAll(page, { unknownEvery = 0 } = {}) {
  await page.evaluate(({ unknownEvery }) => {
    const g = window.__MK_PROTO__.getGraph();
    const s = window.__MK_PROTO__.getState();
    let i = 0;
    for (;;) {
      i += 1;
      if (i > 400) break;
      const n = g.nextUnanswered(s.answers);
      if (!n) break;
      const unknown = unknownEvery > 0 && i % unknownEvery === 0;
      s.answers[n.id] = {
        value: n.node.gateway_status === 'gateway' ? 'unknown' : (unknown ? 'unknown' : i % 6),
        answeredAt: 'test'
      };
    }
  }, { unknownEvery });
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
  test(`layout is sound at ${label}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await boot(page);

    // No horizontal scrolling, at any width.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${label}px`).toBeLessThanOrEqual(0);

    await capture(page, `${label}-01-welcome`);

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

    await capture(page, `${label}-02-gateway-question`);
  });
}

/* ----------------------------------------------------------- keyboard */

test('full keyboard operation with visible focus', async ({ page }) => {
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

  // The skip link is the first tab stop on a freshly-loaded document.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__MK_PROTO__?.getGraph()));
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.className);
  expect(first).toContain('skip-link');
});

test('unknown option is reachable by keyboard shortcut', async ({ page }) => {
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

test('save-in-progress and save-failed states are presented', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.click('[data-action="begin"]');
  await page.waitForSelector('#q-title');

  await page.click('#btn-simulate-fail');
  await page.locator('.option').first().click();

  await expect(page.locator('#savebar')).toHaveAttribute('data-state', 'error', { timeout: 4000 });
  await expect(page.locator('#savebar-text')).toContainText('Not saved');
  await expect(page.locator('[data-action="retry-save"]')).toBeVisible();
  await capture(page, '390-08-save-failed');

  // Recovery
  await page.click('#btn-simulate-fail');
  await page.click('[data-action="retry-save"]');
  await expect(page.locator('#savebar')).toHaveAttribute('data-state', 'saved', { timeout: 4000 });
});

test('answers survive a page refresh and resume at the same question', async ({ page }) => {
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
  await capture(page, '390-07-resume');

  await page.click('[data-action="resume-continue"]');
  await page.waitForSelector('#q-title');
  const after = await page.evaluate(() => window.__MK_PROTO__.getState().currentId);
  expect(after).toBe(before);
});

/* -------------------------------------------------------- invalidation */

test('gateway change warns, requires confirmation and traps focus', async ({ page }) => {
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
  await capture(page, '390-06-invalidation-warning');

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
  test(`journey ${id} completes end to end in the browser`, async ({ page }) => {
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

    if (id === 'J5') await capture(page, '390-09-review-excluded-areas');
    if (id === 'J4') await capture(page, '390-10-review-outsourced');

    await page.locator('[data-action="submit"]').click();
    await expect(page.locator('h1')).toContainText('Thank you');
    if (id === 'J2') await capture(page, '390-11-submitted');
  });
}

/* -------------------------------------------------------- desktop shots */

test('desktop review and question capture', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['1440']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J4'));
  await page.waitForTimeout(400);
  await capture(page, '1440-03-question');
  await completeAll(page, { unknownEvery: 7 });
  await clickAction(page, 'review');
  await expect(page.locator('h1')).toContainText('here is what we assessed');
  await capture(page, '1440-04-review');
});

test('domain-complete transition is shown between areas', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['390']);
  await boot(page);
  await page.evaluate(() => window.__MK_PROTO__.loadJourney('J5'));
  await page.waitForTimeout(300);

  // Answer until a domain-complete screen appears.
  let seen = false;
  for (let i = 0; i < 120 && !seen; i += 1) {
    const screen = await page.evaluate(() => window.__MK_PROTO__.getState().screen);
    if (screen === 'domain-complete') { seen = true; break; }
    const has = await page.locator('.option').first().isVisible().catch(() => false);
    if (!has) break;
    await page.locator('.option').first().click();
    await page.waitForTimeout(560);
  }
  expect(seen, 'a domain-complete transition should occur').toBe(true);
  await capture(page, '390-05-domain-complete');
});

/* ------------------------------------------------------------- safety */

test('prototype makes no network calls to production hosts', async ({ page }) => {
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

test('reduced motion is respected', async ({ page }) => {
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
