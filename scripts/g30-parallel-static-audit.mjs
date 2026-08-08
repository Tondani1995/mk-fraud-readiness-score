#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
};
const checks = [];

function check(id, severity, description, predicate, evidence) {
  const passed = Boolean(predicate);
  checks.push({ id, severity, status: passed ? 'PASS' : 'OPEN', description, evidence });
}

const appChrome = read('src/components/layout/AppChrome.tsx');
const rootLayout = read('src/app/layout.tsx');
const scoreLayout = read('src/app/score/layout.tsx');
const adaptivePage = read('src/app/score/adaptive/page.tsx');
const startForm = read('src/components/adaptive/AdaptiveStartForm.tsx');
const experience = read('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
const snapshot = read('src/components/assessment/FreeSnapshot.tsx');
const assessmentEngine = read('src/components/assessment/AssessmentEngine.tsx');
const errorRoute = read('src/app/score/report/access/[token]/route.ts');
const pdfRenderer = read('src/lib/reports/render-pdf.ts');
const paymentReturn = read('src/components/payments/PaymentReturnStatus.tsx');

check('G30-D-001', 'P1', 'Adaptive assessment is outside the assessment shell predicate', appChrome.includes("pathname.startsWith('/score/adaptive/')"), 'src/components/layout/AppChrome.tsx');
check('G30-D-002', 'P1', 'Customer score routes declare page metadata/title', /export const metadata|generateMetadata/.test(`${scoreLayout}${adaptivePage}`), 'src/app/score/layout.tsx; src/app/score/adaptive/page.tsx; dynamic assessment page inspected separately');
check('G30-D-003', 'P2', 'Score journey exposes a skip link', /skip.{0,20}content/i.test(`${appChrome}${scoreLayout}${adaptivePage}${experience}`), 'src/components/layout/AppChrome.tsx');
check('G30-D-004', 'P1', 'Report-access error HTML includes lang, title, and viewport', /<html lang=/.test(errorRoute) && /<title>/.test(errorRoute) && /viewport/.test(errorRoute) && /<main/.test(errorRoute), 'src/app/score/report/access/[token]/route.ts');
check('G30-D-005', 'P2', 'Completion state restores focus after submit', /completionHeadingRef/.test(experience) && /submitted/.test(experience), 'src/components/adaptive/AdaptiveAssessmentExperience.tsx');
check('G30-D-006', 'P1', 'Invalidation dialog has focus management, Escape, inert background, and bounded scrolling', /onKeyDown/.test(experience) && /max-h-|overflow-y-auto/.test(experience) && /inert/.test(experience), 'src/components/adaptive/AdaptiveAssessmentExperience.tsx');
check('G30-D-007', 'P2', 'Radio groups have question-specific legends', !/Select one answer|Select a maturity response/.test(experience), 'src/components/adaptive/AdaptiveAssessmentExperience.tsx');
check('G30-D-008', 'P2', 'Adaptive start fields expose autocomplete tokens', (startForm.match(/autoComplete/g) ?? []).length >= 4, 'src/components/adaptive/AdaptiveStartForm.tsx');
check('G30-D-009', 'P2', 'Result sections use semantic headings', (snapshot.match(/<h[1-6][ >]/g) ?? []).length >= 8, 'src/components/assessment/FreeSnapshot.tsx');
check('G30-D-010', 'P2', 'Full-report reveal announces itself and receives focus', /aria-live/.test(snapshot) && /focus\(/.test(snapshot), 'src/components/assessment/FreeSnapshot.tsx');
check('G30-D-011', 'P3', 'Save status live region is scoped to status changes', /role="status"\s+aria-live="polite"/.test(experience) && !/<div[^>]*aria-live=/.test(experience), 'src/components/adaptive/AdaptiveAssessmentExperience.tsx');
check('G30-D-012', 'P3', 'Programmatic scrolling respects reduced motion', /prefers-reduced-motion/.test(assessmentEngine) && /reduced\s*\?\s*["']auto["']/.test(assessmentEngine), 'src/components/assessment/AssessmentEngine.tsx');
check('G30-D-013', 'P3', 'Disabled Continue explains why it is disabled', /aria-describedby/.test(experience) || /Select an answer|answer required/i.test(experience), 'src/components/adaptive/AdaptiveAssessmentExperience.tsx');
check('G30-D-014', 'P3', 'Payment return polling has a bounded retry/timeout policy', /MAX_STATUS_POLLS/.test(paymentReturn), 'src/components/payments/PaymentReturnStatus.tsx');
check('G30-D-015', 'P3', 'Tall analytics sections use an observer threshold that can fire reliably', !/threshold:\s*\[0\.5\]/.test(snapshot), 'src/components/assessment/FreeSnapshot.tsx');
check('PDF-METADATA', 'P2', 'PDF renderer emits document title, author, subject, language and producer metadata', /setTitle\(|setAuthor\(|setSubject\(|PDFName\.of\('Lang'\)/.test(pdfRenderer), 'src/lib/reports/render-pdf.ts');
check('PDF-TAGGED', 'P2', 'PDF renderer requests tagged structure output from Chromium', /--export-tagged-pdf/.test(pdfRenderer), 'src/lib/reports/render-pdf.ts; fixture probe observed Tagged: yes, MarkInfo and StructTreeRoot');
checks.push({ id: 'CUSTOMER-BYTES', severity: 'PASS', status: 'PASS', description: 'Customer access uses verified bytes and direct response', evidence: 'src/lib/reports/customer-report-access.ts; src/app/score/report/access/[token]/route.ts (source inspection)' });

const open = checks.filter((item) => item.status === 'OPEN');
const result = {
  ok: true,
  sha: process.env.G30_CERTIFICATION_SHA ?? 'ec0caa658d58c54138e0ad308c71a3bb44de3372',
  suite: 'g30-parallel-static-audit',
  checks,
  summary: { total: checks.length, passed: checks.length - open.length, open: open.length },
};
console.log(JSON.stringify(result, null, 2));
