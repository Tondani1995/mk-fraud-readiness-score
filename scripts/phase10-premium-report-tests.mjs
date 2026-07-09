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
  'supabase/migrations/0011_phase10_pdf_report_engine_additions.sql',
  'docs/v1/phase-exit-cards/phase-10-pdf-report-engine.md'
];
for (const file of required) assert(exists(file), `${file} must exist`);

const migration = 'supabase/migrations/0011_phase10_pdf_report_engine_additions.sql';
assertIncludes(migration, 'report_templates', 'Migration seeds report template');
assertIncludes(migration, 'generated-reports', 'Migration creates/locks private report bucket');
assertIncludes(migration, 'actions_json', 'Migration respects content block schema');
assertIncludes(migration, "'draft'", 'Starter content remains draft');
assertIncludes(migration, 'payment_gateway":false', 'No gateway boundary is recorded');
assertNotIncludes(migration, "'active', 1),", 'Content blocks are not activated by migration');

const assemble = 'src/lib/reports/assemble-report-data.ts';
assertIncludes(assemble, 'score_runs', 'Assembly reads persisted score_runs');
assertIncludes(assemble, 'score_domain_results', 'Assembly reads persisted score_domain_results');
assertIncludes(assemble, 'score_question_traces', 'Assembly reads persisted score_question_traces');
assertIncludes(assemble, 'payment_received', 'Report generation is gated on payment_received');
assert(!/overallScore\s*[+\-*/]/.test(read(assemble)), 'Assembly must not recalculate the overall score');

const generate = 'src/app/api/admin/orders/[orderReference]/generate-report/route.ts';
assertIncludes(generate, 'template_id: template.id', 'Generate route stores required template id');
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
