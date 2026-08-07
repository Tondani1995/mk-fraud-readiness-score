#!/usr/bin/env node
/**
 * G30 static accessibility and device contract checks.
 *
 * Credential-free, network-free, database-free and browser-free. It reads the checked-in source
 * and asserts the structural contracts G30 requires of the customer journey. Nothing here starts a
 * server, touches Staging or Production, invokes payment/AI/email, or modifies product behaviour.
 *
 * Baseline semantics -- this is the point of the script:
 *
 *   scripts/g30/a11y-contract-baseline.json records, per check, what the certified SHA actually
 *   does today. A check that fails and is baselined KNOWN-OPEN is reported as KNOWN-OPEN and does
 *   not fail the run: those are the defects in docs/g30/open-defect-register.md, which this branch
 *   documents rather than fixes. A check that fails while baselined PASS is a REGRESSION and fails
 *   the run. A check that passes while baselined KNOWN-OPEN is reported as FIXED so the baseline
 *   can be tightened deliberately.
 *
 * That keeps the suite green on a branch that intentionally ships known defects, while still
 * catching the case that matters: something that worked at 23d5d7e1 no longer working.
 *
 * Usage:
 *   node scripts/g30-static-a11y-contract-tests.mjs
 *   G30_EVIDENCE_DIR=evidence/g30/<run-id>/automated node scripts/g30-static-a11y-contract-tests.mjs
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(repoRoot, 'scripts', 'g30', 'a11y-contract-baseline.json');
const evidenceDir = process.env.G30_EVIDENCE_DIR ?? null;

const sourceCache = new Map();

async function source(relativePath) {
  if (sourceCache.has(relativePath)) return sourceCache.get(relativePath);
  const absolute = join(repoRoot, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`g30 contract check referenced a missing file: ${relativePath}`);
  }
  const text = await readFile(absolute, 'utf8');
  sourceCache.set(relativePath, text);
  return text;
}

async function sourcesUnder(relativeDir, extensions = ['.tsx', '.ts']) {
  const { readdir } = await import('node:fs/promises');
  const out = [];
  async function walk(dir) {
    const entries = await readdir(join(repoRoot, dir), { withFileTypes: true });
    for (const entry of entries) {
      const next = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(next);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) out.push(next);
    }
  }
  await walk(relativeDir);
  return out.sort();
}

/** Every customer-facing route file under /score, excluding admin and API handlers. */
async function customerRouteFiles() {
  const files = await sourcesUnder('src/app/score');
  return files.filter((file) =>
    file.endsWith('page.tsx')
    && !file.includes('/admin/')
  );
}

const checks = [];
function check(id, title, defectId, fn) {
  checks.push({ id, title, defectId, fn });
}

// ---------------------------------------------------------------------------
// Page identity and language
// ---------------------------------------------------------------------------

