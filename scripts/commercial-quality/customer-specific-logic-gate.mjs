#!/usr/bin/env node
/**
 * Hard regression gate: the production report path must contain no
 * customer-specific analytical logic.
 *
 * The engine once carried an owner-correction gate keyed on one customer's
 * organisation name and assessment reference. Every behaviour it enabled has
 * been ported to generic deterministic logic driven by the Fact Pack, the
 * Blueprint, semantic families, domain scores and narrative mode. This gate
 * fails the build if customer-specific branching returns in any form.
 *
 * Usage:
 *   npm run v11:customer-specific-logic-gate
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

/** Every directory that can influence a customer-facing report. */
const SCAN_ROOTS = [
  'src/lib/reports',
  'src/lib/ai',
  'src/lib/pdf',
  'src/app/api'
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs']);

/**
 * Literals that must never appear in the production report path. The retired
 * gate keyed on all four.
 */
const FORBIDDEN_LITERALS = [
  { label: 'customer organisation name', pattern: /rivonia/i },
  { label: 'customer assessment reference', pattern: /MKFRS-2026-F4047D75C0/i },
  { label: 'customer order reference', pattern: /MKORD-2026-22FF6B69/i },
  { label: 'retired owner-correction gate', pattern: /isRivoniaEssentialOwnerCorrection/ }
];

/**
 * Shapes that make a report branch on customer identity rather than on
 * assessed facts. Any comparison of an organisation name, assessment
 * reference or order reference against a string literal is customer-specific
 * branching regardless of which customer it names.
 */
const FORBIDDEN_BRANCH_SHAPES = [
  { label: 'branch on organisation name', pattern: /organisation(?:Name)?(?:\.name)?\s*[=!]==\s*['"`]/ },
  { label: 'branch on organisation name', pattern: /organization(?:Name)?(?:\.name)?\s*[=!]==\s*['"`]/ },
  { label: 'branch on assessment reference', pattern: /assessment(?:Reference)?(?:\.reference)?\s*[=!]==\s*['"`]MKFRS/i },
  { label: 'branch on order reference', pattern: /order(?:Reference)?(?:\.reference)?\s*[=!]==\s*['"`]MKORD/i },
  { label: 'organisation-name membership test', pattern: /\[\s*['"`][^'"`]*\(Pty\)\s*Ltd['"`][\s\S]{0,200}\]\s*\.\s*(?:includes|some|indexOf)\b/ }
];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...walk(full));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((dir) => walk(path.join(root, dir)));
const violations = [];

for (const file of files) {
  const relative = path.relative(root, file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const { label, pattern } of FORBIDDEN_LITERALS) {
      if (pattern.test(line)) violations.push({ file: relative, line: index + 1, kind: 'literal', label, text: line.trim().slice(0, 160) });
    }
    for (const { label, pattern } of FORBIDDEN_BRANCH_SHAPES) {
      if (pattern.test(line)) violations.push({ file: relative, line: index + 1, kind: 'branch', label, text: line.trim().slice(0, 160) });
    }
  });
}

const summary = {
  scannedRoots: SCAN_ROOTS,
  scannedFiles: files.length,
  CUSTOMER_SPECIFIC_REPORT_LOGIC: violations.length,
  violations
};

console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} customer-specific branch(es) in the production report path.`);
  console.error('The report engine must produce every organisation\'s analysis from assessed facts, not from who the customer is.');
  process.exit(1);
}

console.log('\nPASS: CUSTOMER_SPECIFIC_REPORT_LOGIC = 0');
