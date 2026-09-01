#!/usr/bin/env node

/**
 * Targeted keyboard proof for the V1.2 owner correction. It exercises the real adaptive
 * presentation states and records that programmatic heading focus is visually quiet while
 * keyboard navigation still reaches the actual interactive controls.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:3211').replace(/\/$/, '');
const CANDIDATE_SHA = process.env.CANDIDATE_SHA ?? '';
const OUTPUT = path.resolve(process.env.KEYBOARD_EVIDENCE_PATH ?? `outputs/v12-premium-experience-recovery/${CANDIDATE_SHA || 'local'}/keyboard-a11y-evidence.json`);
const CHROME_PATH = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PREVIEW_SHARE_URL = process.env.VERCEL_SHARE_URL ?? null;

if (!CANDIDATE_SHA) throw new Error('CANDIDATE_SHA is required so keyboard evidence cannot be detached from a commit.');

const CASES = [
  { name: 'adaptive-early-320', path: '/score/visual-review/adaptive/early', width: 320, expectedHeading: 'What best describes' },
  { name: 'adaptive-early-390', path: '/score/visual-review/adaptive/early', width: 390, expectedHeading: 'What best describes' },
  { name: 'adaptive-early-430', path: '/score/visual-review/adaptive/early', width: 430, expectedHeading: 'What best describes' },
  { name: 'adaptive-review-390', path: '/score/visual-review/adaptive/review', width: 390, expectedHeading: 'Your assessment is ready' },
  { name: 'adaptive-submitted-390', path: '/score/visual-review/adaptive/submitted', width: 390, expectedHeading: 'Your assessment is complete' }
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function primePreviewAccess(page) {
  if (!PREVIEW_SHARE_URL) return;
  await page.goto(PREVIEW_SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (page.url().includes('vercel.com/login')) throw new Error('Preview share URL did not grant browser access.');
  await delay(400);
}

const result = { schemaVersion: 1, candidateSha: CANDIDATE_SHA, baseUrl: BASE, cases: [], ok: false };
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

try {
  for (const item of CASES) {
    const page = await browser.newPage();
    await page.setViewport({ width: item.width, height: 900, isMobile: item.width < 500, hasTouch: item.width < 500 });
    await primePreviewAccess(page);
    await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(700);

    const initial = await page.evaluate((expectedHeading) => {
      const heading = document.querySelector('h1[tabindex="-1"]');
      const active = document.activeElement;
      const style = active ? window.getComputedStyle(active) : null;
      const outlineHidden = !style || style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0 || style.outlineColor === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(style.outlineColor);
      return {
        headingText: heading?.textContent?.trim() ?? null,
        expectedHeadingPresent: (heading?.textContent ?? '').includes(expectedHeading),
        focusedHeading: active === heading,
        focusedHeadingOutlineHidden: active === heading ? outlineHidden : null,
        focusedTag: active?.tagName ?? null
      };
    }, item.expectedHeading);

    const tabStops = [];
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Tab');
      tabStops.push(await page.evaluate(() => {
        const active = document.activeElement;
        const style = active ? window.getComputedStyle(active) : null;
        const rect = active?.getBoundingClientRect();
        return {
          tag: active?.tagName ?? null,
          type: active?.getAttribute('type') ?? null,
          role: active?.getAttribute('role') ?? null,
          text: active?.textContent?.trim().slice(0, 80) ?? '',
          tabIndex: active?.getAttribute('tabindex') ?? null,
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
          focusStyle: style ? {
            outline: style.outline,
            outlineColor: style.outlineColor,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow
          } : null
        };
      }));
    }

    const firstInteractive = tabStops.find((stop) => ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(stop.tag) || ['button', 'radio', 'link'].includes(stop.role));
    const adaptiveQuestion = item.path.endsWith('/early');
    const firstStopIsAnswer = adaptiveQuestion ? firstInteractive?.tag === 'INPUT' && firstInteractive?.type === 'radio' : true;
    const interactiveTargetReached = Boolean(firstInteractive?.visible && Number(firstInteractive.tabIndex ?? '0') >= 0);
    const row = {
      name: item.name,
      route: item.path,
      viewport: `${item.width}x900`,
      initial,
      tabStops,
      assertions: {
        headingStatePresent: initial.expectedHeadingPresent,
        headingReceivesProgrammaticFocus: initial.focusedHeading,
        programmaticHeadingOutlineHidden: initial.focusedHeadingOutlineHidden === true,
        keyboardReachesInteractiveControl: interactiveTargetReached,
        earlyStateStartsWithRadioKeyboardTarget: firstStopIsAnswer
      }
    };
    row.pass = Object.values(row.assertions).every(Boolean);
    result.cases.push(row);
    await page.close();
  }
} finally {
  await browser.close();
}

result.ok = result.cases.every((item) => item.pass);
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ok: result.ok, cases: result.cases.length, output: OUTPUT, failures: result.cases.filter((item) => !item.pass).map((item) => ({ name: item.name, assertions: item.assertions })) }, null, 2));
if (!result.ok) process.exitCode = 1;