check('SC-01', 'Every customer /score route declares page metadata (WCAG 2.4.2)', 'G30-D-002', async () => {
  const files = await customerRouteFiles();
  const missing = [];
  for (const file of files) {
    const text = await source(file);
    const layout = file.replace(/page\.tsx$/, 'layout.tsx');
    const layoutText = existsSync(join(repoRoot, layout)) ? await source(layout) : '';
    const hasMetadata = /export\s+(const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/.test(text)
      || /export\s+(const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/.test(layoutText);
    if (!hasMetadata) missing.push(file);
  }
  return {
    ok: missing.length === 0,
    detail: missing.length === 0
      ? `all ${files.length} customer routes declare metadata`
      : `${missing.length}/${files.length} customer routes declare no metadata: ${missing.join(', ')}`
  };
});

check('SC-02', 'Root layout declares a document language (WCAG 3.1.1)', null, async () => {
  const text = await source('src/app/layout.tsx');
  const match = text.match(/<html[^>]*\slang=["{]([^"}]+)["}]?/);
  return {
    ok: Boolean(match),
    detail: match ? `<html lang> present: ${match[1]}` : 'no lang attribute on <html> in the root layout'
  };
});

check('SC-03', 'Report-access error page declares lang, title and viewport (WCAG 3.1.1, 2.4.2, 1.4.10)', 'G30-D-004', async () => {
  const text = await source('src/app/score/report/access/[token]/route.ts');
  const errorPage = text.slice(text.indexOf('function errorPage'), text.indexOf('export async function GET'));
  const hasLang = /<html[^>]*lang=/.test(errorPage);
  const hasTitle = /<title>/.test(errorPage);
  const hasViewport = /name=["']viewport["']/.test(errorPage);
  const missing = [
    !hasLang && 'lang',
    !hasTitle && 'title',
    !hasViewport && 'viewport meta'
  ].filter(Boolean);
  return {
    ok: missing.length === 0,
    detail: missing.length === 0
      ? 'error page declares lang, title and viewport'
      : `customer-facing report-access error page is missing: ${missing.join(', ')}`
  };
});

// ---------------------------------------------------------------------------
// Navigation and shell
// ---------------------------------------------------------------------------

check('SC-04', 'A skip-to-content mechanism exists (WCAG 2.4.1)', 'G30-D-003', async () => {
  const candidates = ['src/app/layout.tsx', 'src/components/layout/AppChrome.tsx', 'src/components/layout/Header.tsx'];
  for (const file of candidates) {
    const text = await source(file);
    if (/skip[-\s]?(to|link|nav)/i.test(text) || /href=["']#(main|content)/.test(text)) {
      return { ok: true, detail: `skip mechanism found in ${file}` };
    }
  }
  return { ok: false, detail: `no skip link in any of: ${candidates.join(', ')}` };
});

check('SC-05', 'Assessment shell covers the adaptive customer route', 'G30-D-001', async () => {
  const text = await source('src/components/layout/AppChrome.tsx');
  const match = text.match(/const\s+assessmentActive\s*=\s*([^;]+);/);
  if (!match) return { ok: false, detail: 'assessmentActive predicate not found in AppChrome' };
  const predicate = match[1];
  const coversAdaptive = /['"`]\/score\/adaptive/.test(predicate);
  return {
    ok: coversAdaptive,
    detail: coversAdaptive
      ? 'assessmentActive covers /score/adaptive'
      : `assessmentActive does not match /score/adaptive/, so the certified customer journey renders in the marketing shell without overflow-x-hidden, 100dvh or safe-area insets. Predicate: ${predicate.replace(/\s+/g, ' ').trim()}`
  };
});

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

check('SC-06', 'Start form inputs declare autocomplete tokens (WCAG 1.3.5)', 'G30-D-008', async () => {
  const text = await source('src/components/adaptive/AdaptiveStartForm.tsx');
  const expected = {
    fullName: 'name',
    email: 'email',
    organisationName: 'organization',
    roleTitle: 'organization-title'
  };
  const missing = [];
  for (const [field, token] of Object.entries(expected)) {
    const inputMatch = text.match(new RegExp(`<input[^>]*name=["']${field}["'][^>]*>`));
    if (!inputMatch) { missing.push(`${field} (input not found)`); continue; }
    if (!/autoComplete=/.test(inputMatch[0])) missing.push(`${field} (expected autoComplete="${token}")`);
  }
  return {
    ok: missing.length === 0,
    detail: missing.length === 0 ? 'all start-form inputs declare autocomplete' : `no autocomplete on: ${missing.join(', ')}`
  };
});

check('SC-07', 'Error surfaces use role="alert" (WCAG 3.3.1, 4.1.3)', null, async () => {
  const files = [
    'src/components/adaptive/AdaptiveStartForm.tsx',
    'src/components/adaptive/AdaptiveAssessmentExperience.tsx'
  ];
  const without = [];
  for (const file of files) {
    const text = await source(file);
    if (!/role=["']alert["']/.test(text)) without.push(file);
  }
  return {
    ok: without.length === 0,
    detail: without.length === 0 ? 'all checked surfaces render errors into role="alert"' : `no role="alert" in: ${without.join(', ')}`
  };
});

// ---------------------------------------------------------------------------
// Adaptive experience semantics
// ---------------------------------------------------------------------------

check('SC-08', 'Radio-group legends carry the question, not a generic instruction (WCAG 1.3.1, 3.3.2)', 'G30-D-007', async () => {
  const text = await source('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const legends = [...text.matchAll(/<legend[^>]*>([^<]*)</g)].map((match) => match[1].trim());
  const generic = legends.filter((legend) => /^(select|choose)\b/i.test(legend) && !/\{/.test(legend));
  return {
    ok: generic.length === 0,
    detail: generic.length === 0
      ? `legends carry question context (${legends.length} found)`
      : `${generic.length} generic legend(s) that do not name the question: ${generic.map((legend) => JSON.stringify(legend)).join(', ')}`
  };
});

check('SC-09', 'Completion screen provides a focus target after submission (WCAG 2.4.3)', 'G30-D-005', async () => {
  const text = await source('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const effect = text.match(/useEffect\(\(\)\s*=>\s*\{\s*headingRef\.current\?\.focus\(\);?\s*\},\s*\[([^\]]*)\]\)/);
  const deps = effect ? effect[1].split(',').map((dep) => dep.trim()).filter(Boolean) : [];
  const tracksSubmitted = deps.includes('submitted');
  // The completion branch is the early return guarded by `submitted ||`.
  const completionStart = text.indexOf('if (submitted ||');
  const completionEnd = text.indexOf('if (screen === \'review\'');
  const completion = completionStart >= 0 && completionEnd > completionStart ? text.slice(completionStart, completionEnd) : '';
  const hasFocusTarget = /ref=\{headingRef\}/.test(completion) || /tabIndex=\{-1\}/.test(completion);
  const ok = hasFocusTarget && tracksSubmitted;
  return {
    ok,
    detail: ok
      ? 'completion screen has a focusable heading and the focus effect tracks submission'
      : `focus effect deps [${deps.join(', ')}] do not include "submitted"${hasFocusTarget ? '' : ' and the completion card has no ref={headingRef} / tabIndex={-1} target'}; focus falls back to <body> when the submit control unmounts`
  };
});

check('SC-10', 'Modal dialog declares role, aria-modal and an accessible name (WCAG 4.1.2)', null, async () => {
  const text = await source('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const ok = /role=["']dialog["']/.test(text) && /aria-modal=["']true["']/.test(text) && /aria-labelledby=/.test(text);
  return { ok, detail: ok ? 'dialog declares role, aria-modal and aria-labelledby' : 'dialog is missing one of role="dialog" / aria-modal / aria-labelledby' };
});

check('SC-11', 'Modal dialog implements the focus behaviour it declares (WCAG 2.4.3)', 'G30-D-006', async () => {
  const text = await source('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const declaresModal = /aria-modal=["']true["']/.test(text);
  if (!declaresModal) return { ok: true, detail: 'no aria-modal declared, so no containment obligation' };
  const hasEscape = /(onKeyDown|keydown)[\s\S]{0,400}Escape/.test(text);
  const hasFocusMove = /(dialogRef|invalidationRef|firstFocusableRef)/.test(text);
  const hasInert = /\binert\b|aria-hidden=\{/.test(text);
  const missing = [
    !hasFocusMove && 'initial focus move into the dialog',
    !hasEscape && 'Escape handler',
    !hasInert && 'background inert/aria-hidden'
  ].filter(Boolean);
  return {
    ok: missing.length === 0,
    detail: missing.length === 0
      ? 'dialog implements focus containment'
      : `aria-modal="true" is declared but not implemented; missing: ${missing.join(', ')}`
  };
});

check('SC-12', 'Modal panel can scroll internally so its actions stay reachable (WCAG 1.4.4, 1.4.10)', 'G30-D-006', async () => {
  const text = await source('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const dialogStart = text.indexOf('role="dialog"');
  if (dialogStart < 0) return { ok: true, detail: 'no dialog present' };
  const dialogMarkup = text.slice(Math.max(0, dialogStart - 400), dialogStart + 1200);
  const centred = /items-center/.test(dialogMarkup);
  const scrollable = /overflow-y-auto|overflow-auto|max-h-\[/.test(dialogMarkup);
  return {
    ok: scrollable || !centred,
    detail: scrollable
      ? 'dialog panel scrolls internally'
      : 'dialog is vertically centred in a fixed inset-0 container with no internal overflow-y and no max-height; a panel taller than the viewport pushes its action buttons out of reach at 320px and at 200% zoom'
  };
});

check('SC-13', 'Progress indicator exposes name and value (WCAG 4.1.2)', null, async () => {
  const text = await source('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const bar = text.match(/role=["']progressbar["'][^>]*/);
  if (!bar) return { ok: false, detail: 'no role="progressbar" found' };
  const attributes = ['aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow'];
  const missing = attributes.filter((attribute) => !bar[0].includes(attribute));
  return {
    ok: missing.length === 0,
    detail: missing.length === 0 ? 'progressbar exposes label and value range' : `progressbar missing: ${missing.join(', ')}`
  };
});

check('SC-14', 'Answer options declare a minimum target height (WCAG 2.5.8)', null, async () => {
  const text = await source('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const labels = [...text.matchAll(/<label[^>]*className=\{?`?([^`"}]*min-h-\d+[^`"}]*)/g)];
  const heights = labels
    .map((match) => match[1].match(/min-h-(\d+)/))
    .filter(Boolean)
    .map((match) => Number(match[1]) * 4);
  const belowThreshold = heights.filter((height) => height < 24);
  return {
    ok: heights.length > 0 && belowThreshold.length === 0,
    detail: heights.length === 0
      ? 'no min-height declared on answer option labels'
      : `option label min-heights (css px): ${[...new Set(heights)].sort((a, b) => a - b).join(', ')}${belowThreshold.length ? ` — below the 24px minimum: ${belowThreshold.join(', ')}` : ''}`
  };
});

check('SC-15', 'Primary button declares a visible focus indicator (WCAG 2.4.7)', null, async () => {
  const text = await source('src/components/ui/Button.tsx');
  const ok = /focus:ring-\d/.test(text) || /focus-visible:/.test(text) || /focus:outline(?!-none)/.test(text);
  return { ok, detail: ok ? 'Button declares a focus ring' : 'Button declares no visible focus indicator' };
});

// ---------------------------------------------------------------------------
// Result and commercial surfaces
// ---------------------------------------------------------------------------

check('SC-16', 'Result page uses headings for its sections (WCAG 1.3.1, 2.4.6)', 'G30-D-009', async () => {
  const text = await source('src/components/assessment/FreeSnapshot.tsx');
  const headings = [...text.matchAll(/<h[1-6][\s>]/g)].length;
  const sections = [...text.matchAll(/<section[\s>]/g)].length;
  const pseudoHeadings = [...text.matchAll(/<p[^>]*className=["'][^"']*font-semibold[^"']*["']/g)].length;
  const ok = headings >= sections;
  return {
    ok,
    detail: `${headings} heading element(s) for ${sections} <section> element(s), with ${pseudoHeadings} <p class="font-semibold"> used as section titles; screen-reader heading navigation across the result page is not available`
  };
});

check('SC-17', 'Revealed commercial panels are announced or focused (WCAG 4.1.3)', 'G30-D-010', async () => {
  const text = await source('src/components/assessment/FreeSnapshot.tsx');
  const start = text.indexOf('selectedOption === COMMERCIAL_OPTION_CODES.fullReport');
  const region = start >= 0 ? text.slice(start, start + 900) : '';
  const ok = /aria-live=/.test(region) || /role=["']status["']/.test(region) || /\.focus\(\)/.test(region);
  return {
    ok,
    detail: ok
      ? 'revealed order panel is announced or focused'
      : 'selecting a product option conditionally renders the order summary with no aria-live region and no focus move, so screen-reader users get no indication it appeared'
  };
});

check('SC-18', 'View-tracking observer fires at small viewports', 'G30-D-015', async () => {
  const text = await source('src/components/assessment/FreeSnapshot.tsx');
  const match = text.match(/threshold:\s*\[([^\]]+)\]/);
  if (!match) return { ok: true, detail: 'no IntersectionObserver threshold configured' };
  const thresholds = match[1].split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
  const lowest = Math.min(...thresholds);
  return {
    ok: lowest <= 0.1,
    detail: `IntersectionObserver threshold ${JSON.stringify(thresholds)}; a section taller than the viewport at 320px or 200% zoom may never reach ratio ${lowest}, so its commercial view event would not fire on small screens`
  };
});

// ---------------------------------------------------------------------------
// Motion, timing and embedding
// ---------------------------------------------------------------------------

check('SC-19', 'Smooth scrolling is disabled under prefers-reduced-motion', 'G30-D-012', async () => {
  const text = await source('src/app/globals.css');
  if (!/scroll-behavior:\s*smooth/.test(text)) return { ok: true, detail: 'no global smooth scrolling declared' };
  const guarded = /prefers-reduced-motion[\s\S]{0,300}scroll-behavior:\s*auto/.test(text);
  return {
    ok: guarded,
    detail: guarded
      ? 'smooth scrolling is overridden under reduced motion'
      : 'html { scroll-behavior: smooth } is declared with no prefers-reduced-motion override, so fragment navigation animates for users who asked it not to'
  };
});

check('SC-20', 'Verified-payment polling is bounded', 'G30-D-014', async () => {
  const text = await source('src/components/payments/PaymentReturnStatus.tsx');
  if (!/setTimeout\(poll/.test(text)) return { ok: true, detail: 'no repeat polling' };
  // Scope to the effect body. The label map above it contains customer copy such as "…for this
  // attempt", which a naive whole-file search for "attempt" matches, producing a false pass.
  const effectStart = text.indexOf('useEffect(');
  const effectEnd = text.indexOf('}, [orderReference]);');
  const effect = effectStart >= 0 && effectEnd > effectStart ? text.slice(effectStart, effectEnd) : text;
  const bounded = /\b(attemptCount|attempts|maxAttempts|maxPolls|pollCount|pollAttempts|backoff|delayMs)\b/.test(effect)
    || /Math\.min\(/.test(effect);
  return {
    ok: bounded,
    detail: bounded
      ? 'polling declares an attempt cap or backoff'
      : 'the payment return page re-polls every 3s while pending with no attempt cap, no backoff and no ceiling, so a phone left on this page polls indefinitely'
  };
});

check('SC-21', 'No iframe embedding on the customer journey', null, async () => {
  const files = [...(await customerRouteFiles()), 'src/components/adaptive/AdaptiveAssessmentExperience.tsx', 'src/components/assessment/FreeSnapshot.tsx'];
  const offenders = [];
  for (const file of files) {
    const text = await source(file);
    if (/<iframe[\s>]/.test(text)) offenders.push(file);
  }
  return { ok: offenders.length === 0, detail: offenders.length === 0 ? 'no iframe in the customer journey source' : `iframe found in: ${offenders.join(', ')}` };
});

check('SC-22', 'Selecting an answer does not change context automatically (WCAG 3.2.2)', null, async () => {
  const text = await source('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const gateway = text.match(/async function chooseGateway[\s\S]{0,400}?\n\s*\}/);
  const control = text.match(/async function chooseControl[\s\S]{0,400}?\n\s*\}/);
  const holdsPosition = [gateway, control].every((match) => match && /preservePosition|,\s*true\s*\)/.test(match[0]));
  return {
    ok: holdsPosition,
    detail: holdsPosition
      ? 'answer selection autosaves and holds position; advancing requires an explicit Continue'
      : 'answer selection appears to advance automatically, which changes context on input'
  };
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function loadBaseline() {
  if (!existsSync(baselinePath)) {
    throw new Error(`missing baseline: ${baselinePath}. Create it before running this suite.`);
  }
  const parsed = JSON.parse(await readFile(baselinePath, 'utf8'));
  return parsed.checks ?? {};
}

const baseline = await loadBaseline();
const results = [];

for (const { id, title, defectId, fn } of checks) {
  let outcome;
  try {
    outcome = await fn();
  } catch (error) {
    outcome = { ok: false, detail: `check threw: ${error instanceof Error ? error.message : String(error)}` };
  }
  const expected = baseline[id] ?? 'PASS';
  let status;
  if (outcome.ok && expected === 'PASS') status = 'PASS';
  else if (outcome.ok && expected === 'KNOWN-OPEN') status = 'FIXED';
  else if (!outcome.ok && expected === 'KNOWN-OPEN') status = 'KNOWN-OPEN';
  else status = 'REGRESSION';
  results.push({ id, title, defectId, expected, status, detail: outcome.detail });
}

const counts = results.reduce((accumulator, result) => {
  accumulator[result.status] = (accumulator[result.status] ?? 0) + 1;
  return accumulator;
}, {});

const width = Math.max(...results.map((result) => result.id.length));
for (const result of results) {
  const marker = { PASS: 'PASS      ', 'KNOWN-OPEN': 'KNOWN-OPEN', FIXED: 'FIXED     ', REGRESSION: 'REGRESSION' }[result.status];
  console.log(`${marker}  ${result.id.padEnd(width)}  ${result.title}`);
  if (result.status !== 'PASS') {
    console.log(`${' '.repeat(marker.length + 2 + width + 2)}${result.detail}${result.defectId ? `  [${result.defectId}]` : ''}`);
  }
}

console.log('');
console.log(`G30 static contract: ${results.length} checks — `
  + `${counts.PASS ?? 0} pass, ${counts['KNOWN-OPEN'] ?? 0} known-open, `
  + `${counts.FIXED ?? 0} fixed, ${counts.REGRESSION ?? 0} regression`);

if (counts.FIXED) {
  console.log('');
  console.log('Some baselined defects now pass. Tighten scripts/g30/a11y-contract-baseline.json to PASS');
  console.log('so they cannot silently regress again.');
}

const report = {
  suite: 'g30-static-a11y-contract',
  generatedAtUtc: new Date().toISOString(),
  baselinePath: 'scripts/g30/a11y-contract-baseline.json',
  counts,
  results
};

if (evidenceDir) {
  await mkdir(evidenceDir, { recursive: true });
  const outputPath = join(evidenceDir, 'static-a11y-contract.json');
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`evidence written: ${outputPath}`);
}

if (counts.REGRESSION) {
  console.error('');
  console.error(`FAILED: ${counts.REGRESSION} contract regression(s) against the certified baseline.`);
  process.exit(1);
}
