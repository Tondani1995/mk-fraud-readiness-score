import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function assert(condition, label) { if (!condition) throw new Error(label); }
function assertIncludes(file, needle, label) { assert(read(file).includes(needle), `${label}: expected ${file} to include ${needle}`); }
function assertNotIncludes(file, needle, label) { assert(!read(file).includes(needle), `${label}: expected ${file} not to include ${needle}`); }

const required = [
  'src/lib/reports/types.ts',
  'src/lib/reports/assemble-report-data.ts',
  'src/lib/reports/select-content-blocks.ts',
  'src/lib/reports/roadmap.ts',
  'src/lib/reports/render-pdf.ts',
  'src/lib/reports/templates/report-template.ts',
  'src/app/api/admin/orders/[orderReference]/generate-report/route.ts',
  'src/app/api/admin/reports/[reportId]/download/route.ts',
  'src/app/admin/orders/[orderReference]/page.tsx',
  'src/app/admin/reports/page.tsx',
  'src/app/report/request/[assessmentRef]/page.tsx',
  'supabase/migrations/0011_phase10_pdf_report_engine_additions.sql',
  'docs/v1/phase-exit-cards/phase-10-pdf-report-engine.md'
];
for (const file of required) assert(exists(file), `${file} must exist`);

const migration = 'supabase/migrations/0011_phase10_pdf_report_engine_additions.sql';
assertIncludes(migration, 'report_templates', 'Migration seeds report template');
assertIncludes(migration, "'essential_self_assessment'", 'Migration seeds essential report template');
assertIncludes(migration, "'mk_validated'", 'Migration seeds MK validated report template');
assertIncludes(migration, 'generated-reports', 'Migration creates/locks private report bucket');
assertIncludes(migration, 'actions_json', 'Migration respects content block schema');
assertIncludes(migration, "'draft'", 'Starter content remains draft');
assertIncludes(migration, 'payment_gateway":false', 'No gateway boundary is recorded');
assertNotIncludes(migration, "'active', 1),", 'Content blocks are not activated by migration');

const assemble = 'src/lib/reports/assemble-report-data.ts';
assertIncludes(assemble, 'score_runs', 'Assembly reads persisted score_runs');
assertIncludes(assemble, 'score_domain_results', 'Assembly reads persisted score_domain_results');
assertIncludes(assemble, 'score_question_traces', 'Assembly reads persisted score_question_traces');
assertIncludes(assemble, "new Set(['payment_received'])", 'Report generation is gated only on payment_received');
assertNotIncludes(assemble, "'verified'", 'Legacy verified status must not be eligible for Phase 10 generation');
assertIncludes(assemble, 'product_code', 'Assembly reads product code for report type selection');
assertIncludes(assemble, 'productCode', 'Assembly returns product code to the generation route');
assert(!/overallScore\s*[+\-*/]/.test(read(assemble)), 'Assembly must not recalculate the overall score');

const contentSelection = 'src/lib/reports/select-content-blocks.ts';
assertIncludes(contentSelection, 'item.domainCode === domain.domainCode', 'Domain narratives match on persisted domain codes');
assertIncludes(contentSelection, 'item.domainCode === gap.domainCode', 'Gap commentary matches on persisted domain codes');
assertNotIncludes(contentSelection, 'item.domainCode === domain.domainName', 'Domain narratives must not match on display names');
assertNotIncludes(contentSelection, 'item.domainCode === gap.domainName', 'Gap commentary must not match on display names');

const reportRequestPage = 'src/app/report/request/[assessmentRef]/page.tsx';
assertNotIncludes(reportRequestPage, 'Phase 9', 'Public report request page must not expose stale phase wording');
assertNotIncludes(reportRequestPage, 'proof upload', 'Public report request page must not promise proof upload');
assertNotIncludes(reportRequestPage, 'placeholder', 'Public report request page should not read like a scaffold placeholder');
assertIncludes(reportRequestPage, 'before any detailed report is generated or released', 'Report request page preserves manual release boundary');

const renderPdf = 'src/lib/reports/render-pdf.ts';
assertIncludes(renderPdf, "import('puppeteer-core')", 'PDF renderer uses puppeteer-core for serverless runtime');
assertIncludes(renderPdf, "import('@sparticuz/chromium')", 'PDF renderer uses packaged Chromium for Vercel');
assertIncludes(renderPdf, 'executablePath: await chromium.default.executablePath()', 'PDF renderer resolves Chromium executable path explicitly');
assertNotIncludes(renderPdf, "import('puppeteer')", 'PDF renderer must not rely on missing bundled Puppeteer Chrome');

const generate = 'src/app/api/admin/orders/[orderReference]/generate-report/route.ts';
assertIncludes(generate, 'REPORT_TYPE_BY_PRODUCT_CODE', 'Generate route maps product code to report type');
assertIncludes(generate, 'mk_validated_assessment', 'Generate route supports MK validated product code');
assertIncludes(generate, 'template_id: template.id', 'Generate route stores required template id');
assertIncludes(generate, ".eq('report_type', reportType)", 'Generate route loads template and versions by actual report type');
assertIncludes(generate, ".eq('assessment_id', assembled.scoreRun.assessmentId)", 'Generate route versions by assessment/report type constraint');
assertNotIncludes(generate, ".eq('order_id', assembled.orderId)", 'Generate route must not version by order only');
assertIncludes(generate, 'renderHtmlToPdfBuffer', 'Generate route renders PDF');
assertIncludes(generate, "from('reports')", 'Generate route writes report record');
assertIncludes(generate, 'supersedes_report_id', 'Regeneration supersedes without overwrite');
assertIncludes(generate, "status: 'generated'", 'Generated report status is explicit');
assertIncludes(generate, "from('report_events')", 'Report events are recorded');
assertIncludes(generate, "from('audit_logs')", 'Audit logs are recorded');
assertNotIncludes(generate, 'PayFast', 'No payment gateway added');
assertNotIncludes(generate, 'proof upload', 'No proof upload added');

const orderPage = 'src/app/admin/orders/[orderReference]/page.tsx';
assertIncludes(orderPage, 'Generate report version', 'Order detail exposes controlled generation');
assertIncludes(orderPage, "order.status === 'payment_received'", 'Order detail gates generation on payment_received');
assertIncludes(orderPage, 'Payment received does not automatically generate', 'Finance and report generation remain separate');

const download = 'src/app/api/admin/reports/[reportId]/download/route.ts';
assertIncludes(download, 'createSignedUrl', 'Download route uses signed URL');
assertIncludes(download, '300', 'Signed URL has short TTL');
assertNotIncludes(download, 'publicUrl', 'Download route does not expose permanent public URL');

const template = read('src/lib/reports/templates/report-template.ts');
assert(template.includes('False Comfort'), 'Template includes False Comfort section');
assert(template.includes('Leadership roadmap'), 'Template includes leadership roadmap');
assert(template.includes('Methodology and limitations'), 'Template includes limitations');
assert(!/\bD\d{1,2}-Q\d{2}\b|EXP-\d{2}|REC-\d{2}/.test(template), 'Template must not hard-code customer-facing internal codes');

console.log('Phase 10 premium report tests passed.');
